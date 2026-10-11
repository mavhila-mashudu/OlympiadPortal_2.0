// @ts-nocheck
const { rateLimit } = require('express-rate-limit');

// Limits requests per client IP. Used on the public auth endpoints, where
// invitation codes could otherwise be guessed by trying them one after another.
//
// The default allows 100 requests per 15 minutes: plenty for a whole class
// registering from one school network, far too few to search the codes.
// AUTH_RATE_LIMIT_MAX overrides the limit (the API tests raise it).
const createRateLimiter = ({
    windowMs = 15 * 60 * 1000,
    limit = Number(process.env.AUTH_RATE_LIMIT_MAX) || 100,
    message = 'Too many attempts. Please wait a few minutes and try again.',
} = {}) =>
    rateLimit({
        windowMs,
        limit,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        handler: (_req, res, _next, options) => {
            // Never cached, so a later request isn't answered with this refusal
            res.set('Cache-Control', 'no-store');
            res.status(options.statusCode).json({
                success: false,
                error: message,
            });
        },
    });

// The public developer API has no accounts to throttle, so each client IP
// gets 300 requests per 15 minutes: a page refresh every few seconds, but not
// a script hammering the database. PUBLIC_RATE_LIMIT_MAX overrides it.
const createPublicRateLimiter = () =>
    createRateLimiter({
        limit: Number(process.env.PUBLIC_RATE_LIMIT_MAX) || 300,
        message:
            'Too many requests. The public API allows 300 requests per 15 minutes per client; see the RateLimit headers for when to retry.',
    });

// One instance shared by every public auth endpoint — signup, invitation
// check, password reset and the signup form's school list. express-rate-limit
// counts per limiter instance, so an instance per route would let a code
// guesser multiply the allowance by the number of routes.
const publicAuthLimiter = createRateLimiter();

module.exports = { createRateLimiter, createPublicRateLimiter, publicAuthLimiter };
