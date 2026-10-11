// @ts-nocheck
const prisma = require('../config/database').default;
const supabase = require('../config/supabase');
const crypto = require('crypto');
const { UnauthorizedError, ForbiddenError } = require('../errors/AppError');

// Verifying a token costs a round trip to Supabase plus a profile query, and
// a single page fires several requests with the same token. The resolved
// identity is therefore kept briefly per token (never past the token's own
// expiry), and concurrent requests share one lookup. A user's role and school
// are fixed at signup, so the only change that matters is account deletion,
// which clears the entry (forgetCachedUser). Tests run uncached so each case
// exercises the full verification.
const AUTH_CACHE_TTL_MS = Number(process.env.AUTH_CACHE_TTL_MS ?? 30_000);
const AUTH_CACHE_MAX_ENTRIES = 5_000;
const authCacheEnabled =
    process.env.NODE_ENV !== 'test' && AUTH_CACHE_TTL_MS > 0;
const authCache = new Map();

const tokenKey = (token) =>
    crypto.createHash('sha256').update(token).digest('hex');

const tokenExpiresAt = (token) => {
    try {
        const payload = JSON.parse(
            Buffer.from(token.split('.')[1], 'base64url').toString('utf8')
        );
        return typeof payload.exp === 'number' ? payload.exp * 1000 : Infinity;
    } catch {
        return Infinity;
    }
};

const resolveIdentity = async (token) => {
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
        throw new UnauthorizedError('Invalid or expired token');
    }

    const dbUser = await prisma.users.findUnique({
        where: { id: user.id },
        include: {
            educators: { select: { id: true, school_id: true } },
            entrants: { select: { id: true, school_id: true, status: true } },
            school_memberships: {
                select: { school_id: true, status: true, role: true },
            },
        },
    });

    if (!dbUser || dbUser.deleted_at) {
        throw new UnauthorizedError('Account not found or deleted');
    }

    return {
        userId: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        schoolId:
            dbUser.educators?.school_id || dbUser.entrants?.school_id || null,
        educator: dbUser.educators || null,
        entrant: dbUser.entrants || null,
        // 'pending'/'rejected' until the school's coordinator approves a student
        entrantStatus: dbUser.entrants?.status || null,
        // This is an access-control boundary, not only a UI field.
        membershipStatus:
            dbUser.school_memberships?.find(
                (m) => m.school_id === dbUser.educators?.school_id
            )?.status || null,
    };
};

const cachedIdentity = (token) => {
    if (!authCacheEnabled) return resolveIdentity(token);

    const key = tokenKey(token);
    const now = Date.now();
    const hit = authCache.get(key);
    if (hit && hit.expiresAt > now) return hit.identity;
    if (hit) authCache.delete(key);

    if (authCache.size >= AUTH_CACHE_MAX_ENTRIES) {
        for (const [k, entry] of authCache) {
            if (entry.expiresAt <= now) authCache.delete(k);
        }
        if (authCache.size >= AUTH_CACHE_MAX_ENTRIES) {
            authCache.delete(authCache.keys().next().value);
        }
    }

    const identity = resolveIdentity(token);
    const entry = {
        identity,
        userId: null,
        expiresAt: Math.min(now + AUTH_CACHE_TTL_MS, tokenExpiresAt(token)),
    };
    authCache.set(key, entry);
    identity.then(
        (resolved) => {
            entry.userId = resolved.userId;
        },
        () => {
            if (authCache.get(key) === entry) authCache.delete(key);
        }
    );
    return identity;
};

/** Drops the cached identity for one token, e.g. when that session logs out. */
const forgetCachedToken = (token) => {
    authCache.delete(tokenKey(token));
};

/** Drops every cached identity for a user, e.g. once their account is deleted. */
const forgetCachedUser = (userId) => {
    for (const [key, entry] of authCache) {
        if (entry.userId === userId) authCache.delete(key);
    }
};

