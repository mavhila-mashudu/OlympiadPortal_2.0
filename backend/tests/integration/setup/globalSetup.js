// Starts a throwaway Postgres for the integration suite.
//
// PGlite is real Postgres compiled to WebAssembly, running inside this Node
// process: no Docker, no local install, nothing to clean up. The schema comes
// from applying every migration in prisma/migrations in order, exactly as
// `prisma migrate deploy` would on a fresh database. A small socket server
// exposes it on localhost so the app's own Prisma client (src/config/database.ts,
// using the same pg driver adapter as production) connects to it unchanged.
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const { PGLiteSocketServer } = require("@electric-sql/pglite-socket");

const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "prisma", "migrations");

module.exports = async () => {
  const db = await PGlite.create();

  const migrations = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const name of migrations) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8"));
  }

  const server = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 20 });
  await server.start();

  const url = `postgresql://postgres:postgres@${server.getServerConn()}/postgres?sslmode=disable`;

  // Set every variable the app reads BEFORE any module loads dotenv, so a
  // developer's backend/.env (which points at the real Supabase database and
  // SMTP account) can never be picked up by the tests. dotenv doesn't
  // override variables that are already set.
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: url,
    DIRECT_URL: url,
    SUPABASE_URL: "http://supabase.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "integration-test-key",
    SUPABASE_SERVICE_KEY: "integration-test-key",
    FRONTEND_URL: "https://olympiad.test",
    SMTP_HOST: "smtp.invalid",
    SMTP_PORT: "2525",
    SMTP_SECURE: "false",
    SMTP_USER: "",
    SMTP_PASS: "",
    LIFECYCLE_INTERVAL_MS: "3600000",
    // Tests make many auth requests from one address
    AUTH_RATE_LIMIT_MAX: "100000",
  });

  globalThis.__INTEGRATION_DB__ = { db, server, migrations };
};
