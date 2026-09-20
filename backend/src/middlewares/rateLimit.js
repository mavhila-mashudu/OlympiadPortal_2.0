// @ts-nocheck
const { rateLimit } = require("express-rate-limit");

// Limits requests per client IP. Used on the public auth endpoints, where
// invitation codes could otherwise be guessed by trying them one after another.
//
// The default allows 100 requests per 15 minutes: plenty for a whole class
// registering from one school network, far too few to search the codes.
// AUTH_RATE_LIMIT_MAX overrides the limit (the API tests raise it).
const createRateLimiter = ({
  windowMs = 15 * 60 * 1000,
  limit = Number(process.env.AUTH_RATE_LIMIT_MAX) || 100,
} = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res, _next, options) => {
      res.status(options.statusCode).json({
        success: false,
        error: "Too many attempts. Please wait a few minutes and try again.",
      });
    },
  });

module.exports = { createRateLimiter };
