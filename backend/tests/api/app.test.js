// App-wide HTTP behaviour: health check, unknown routes, security headers,
// CORS, request parsing and the authentication middleware.
const prisma = require("../../src/config/database").default;
const f = require("../integration/helpers/factories");
const { supabase } = require("../integration/helpers/externalMocks");
const { api, as, expectError, expectOk } = require("./helpers/api");

describe("GET /health", () => {
  it("reports the API is up without needing a token", async () => {
    const res = await api().get("/health");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({
      status: "ok",
      timestamp: expect.any(String),
      environment: "test",
      frontend_url: "https://olympiad.test",
    });
    expect(new Date(res.body.timestamp).toString()).not.toBe("Invalid Date");
  });
});

describe("GET /", () => {
  it("returns the welcome message", async () => {
    const res = await api().get("/");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: expect.stringContaining("Olympiad Portal API") });
  });
});

describe("unknown routes", () => {
  it.each([
    ["get", "/does-not-exist"],
    ["post", "/health"],
    ["delete", "/"],
  ])("%s %s responds 404 in the standard error envelope", async (method, path) => {
    expectError(await api()[method](path), 404, "Route not found");
  });

  it("asks for a token before revealing whether a protected path exists", async () => {
    // Routers that guard a whole prefix authenticate first
    expectError(await api().put("/olympiads"), 401, "No token provided");
    const organiser = await f.createOrganiser();
    expectError(await as(organiser).put("/olympiads"), 404, "Route not found");
  });
});

describe("security headers (helmet)", () => {
  it("sets the standard hardening headers and hides the framework", async () => {
    const res = await api().get("/health");
    expect(res.headers).toMatchObject({
      "x-content-type-options": "nosniff",
      "x-frame-options": "SAMEORIGIN",
      "strict-transport-security": expect.stringContaining("max-age="),
      "content-security-policy": expect.any(String),
    });
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("CORS", () => {
  it("allows the configured frontend origin with credentials", async () => {
    const res = await api().get("/health").set("Origin", "https://olympiad.test");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("https://olympiad.test");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("answers a preflight request from the frontend", async () => {
    const res = await api()
      .options("/olympiads")
      .set("Origin", "https://olympiad.test")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("https://olympiad.test");
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
  });

  it("allows the local dev server outside production", async () => {
    const res = await api().get("/health").set("Origin", "http://localhost:5173");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("refuses other browser origins with 403", async () => {
    const res = await api().get("/health").set("Origin", "https://evil.example");
    expectError(res, 403, "Origin is not allowed by CORS");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("serves clients that send no Origin (curl, Postman, server-to-server)", async () => {
    expect((await api().get("/health")).status).toBe(200);
  });
});

describe("rate limiting", () => {
  it.each([
    ["post", "/auth/register/organiser"],
    ["post", "/auth/register"],
    ["get", "/auth/schools"],
  ])("limits requests to %s %s per client", async (method, path) => {
    const res = await api()[method](path).send({});
    // The API tests raise the limit (AUTH_RATE_LIMIT_MAX); production uses 100 per 15 minutes
    expect(res.headers.ratelimit).toMatch(/^"100000-in-15min"; r=\d+; t=\d+$/);
  });

  it("doesn't limit the rest of the API", async () => {
    const organiser = await f.createOrganiser();
    expect((await api().get("/health")).headers.ratelimit).toBeUndefined();
    expect((await as(organiser).get("/auth/me")).headers.ratelimit).toBeUndefined();
  });
});

describe("request parsing", () => {
  it("rejects malformed JSON with 400", async () => {
    const organiser = await f.createOrganiser();
    const res = await as(organiser).post("/olympiads").set("Content-Type", "application/json").send('{"name": ');
    expectError(res, 400, "Malformed JSON in request body");
  });

  it("accepts URL-encoded form bodies", async () => {
    const organiser = await f.createOrganiser();
    const res = await as(organiser).post("/olympiads").type("form").send({ name: "Form Olympiad" });
    expect(expectOk(res, 201).olympiad.name).toBe("Form Olympiad");
  });

  // Body ids are all validated as UUIDs before they reach Prisma (a bad one
  // is a 422), so only path ids can produce Prisma's malformed-uuid error.
  it.each([
    ["a path id", (organiser) => as(organiser).get("/olympiads/not-a-uuid")],
    ["a nested path id", (organiser) => as(organiser).get("/rounds/123/exam-status")],
  ])("responds 400 to %s that isn't a UUID, without leaking internals", async (_label, send) => {
    const res = await send(await f.createOrganiser());
    expectError(res, 400, "Invalid ID format");
    expect(JSON.stringify(res.body)).not.toMatch(/prisma|\.js|invocation/i);
  });
});

describe("authentication middleware", () => {
  it("responds 401 without an Authorization header", async () => {
    expectError(await api().get("/auth/me"), 401, "No token provided");
  });

  it.each(["Token abc", "Basic dXNlcjpwYXNz", "bearer abc", "Bearer"])(
    "responds 401 to a non-Bearer header %p",
    async (header) => {
      expectError(await api().get("/auth/me").set("Authorization", header), 401, "No token provided");
    },
  );

  it("responds 401 when Supabase rejects the token", async () => {
    const res = await api().get("/auth/me").set("Authorization", "Bearer forged.jwt.token");
    expectError(res, 401, "Invalid or expired token");
    expect(supabase.auth.getUser).toHaveBeenCalledWith("forged.jwt.token");
  });

  it("responds 401 for a valid Supabase user with no account in our database", async () => {
    const ghost = { id: "8b0f6b8c-6d7e-4a57-9d3c-4c4e1f0b9a11" };
    expectError(await as(ghost).get("/auth/me"), 401, "Account not found or deleted");
  });

  it("responds 401 for a soft-deleted account", async () => {
    const organiser = await f.createOrganiser({ deleted_at: new Date() });
    expectError(await as(organiser).get("/auth/me"), 401, "Account not found or deleted");
  });

  it("lets a valid token through", async () => {
    const organiser = await f.createOrganiser();
    expect(expectOk(await as(organiser).get("/auth/me")).user.id).toBe(organiser.id);
  });

  it("checks the token on every request (no cached session)", async () => {
    const organiser = await f.createOrganiser();
    expectOk(await as(organiser).get("/olympiads"));
    await prisma.users.update({ where: { id: organiser.id }, data: { deleted_at: new Date() } });
    expectError(await as(organiser).get("/olympiads"), 401, "Account not found or deleted");
  });
});
