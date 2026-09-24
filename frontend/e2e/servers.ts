// Starts everything the E2E tests run against, and stops it again:
//
//   1. a real PostgreSQL database (PGlite, in this process) built from the
//      project's migrations and seeded with known data
//   2. the mock Supabase server (auth + storage)
//   3. the real Express backend
//   4. the real Vite frontend
//
// Global setup and teardown run in the same Playwright process, so the
// handles are kept here and shared between them.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { seedDatabase, seededLogins } from "./seed";
import { seedAuthUsers, startMockSupabase } from "./mock-supabase";
import { PORTS, URLS } from "./test-data";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.join(here, "..");
const backendDir = path.join(frontendDir, "..", "backend");
const migrationsDir = path.join(backendDir, "prisma", "migrations");

type Running = {
  db: PGlite;
  socket: PGLiteSocketServer;
  supabase: Server;
  backend: ChildProcess;
  frontend: ChildProcess;
};

let running: Running | undefined;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls a URL until it answers, so tests never start against a half-ready server. */
// The small CI runner needs considerably longer to get three servers up.
const STARTUP_TIMEOUT_MS = process.env.CI ? 240_000 : 90_000;

async function waitForServer(url: string, name: string, timeoutMs = STARTUP_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await wait(300);
  }
  throw new Error(`${name} did not start within ${timeoutMs / 1000}s (${url})`);
}

function run(args: string[], cwd: string, env: NodeJS.ProcessEnv, label: string) {
  // Started with this Node binary, never through a shell or npx wrapper, so
  // the handle below is the process that actually has to be stopped again
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Server output is kept quiet unless a test run is debugged
  const log = (chunk: Buffer) => {
    if (process.env.E2E_VERBOSE) process.stdout.write(`[${label}] ${chunk}`);
  };
  child.stdout?.on("data", log);
  child.stderr?.on("data", log);
  return child;
}

const viteBin = path.join(frontendDir, "node_modules", "vite", "bin", "vite.js");

/** Frees a port left busy by a server an interrupted run never stopped. */
function freePort(port: number) {
  try {
    if (process.platform === "win32") {
      const lines = execFileSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" })
        .split(/\r?\n/)
        .filter((line) => line.includes(`:${port} `) && line.includes("LISTENING"));
      for (const pid of new Set(lines.map((line) => line.trim().split(/\s+/).pop()))) {
        if (pid && pid !== "0") execFileSync("taskkill", ["/pid", pid, "/T", "/F"], { stdio: "ignore" });
      }
    } else {
      const pids = execFileSync("lsof", ["-ti", `tcp:${port}`], { encoding: "utf8" }).split(/\s+/);
      for (const pid of pids) if (pid) process.kill(Number(pid), "SIGKILL");
    }
  } catch {
    // Nothing was listening, which is the normal case
  }
}

/** Builds the frontend once, with the test settings compiled in. */
function build(env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = run([viteBin, "build"], frontendDir, env, "build");
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Frontend build failed with exit code ${code}`)),
    );
  });
}

export async function startAll() {
  // 0. Clear anything an interrupted run left behind: a stale backend would
  // otherwise answer the health check while pointing at a database that is
  // long gone
  for (const port of [PORTS.backend, PORTS.frontend, PORTS.supabase]) freePort(port);

  // 1. Database: apply every migration, then seed
  const db = await PGlite.create();
  const migrations = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const name of migrations) {
    await db.exec(fs.readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8"));
  }
  await seedDatabase(db);

  const socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 20 });
  await socket.start();
  const databaseUrl = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?sslmode=disable`;

  // 2. Supabase stand-in, with a login for every seeded account
  seedAuthUsers(seededLogins);
  const supabase = await startMockSupabase(PORTS.supabase);

  // 3. The real backend, pointed at both
  const backend = run(["--import", "tsx", "server.ts"], backendDir, {
    NODE_ENV: "test",
    PORT: String(PORTS.backend),
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
    // The test database serves one connection at a time
    DATABASE_POOL_MAX: "1",
    SUPABASE_URL: URLS.supabase,
    SUPABASE_SERVICE_ROLE_KEY: "e2e-service-key",
    SUPABASE_SERVICE_KEY: "e2e-service-key",
    ORGANISER_SECRET: "e2e-secret",
    FRONTEND_URL: URLS.app,
    // The lifecycle job must not move rounds while a test is using them
    LIFECYCLE_INTERVAL_MS: String(24 * 60 * 60 * 1000),
    SMTP_HOST: "smtp.invalid",
    SMTP_USER: "",
    SMTP_PASS: "",
    AUTH_RATE_LIMIT_MAX: "100000",
  }, "backend");

  // 4. The real frontend: built the way it is deployed, then served.
  // (The dev server reloads the page when it first optimises dependencies,
  // which can interrupt a form submission mid-test.)
  const viteEnv = {
    VITE_API_URL: URLS.api,
    VITE_SUPABASE_URL: URLS.supabase,
    VITE_SUPABASE_ANON_KEY: "e2e-anon-key",
  };
  await build(viteEnv);
  const frontend = run(
    [viteBin, "preview", "--port", String(PORTS.frontend), "--strictPort", "--host", "127.0.0.1"],
    frontendDir,
    viteEnv,
    "frontend",
  );

  running = { db, socket, supabase, backend, frontend };

  await waitForServer(`${URLS.supabase}/__test/health`, "Mock Supabase");
  await waitForServer(`${URLS.api}/health`, "Backend");
  await waitForServer(URLS.app, "Frontend");
}

export async function stopAll() {
  if (!running) return;
  const { db, socket, supabase, backend, frontend } = running;
  running = undefined;

  for (const child of [frontend, backend]) {
    if (child.pid && !child.killed) {
      if (process.platform === "win32") {
        // Windows has no signals: end the process and anything it started
        try {
          execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        } catch {
          // Already gone
        }
      } else {
        child.kill("SIGTERM");
      }
    }
  }
  // Belt and braces, so the next run never meets a leftover server
  for (const port of [PORTS.backend, PORTS.frontend]) freePort(port);

  await new Promise<void>((resolve) => supabase.close(() => resolve()));
  await socket.stop();
  await db.close();
}
