const express = require("express");
const request = require("supertest");
const { createRateLimiter, createPublicRateLimiter } = require("../../../src/middlewares/rateLimit");

// A minimal app with the limiter in front of one route
const appWith = (options, limiter = createRateLimiter(options)) => {
  const app = express();
  app.set("trust proxy", 1);
  app.get("/limited", limiter, (_req, res) => res.json({ success: true }));
  return app;
};

describe("createRateLimiter", () => {
  const originalMax = process.env.AUTH_RATE_LIMIT_MAX;
  afterEach(() => {
    if (originalMax === undefined) delete process.env.AUTH_RATE_LIMIT_MAX;
    else process.env.AUTH_RATE_LIMIT_MAX = originalMax;
  });

  it("allows requests up to the limit, then responds 429 in the API's error envelope", async () => {
    const app = appWith({ limit: 2 });

    expect((await request(app).get("/limited")).status).toBe(200);
    expect((await request(app).get("/limited")).status).toBe(200);
    const blocked = await request(app).get("/limited");

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ success: false, error: "Too many attempts. Please wait a few minutes and try again." });
    // A refusal must never be cached and served in place of a later answer
    expect(blocked.headers["cache-control"]).toBe("no-store");
  });

  it("tells clients their limit through the standard RateLimit headers", async () => {
    const res = await request(appWith({ limit: 5, windowMs: 60_000 })).get("/limited");
    // draft-8 format: "<policy>"; r=<remaining>; t=<seconds until reset>
    expect(res.headers.ratelimit).toBe('"5-in-1min"; r=4; t=60');
    expect(res.headers["ratelimit-policy"]).toMatch(/^"5-in-1min"; q=5; w=60/);
    expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
  });

  it("counts each client address separately behind the proxy", async () => {
    const app = appWith({ limit: 1 });
    expect((await request(app).get("/limited").set("X-Forwarded-For", "198.51.100.1")).status).toBe(200);
    expect((await request(app).get("/limited").set("X-Forwarded-For", "198.51.100.1")).status).toBe(429);
    expect((await request(app).get("/limited").set("X-Forwarded-For", "198.51.100.2")).status).toBe(200);
  });

  it("defaults to 100 requests per window, overridable with AUTH_RATE_LIMIT_MAX", async () => {
    delete process.env.AUTH_RATE_LIMIT_MAX;
    expect((await request(appWith()).get("/limited")).headers.ratelimit).toMatch(/^"100-in-15min"; r=99;/);

    process.env.AUTH_RATE_LIMIT_MAX = "7";
    expect((await request(appWith()).get("/limited")).headers.ratelimit).toMatch(/^"7-in-15min"; r=6;/);
  });
});

describe("createPublicRateLimiter", () => {
  const originalMax = process.env.PUBLIC_RATE_LIMIT_MAX;
  afterEach(() => {
    if (originalMax === undefined) delete process.env.PUBLIC_RATE_LIMIT_MAX;
    else process.env.PUBLIC_RATE_LIMIT_MAX = originalMax;
  });

  it("defaults to 300 requests per 15 minutes, overridable with PUBLIC_RATE_LIMIT_MAX", async () => {
    delete process.env.PUBLIC_RATE_LIMIT_MAX;
    expect((await request(appWith({}, createPublicRateLimiter())).get("/limited")).headers.ratelimit).toMatch(/^"300-in-15min"; r=299;/);

    process.env.PUBLIC_RATE_LIMIT_MAX = "2";
    const app = appWith({}, createPublicRateLimiter());
    await request(app).get("/limited");
    await request(app).get("/limited");
    const blocked = await request(app).get("/limited");

    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/^Too many requests\. The public API allows 300 requests per 15 minutes/);
  });

  it("is separate from the sign-up limit", async () => {
    const authMax = process.env.AUTH_RATE_LIMIT_MAX;
    process.env.PUBLIC_RATE_LIMIT_MAX = "1";
    process.env.AUTH_RATE_LIMIT_MAX = "5";
    const app = express();
    app.set("trust proxy", 1);
    app.get("/public", createPublicRateLimiter(), (_req, res) => res.json({ success: true }));
    app.get("/auth", createRateLimiter(), (_req, res) => res.json({ success: true }));

    expect((await request(app).get("/public")).status).toBe(200);
    expect((await request(app).get("/public")).status).toBe(429);
    expect((await request(app).get("/auth")).status).toBe(200);
    if (authMax === undefined) delete process.env.AUTH_RATE_LIMIT_MAX;
    else process.env.AUTH_RATE_LIMIT_MAX = authMax;
  });
});
