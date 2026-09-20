// A small stand-in for Supabase Auth and Storage, served over real HTTP.
//
// The E2E tests drive the real frontend and backend, which both talk to
// Supabase: the browser signs in and resets passwords, and the backend
// verifies tokens, creates and deletes logins, and stores papers. Pointing
// both at this server keeps the tests self-contained — no Supabase project,
// no network, no shared state between runs.
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";

type MockUser = { id: string; email: string; password: string };

const users = new Map<string, MockUser>(); // by id
const tokens = new Map<string, string>(); // access token -> user id
const recoveryTokens = new Map<string, string>(); // token -> user id
const files = new Map<string, { body: Buffer; contentType: string }>();

const byEmail = (email: string) =>
  [...users.values()].find((u) => u.email.toLowerCase() === email.toLowerCase());

const issueToken = (userId: string) => {
  const token = `e2e-access-${randomUUID()}`;
  tokens.set(token, userId);
  return token;
};

const publicUser = (user: MockUser) => ({
  id: user.id,
  aud: "authenticated",
  role: "authenticated",
  email: user.email,
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: "email" },
  user_metadata: {},
  identities: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

const session = (user: MockUser) => ({
  access_token: issueToken(user.id),
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: `e2e-refresh-${randomUUID()}`,
  user: publicUser(user),
});

const bearerUser = (authorization?: string) => {
  const token = authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const id = tokens.get(token);
  return id ? users.get(id) : undefined;
};

/** Adds the accounts the seeded database expects. */
export function seedAuthUsers(seeded: MockUser[]) {
  users.clear();
  tokens.clear();
  recoveryTokens.clear();
  files.clear();
  for (const user of seeded) users.set(user.id, { ...user });
}

export function startMockSupabase(port: number): Promise<Server> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks);
    const json = () => {
      try {
        return JSON.parse(raw.toString("utf8") || "{}");
      } catch {
        return {};
      }
    };

    const send = (status: number, body?: unknown) => {
      res.writeHead(status, {
        "content-type": "application/json",
        // The browser calls this server directly from the app's origin
        "access-control-allow-origin": req.headers.origin ?? "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };

    const authError = (status: number, message: string) =>
      send(status, { error: message, error_description: message, msg: message, message, code: status });

    if (req.method === "OPTIONS") return send(204);

    const path = url.pathname;

    // ── Auth ──────────────────────────────────────────────────────────
    if (path === "/auth/v1/token" && req.method === "POST") {
      const grant = url.searchParams.get("grant_type");
      if (grant === "password") {
        const { email, password } = json();
        const user = byEmail(String(email ?? ""));
        if (!user || user.password !== password) {
          return authError(400, "Invalid login credentials");
        }
        return send(200, session(user));
      }
      return authError(400, `Unsupported grant type: ${grant}`);
    }

    if (path === "/auth/v1/user" && req.method === "GET") {
      const user = bearerUser(req.headers.authorization);
      if (!user) return authError(401, "invalid claim: missing sub claim");
      return send(200, publicUser(user));
    }

    if (path === "/auth/v1/user" && req.method === "PUT") {
      const user = bearerUser(req.headers.authorization);
      if (!user) return authError(401, "Auth session missing!");
      const { password } = json();
      if (password) user.password = String(password);
      return send(200, publicUser(user));
    }

    if (path === "/auth/v1/logout" && req.method === "POST") {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      tokens.delete(token);
      return send(204);
    }

    // Password reset: issue a one-time recovery token. The test reads it from
    // /__test/recovery, standing in for the emailed link.
    if (path === "/auth/v1/recover" && req.method === "POST") {
      const { email } = json();
      const user = byEmail(String(email ?? ""));
      if (user) recoveryTokens.set(`e2e-recovery-${user.id}`, user.id);
      return send(200, {});
    }

    if (path === "/auth/v1/verify" && req.method === "POST") {
      const { token_hash: tokenHash, type } = json();
      const userId = recoveryTokens.get(String(tokenHash ?? ""));
      const user = userId ? users.get(userId) : undefined;
      if (type !== "recovery" || !user) {
        return authError(403, "Email link is invalid or has expired");
      }
      // Left valid for the rest of the test: a page that mounts twice
      // (React development mode) would otherwise fail on its second attempt
      return send(200, session(user));
    }

    // ── Auth admin (called by the backend with the service key) ───────
    if (path === "/auth/v1/admin/users" && req.method === "POST") {
      const { email, password } = json();
      if (byEmail(String(email ?? ""))) {
        return authError(422, "A user with this email address has already been registered");
      }
      const user: MockUser = { id: randomUUID(), email: String(email), password: String(password) };
      users.set(user.id, user);
      return send(200, publicUser(user));
    }

    if (path.startsWith("/auth/v1/admin/users/") && req.method === "DELETE") {
      const id = path.split("/").pop() ?? "";
      users.delete(id);
      for (const [token, userId] of tokens) if (userId === id) tokens.delete(token);
      return send(200, {});
    }

    // ── Storage ───────────────────────────────────────────────────────
    // Upload: POST /storage/v1/object/<bucket>/<path>
    if (path.startsWith("/storage/v1/object/") && (req.method === "POST" || req.method === "PUT")) {
      const isSigning = path.startsWith("/storage/v1/object/sign/");
      const key = path.replace("/storage/v1/object/", "").replace(/^sign\//, "");

      if (isSigning) {
        if (!files.has(key)) return send(404, { error: "Object not found", message: "Object not found" });
        return send(200, { signedURL: `/object/sign/${key}?token=e2e-signed` });
      }

      files.set(key, {
        body: raw,
        contentType: String(req.headers["content-type"] ?? "application/octet-stream"),
      });
      return send(200, { Key: key });
    }

    // Download through a signed link
    if (path.startsWith("/storage/v1/object/sign/") && req.method === "GET") {
      const key = path.replace("/storage/v1/object/sign/", "");
      const file = files.get(key);
      if (!file) return send(404, { error: "Object not found" });
      res.writeHead(200, { "content-type": file.contentType });
      return res.end(file.body);
    }

    // ── Test helpers ──────────────────────────────────────────────────
    // Stands in for opening the password reset email
    if (path === "/__test/recovery" && req.method === "GET") {
      const email = url.searchParams.get("email") ?? "";
      const user = byEmail(email);
      const token = [...recoveryTokens.entries()].find(([, id]) => id === user?.id)?.[0];
      return send(200, { token: token ?? null });
    }

    if (path === "/__test/health" && req.method === "GET") return send(200, { status: "ok" });

    return send(404, { error: `Mock Supabase has no route for ${req.method} ${path}` });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
