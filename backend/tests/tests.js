import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ─────────────────────────────────────────────────────────────
// Pure modules — safe to import directly (no DB dependency)
// ─────────────────────────────────────────────────────────────
const {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
} = require("../src/errors/AppError");

const errorHandler = require("../src/middlewares/errorHandler");

const { slugify } = require("../src/utils/slugify");

const {
  generateInvitationCode,
  getInvitationExpiry,
} = require("../src/utils/invitations");

// ─────────────────────────────────────────────────────────────
// Replicate app routes for endpoint tests (avoids loading DB-
// dependent route modules that use CommonJS require).
// ─────────────────────────────────────────────────────────────
function buildTestApp() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
    });
  });

  app.get("/", (_req, res) => {
    res.json({ message: "Welcome to Olympiad Portal API" });
  });

  // Mount the real error handler
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: "Route not found" });
  });

  app.use(errorHandler);

  return app;
}

// ─────────────────────────────────────────────────────────────
// Pure scoring helpers (mirror markingService logic)
// ─────────────────────────────────────────────────────────────
function scoreMCQ(answerValue, correctOption, maxPoints) {
  if (!correctOption) return 0;
  return answerValue === correctOption ? maxPoints : 0;
}

function totalScore(scores) {
  return scores.reduce((sum, s) => sum + s, 0);
}

// ─────────────────────────────────────────────────────────────
// requireRole middleware (testable without DB)
// ─────────────────────────────────────────────────────────────
const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError("Not authenticated"));
    }
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError("Insufficient permissions"));
    }
    next();
  };

// ═══════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// 1. EXPRESS ENDPOINTS
// ─────────────────────────────────────────────────────────────
describe("Express endpoints", () => {
  const app = buildTestApp();

  describe("GET /health", () => {
    it("returns 200 with status ok", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body).toHaveProperty("timestamp");
      expect(res.body).toHaveProperty("environment");
    });

    it("returns a valid ISO timestamp", async () => {
      const res = await request(app).get("/health");
      const ts = new Date(res.body.timestamp);
      expect(ts.toISOString()).toBe(res.body.timestamp);
    });
  });

  describe("GET /", () => {
    it("returns 200 with a message string", async () => {
      const res = await request(app).get("/");
      expect(res.status).toBe(200);
      expect(typeof res.body.message).toBe("string");
    });
  });

  describe("404 handler", () => {
    it("returns 404 JSON for unknown GET routes", async () => {
      const res = await request(app).get("/nonexistent");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, error: "Route not found" });
    });

    it("returns 404 for POST to unknown routes", async () => {
      const res = await request(app).post("/unknown");
      expect(res.status).toBe(404);
    });
  });
});

// ─────────────────────────────────────────────────────────────
// 2. APP ERROR CLASSES
// ─────────────────────────────────────────────────────────────
describe("AppError classes", () => {
  it("AppError sets message, statusCode, and isOperational", () => {
    const err = new AppError("boom", 500);
    expect(err.message).toBe("boom");
    expect(err.statusCode).toBe(500);
    expect(err.isOperational).toBe(true);
    expect(err).toBeInstanceOf(Error);
  });

  it("BadRequestError defaults to 400", () => {
    const err = new BadRequestError();
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe("Bad request");
  });

  it("BadRequestError accepts a custom message", () => {
    const err = new BadRequestError("Missing field");
    expect(err.message).toBe("Missing field");
    expect(err.statusCode).toBe(400);
  });

  it("UnauthorizedError defaults to 401", () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
  });

  it("ForbiddenError defaults to 403", () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
  });

  it("NotFoundError defaults to 404", () => {
    const err = new NotFoundError();
    expect(err.statusCode).toBe(404);
  });

  it("ConflictError defaults to 409", () => {
    const err = new ConflictError();
    expect(err.statusCode).toBe(409);
  });

  it("ValidationError defaults to 422", () => {
    const err = new ValidationError();
    expect(err.statusCode).toBe(422);
  });

  it("all error classes are instances of AppError", () => {
    expect(new BadRequestError()).toBeInstanceOf(AppError);
    expect(new UnauthorizedError()).toBeInstanceOf(AppError);
    expect(new ForbiddenError()).toBeInstanceOf(AppError);
    expect(new NotFoundError()).toBeInstanceOf(AppError);
    expect(new ConflictError()).toBeInstanceOf(AppError);
    expect(new ValidationError()).toBeInstanceOf(AppError);
  });
});