const requireAuth = async (req, _res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedError('No token provided');
        }

        const token = authHeader.split(' ')[1];
        req.user = { ...(await cachedIdentity(token)) };
        // A pending/rejected educator can still view membership status, log out,
        // or delete their account; all other authenticated routes are blocked.
        // This protects the other school-scoped routes which previously checked
        // only the broad 'educator' role.
        const permittedWhilePending = new Set([
            'GET /me',
            'POST /auth/logout',
            'DELETE /me',
        ]);
        const routeKey = `${req.method} ${String(req.originalUrl || req.url || '').split('?')[0]}`;
        if (
            req.user.role === 'educator' &&
            req.user.membershipStatus !== 'active' &&
            !permittedWhilePending.has(routeKey)
        ) {
            throw new ForbiddenError('School membership is awaiting approval');
        }
        // Same for a student whose coordinator has not approved them yet
        if (
            req.user.role === 'student' &&
            req.user.entrantStatus &&
            req.user.entrantStatus !== 'active' &&
            !permittedWhilePending.has(routeKey)
        ) {
            throw new ForbiddenError('School membership is awaiting approval');
        }
        // Kept for logout, which ends this particular session
        req.accessToken = token;

        next();
    } catch (err) {
        next(err);
    }
};

const requireRole =
    (...roles) =>
    (req, _res, next) => {
        if (!req.user) {
            return next(new UnauthorizedError('Not authenticated'));
        }
        if (!roles.includes(req.user.role)) {
            return next(new ForbiddenError('Insufficient permissions'));
        }
        next();
    };

// A few endpoints mean different things to different roles: GET /me/rounds
// lists a student's registrations but an educator's school rounds, each behind
// its own controller and guards. byRole dispatches to the chain for the
// signed-in user's role; a role that is not in the map is refused exactly as
// requireRole would refuse it. Never stack requireRole in front of byRole —
// it would run first and reject every role it does not list.
const byRole = (handlers) => (req, res, next) => {
    if (!req.user) {
        return next(new UnauthorizedError('Not authenticated'));
    }
    const chosen = handlers[req.user.role];
    if (!chosen) {
        return next(new ForbiddenError('Insufficient permissions'));
    }
    const chain = Array.isArray(chosen) ? chosen : [chosen];
    let index = 0;
    const step = (err) => {
        if (err) return next(err);
        const middleware = chain[index++];
        if (!middleware) return next();
        try {
            const result = middleware(req, res, step);
            // Controllers handle their own errors; this only catches a
            // rejection that slipped past their try/catch.
            if (result && typeof result.catch === 'function') {
                result.catch(next);
            }
        } catch (error) {
            next(error);
        }
    };
    step();
};

const requireSameSchool = async (req, _res, next) => {
    try {
        const educator = await prisma.educators.findUnique({
            where: { user_id: req.user.userId },
        });

        if (!educator || educator.school_id !== req.params.schoolId) {
            return next(new ForbiddenError('Not your school'));
        }

        req.educator = educator;
        next();
    } catch (err) {
        next(err);
    }
};

// Use this for actions that change a school's people or competition entries.
// It checks the scoped school membership rather than trusting the broad user
// role alone, so an educator from one school cannot manage another school.
const requireSchoolMembership =
    (...roles) =>
    async (req, _res, next) => {
        try {
            const schoolId = req.params.schoolId || req.user.schoolId;
            if (!schoolId)
                throw new ForbiddenError('No school membership found');
            const membership = await prisma.school_memberships.findUnique({
                where: {
                    user_id_school_id: {
                        user_id: req.user.userId,
                        school_id: schoolId,
                    },
                },
            });
            if (
                !membership ||
                membership.status !== 'active' ||
                (roles.length && !roles.includes(membership.role))
            ) {
                throw new ForbiddenError(
                    'You do not have permission to manage this school'
                );
            }
            req.schoolMembership = membership;
            next();
        } catch (err) {
            next(err);
        }
    };

module.exports = {
    requireAuth,
    requireRole,
    byRole,
    requireSameSchool,
    requireSchoolMembership,
    forgetCachedToken,
    forgetCachedUser,
};