// ─────────────────────────────────────────────────────────────
// 3. ERROR HANDLER MIDDLEWARE
// ─────────────────────────────────────────────────────────────
describe("errorHandler middleware", () => {
  let res;
  const req = { url: "/test", method: "GET" };
  const next = vi.fn();

  beforeEach(() => {
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  it("returns operational error with its status code", () => {
    const err = new NotFoundError("Item missing");
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Item missing",
    });
  });

  it("handles Prisma unique constraint (P2002)", () => {
    const err = { code: "P2002", message: "duplicate" };
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "A record with that value already exists",
    });
  });

  it("handles Prisma record not found (P2025)", () => {
    const err = { code: "P2025", message: "gone" };
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("handles JsonWebTokenError", () => {
    const err = { name: "JsonWebTokenError", message: "bad jwt" };
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Invalid token",
    });
  });

  it("handles TokenExpiredError", () => {
    const err = { name: "TokenExpiredError", message: "expired" };
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Token expired",
    });
  });

  it("returns 500 for unknown errors", () => {
    const err = new Error("random failure");
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─────────────────────────────────────────────────────────────
// 4. SLUGIFY UTILITY
// ─────────────────────────────────────────────────────────────
describe("slugify", () => {
  it("converts basic text to slug", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("handles special characters", () => {
    expect(slugify("Hello World! 123")).toBe("hello-world-123");
  });

  it("collapses multiple spaces", () => {
    expect(slugify("hello   world")).toBe("hello-world");
  });

  it("trims leading and trailing whitespace", () => {
    expect(slugify("  hello world  ")).toBe("hello-world");
  });

  it("handles uppercase", () => {
    expect(slugify("UPPER CASE")).toBe("upper-case");
  });

  it("collapses multiple hyphens", () => {
    expect(slugify("hello---world")).toBe("hello-world");
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });

  it("handles numbers", () => {
    expect(slugify("Round 1 — Qualifier")).toBe("round-1-qualifier");
  });
});

// ─────────────────────────────────────────────────────────────
// 5. INVITATION CODE GENERATION
// ─────────────────────────────────────────────────────────────
describe("generateInvitationCode", () => {
  it("generates a school code with SCH prefix", () => {
    const code = generateInvitationCode("school");
    expect(code).toMatch(/^SCH-[A-F0-9]{4}-[A-F0-9]{4}$/);
  });

  it("generates an educator code with EDU prefix", () => {
    const code = generateInvitationCode("educator");
    expect(code).toMatch(/^EDU-[A-F0-9]{4}-[A-F0-9]{4}$/);
  });

  it("generates a student code with STU prefix", () => {
    const code = generateInvitationCode("student");
    expect(code).toMatch(/^STU-[A-F0-9]{4}-[A-F0-9]{4}$/);
  });

  it("generates unique codes each time", () => {
    const codes = new Set(
      Array.from({ length: 20 }, () => generateInvitationCode("school")),
    );
    expect(codes.size).toBe(20);
  });
});

// ─────────────────────────────────────────────────────────────
// 6. INVITATION EXPIRY
// ─────────────────────────────────────────────────────────────
describe("getInvitationExpiry", () => {
  it("returns a Date object", () => {
    const expiry = getInvitationExpiry("school");
    expect(expiry).toBeInstanceOf(Date);
  });

  it("school/educator expiry is ~7 days from now", () => {
    const expiry = getInvitationExpiry("school");
    const diffDays = Math.round((expiry - new Date()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(7);
  });

  it("educator expiry is ~7 days from now", () => {
    const expiry = getInvitationExpiry("educator");
    const diffDays = Math.round((expiry - new Date()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(7);
  });

  it("student expiry is ~30 days from now", () => {
    const expiry = getInvitationExpiry("student");
    const diffDays = Math.round((expiry - new Date()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(30);
  });
});

// ─────────────────────────────────────────────────────────────
// 7. MCQ SCORING LOGIC
// ─────────────────────────────────────────────────────────────
describe("scoreMCQ", () => {
  it("awards full points for a correct answer", () => {
    expect(scoreMCQ("B", "B", 5)).toBe(5);
  });

  it("awards 0 for a wrong answer", () => {
    expect(scoreMCQ("A", "B", 5)).toBe(0);
  });

  it("awards 0 when correct_option is null", () => {
    expect(scoreMCQ("A", null, 5)).toBe(0);
  });

  it("is case-sensitive", () => {
    expect(scoreMCQ("a", "A", 5)).toBe(0);
  });

  it("handles string option values", () => {
    expect(scoreMCQ("Paris", "Paris", 10)).toBe(10);
    expect(scoreMCQ("London", "Paris", 10)).toBe(0);
  });

  it("handles 0-point questions", () => {
    expect(scoreMCQ("A", "A", 0)).toBe(0);
  });
});

describe("totalScore", () => {
  it("sums an array of scores", () => {
    expect(totalScore([5, 0, 10, 0, 3])).toBe(18);
  });

  it("returns 0 for an empty array", () => {
    expect(totalScore([])).toBe(0);
  });

  it("handles all-correct paper", () => {
    expect(totalScore([5, 5, 5, 5, 5])).toBe(25);
  });

  it("handles all-wrong paper", () => {
    expect(totalScore([0, 0, 0, 0, 0])).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// 8. requireRole MIDDLEWARE
// ─────────────────────────────────────────────────────────────
describe("requireRole middleware", () => {
  let res, next;

  beforeEach(() => {
    res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    next = vi.fn();
  });

  it("calls next() when user has the required role", () => {
    const req = { user: { role: "organiser" } };
    requireRole("organiser")(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(next).not.toHaveBeenCalledWith(expect.any(Error));
  });

  it("calls next() when user has one of multiple allowed roles", () => {
    const req = { user: { role: "educator" } };
    requireRole("organiser", "educator")(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(next).not.toHaveBeenCalledWith(expect.any(Error));
  });

  it("returns ForbiddenError when role is not allowed", () => {
    const req = { user: { role: "student" } };
    requireRole("organiser")(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.statusCode).toBe(403);
  });

  it("returns UnauthorizedError when no user on request", () => {
    const req = {};
    requireRole("organiser")(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err.statusCode).toBe(401);
  });
});
