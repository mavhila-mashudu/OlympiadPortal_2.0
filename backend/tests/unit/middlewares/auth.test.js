jest.mock('../../../src/config/database', () => ({
    __esModule: true,
    default: require('../helpers/prismaMock').prisma,
}));
jest.mock('../../../src/config/supabase', () => ({
    auth: { getUser: jest.fn() },
}));

const supabase = require('../../../src/config/supabase');
const { prisma, resetPrismaMock } = require('../helpers/prismaMock');
const {
    requireAuth,
    requireRole,
    byRole,
    requireSchoolMembership,
} = require('../../../src/middlewares/auth');
const { mockReq, mockRes } = require('../helpers/http');

const callMiddleware = async (middleware, req) => {
    const next = jest.fn();
    await middleware(req, mockRes(), next);
    return next;
};

const expectNextError = (next, statusCode, message) => {
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(statusCode);
    if (message) expect(err.message).toBe(message);
};

beforeEach(() => {
    resetPrismaMock();
    supabase.auth.getUser.mockReset();
});

describe('requireAuth', () => {
    const authReq = (token = 'valid-token') =>
        mockReq({
            user: undefined,
            headers: { authorization: `Bearer ${token}` },
        });

    it('rejects a request with no Authorization header', async () => {
        const next = await callMiddleware(
            requireAuth,
            mockReq({ user: undefined })
        );
        expectNextError(next, 401, 'No token provided');
        expect(supabase.auth.getUser).not.toHaveBeenCalled();
    });

    it("rejects a header that isn't a Bearer token", async () => {
        const req = mockReq({
            user: undefined,
            headers: { authorization: 'Basic abc' },
        });
        expectNextError(
            await callMiddleware(requireAuth, req),
            401,
            'No token provided'
        );
    });

    it('rejects a token Supabase reports as invalid', async () => {
        supabase.auth.getUser.mockResolvedValue({
            data: { user: null },
            error: { message: 'bad jwt' },
        });
        expectNextError(
            await callMiddleware(requireAuth, authReq()),
            401,
            'Invalid or expired token'
        );
    });

    it('rejects when Supabase returns no user without an error', async () => {
        supabase.auth.getUser.mockResolvedValue({
            data: { user: null },
            error: null,
        });
        expectNextError(
            await callMiddleware(requireAuth, authReq()),
            401,
            'Invalid or expired token'
        );
    });

    it("verifies the token that follows 'Bearer '", async () => {
        supabase.auth.getUser.mockResolvedValue({
            data: { user: null },
            error: null,
        });
        await callMiddleware(requireAuth, authReq('abc.def.ghi'));
        expect(supabase.auth.getUser).toHaveBeenCalledWith('abc.def.ghi');
    });

    it('rejects a Supabase user with no matching account', async () => {
        supabase.auth.getUser.mockResolvedValue({
            data: { user: { id: 'u1' } },
            error: null,
        });
        prisma.users.findUnique.mockResolvedValue(null);
        expectNextError(
            await callMiddleware(requireAuth, authReq()),
            401,
            'Account not found or deleted'
        );
    });

    it('rejects a soft-deleted account', async () => {
        supabase.auth.getUser.mockResolvedValue({
            data: { user: { id: 'u1' } },
            error: null,
        });
        prisma.users.findUnique.mockResolvedValue({
            id: 'u1',
            deleted_at: new Date(),
        });
        expectNextError(
            await callMiddleware(requireAuth, authReq()),
            401,
            'Account not found or deleted'
        );
    });

    it("attaches an educator's identity and school to req.user", async () => {
        supabase.auth.getUser.mockResolvedValue({
            data: { user: { id: 'u1' } },
            error: null,
        });
        const educator = { id: 'edu-1', school_id: 'school-1' };
        prisma.users.findUnique.mockResolvedValue({
            id: 'u1',
            email: 'e@school.test',
            role: 'educator',
            deleted_at: null,
            educators: educator,
            entrants: null,
            school_memberships: [{ school_id: 'school-1', status: 'active', role: 'educator' }],
        });

        const req = authReq();
        const next = await callMiddleware(requireAuth, req);

        expect(next).toHaveBeenCalledWith();
        expect(prisma.users.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'u1' } })
        );
        expect(req.user).toEqual({
            userId: 'u1',
            email: 'e@school.test',
            role: 'educator',
            schoolId: 'school-1',
            educator,
            entrant: null,
            entrantStatus: null,
            membershipStatus: 'active',
        });
    });

    it("takes a student's school from their entrant record", async () => {
        supabase.auth.getUser.mockResolvedValue({
            data: { user: { id: 'u2' } },
            error: null,
        });
        const entrant = { id: 'ent-1', school_id: 'school-9' };
        prisma.users.findUnique.mockResolvedValue({
            id: 'u2',
            role: 'student',
            educators: null,
            entrants: entrant,
        });

        const req = authReq();
        await callMiddleware(requireAuth, req);
        expect(req.user.schoolId).toBe('school-9');
        expect(req.user.entrant).toBe(entrant);
        expect(req.user.membershipStatus).toBeNull();
        expect(req.user.educator).toBeNull();
    });

    it('blocks a student awaiting approval from everything except their own status and logout', async () => {
        supabase.auth.getUser.mockResolvedValue({
            data: { user: { id: 'u2' } },
            error: null,
        });
        prisma.users.findUnique.mockResolvedValue({
            id: 'u2',
            role: 'student',
            educators: null,
            entrants: { id: 'ent-1', school_id: 'school-9', status: 'pending' },
        });

        const blocked = mockReq({
            user: undefined,
            headers: { authorization: 'Bearer valid-token' },
            method: 'GET',
            originalUrl: '/student/rounds',
        });
        expectNextError(
            await callMiddleware(requireAuth, blocked),
            403,
            'School membership is awaiting approval'
        );

        const status = mockReq({
            user: undefined,
            headers: { authorization: 'Bearer valid-token' },
            method: 'GET',
            originalUrl: '/me',
        });
        expect(await callMiddleware(requireAuth, status)).toHaveBeenCalledWith();
    });

    it('lets an approved student through', async () => {
        supabase.auth.getUser.mockResolvedValue({
            data: { user: { id: 'u2' } },
            error: null,
        });
        prisma.users.findUnique.mockResolvedValue({
            id: 'u2',
            role: 'student',
            educators: null,
            entrants: { id: 'ent-1', school_id: 'school-9', status: 'active' },
        });

        const req = mockReq({
            user: undefined,
            headers: { authorization: 'Bearer valid-token' },
            method: 'GET',
            originalUrl: '/student/rounds',
        });
        expect(await callMiddleware(requireAuth, req)).toHaveBeenCalledWith();
    });

    it('sets schoolId to null for an organiser', async () => {
        supabase.auth.getUser.mockResolvedValue({
            data: { user: { id: 'u3' } },
            error: null,
        });
        prisma.users.findUnique.mockResolvedValue({
            id: 'u3',
            role: 'organiser',
        });

        const req = authReq();
        await callMiddleware(requireAuth, req);
        expect(req.user.schoolId).toBeNull();
        expect(req.user.membershipStatus).toBeNull();
    });

    it('passes unexpected errors to the error handler', async () => {
        const boom = new Error('network down');
        supabase.auth.getUser.mockRejectedValue(boom);
        const next = await callMiddleware(requireAuth, authReq());
        expect(next).toHaveBeenCalledWith(boom);
    });
});

describe('requireRole', () => {
    it('rejects an unauthenticated request', () => {
        const next = jest.fn();
        requireRole('organiser')(mockReq({ user: undefined }), mockRes(), next);
        expectNextError(next, 401, 'Not authenticated');
    });

    it("rejects a user whose role isn't allowed", () => {
        const next = jest.fn();
        requireRole('organiser')(
            mockReq({ user: { role: 'student' } }),
            mockRes(),
            next
        );
        expectNextError(next, 403, 'Insufficient permissions');
    });

    it('allows a user with the required role', () => {
        const next = jest.fn();
        requireRole('organiser')(
            mockReq({ user: { role: 'organiser' } }),
            mockRes(),
            next
        );
        expect(next).toHaveBeenCalledWith();
    });

    it('allows any of several listed roles', () => {
        const next = jest.fn();
        requireRole('organiser', 'educator')(
            mockReq({ user: { role: 'educator' } }),
            mockRes(),
            next
        );
        expect(next).toHaveBeenCalledWith();
    });
});

describe('byRole', () => {
    const roleReq = (role) => mockReq({ user: { role } });

    it('rejects an unauthenticated request', () => {
        const next = jest.fn();
        byRole({ educator: jest.fn() })(
            mockReq({ user: undefined }),
            mockRes(),
            next
        );
        expectNextError(next, 401, 'Not authenticated');
    });

    it('rejects a role with no handler in the map', () => {
        const next = jest.fn();
        byRole({ educator: jest.fn() })(roleReq('organiser'), mockRes(), next);
        expectNextError(next, 403, 'Insufficient permissions');
    });

    it("runs the handler for the signed-in user's role", () => {
        const student = jest.fn((_req, _res, next) => next());
        const educator = jest.fn((_req, _res, next) => next());
        const next = jest.fn();

        byRole({ student, educator })(roleReq('student'), mockRes(), next);

        expect(student).toHaveBeenCalledTimes(1);
        expect(educator).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith();
    });

    it('runs a role chain in order and passes on at the end', () => {
        const order = [];
        const guard = (_req, _res, next) => {
            order.push('guard');
            next();
        };
        const handler = (_req, _res, next) => {
            order.push('handler');
            next();
        };
        const next = jest.fn();

        byRole({ educator: [guard, handler] })(
            roleReq('educator'),
            mockRes(),
            next
        );

        expect(order).toEqual(['guard', 'handler']);
        expect(next).toHaveBeenCalledWith();
    });

    it('stops a chain at its first error', () => {
        const boom = new Error('nope');
        const guard = (_req, _res, next) => next(boom);
        const handler = jest.fn();
        const next = jest.fn();

        byRole({ educator: [guard, handler] })(
            roleReq('educator'),
            mockRes(),
            next
        );

        expect(handler).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(boom);
    });

    it('passes a synchronous throw to the error handler', () => {
        const boom = new Error('boom');
        const next = jest.fn();

        byRole({
            educator: () => {
                throw boom;
            },
        })(roleReq('educator'), mockRes(), next);

        expect(next).toHaveBeenCalledWith(boom);
    });

    it('passes an async rejection to the error handler', async () => {
        const boom = new Error('async boom');
        const next = jest.fn();

        byRole({
            educator: async () => {
                throw boom;
            },
        })(roleReq('educator'), mockRes(), next);

        await new Promise((resolve) => setImmediate(resolve));
        expect(next).toHaveBeenCalledWith(boom);
    });
});

describe('requireSchoolMembership', () => {
    const eduReq = (overrides = {}) =>
        mockReq({
            user: { userId: 'u1', role: 'educator', schoolId: 'school-1' },
            ...overrides,
        });

    it('rejects a user with no school at all', async () => {
        const req = mockReq({ user: { userId: 'u1', schoolId: null } });
        const next = await callMiddleware(requireSchoolMembership(), req);
        expectNextError(next, 403, 'No school membership found');
        expect(prisma.school_memberships.findUnique).not.toHaveBeenCalled();
    });

    it("checks the school in the URL before the user's own school", async () => {
        prisma.school_memberships.findUnique.mockResolvedValue(null);
        await callMiddleware(
            requireSchoolMembership(),
            eduReq({ params: { schoolId: 'school-2' } })
        );
        expect(prisma.school_memberships.findUnique).toHaveBeenCalledWith({
            where: {
                user_id_school_id: { user_id: 'u1', school_id: 'school-2' },
            },
        });
    });

    it('rejects when there is no membership', async () => {
        prisma.school_memberships.findUnique.mockResolvedValue(null);
        const next = await callMiddleware(requireSchoolMembership(), eduReq());
        expectNextError(
            next,
            403,
            'You do not have permission to manage this school'
        );
    });

    it('rejects an inactive membership', async () => {
        prisma.school_memberships.findUnique.mockResolvedValue({
            status: 'revoked',
            role: 'coordinator',
        });
        expectNextError(
            await callMiddleware(requireSchoolMembership(), eduReq()),
            403
        );
    });

    it("rejects a membership role that isn't in the allowed list", async () => {
        prisma.school_memberships.findUnique.mockResolvedValue({
            status: 'active',
            role: 'educator',
        });
        expectNextError(
            await callMiddleware(
                requireSchoolMembership('coordinator'),
                eduReq()
            ),
            403
        );
    });

    it('allows an active membership with an allowed role and attaches it', async () => {
        const membership = { status: 'active', role: 'coordinator' };
        prisma.school_memberships.findUnique.mockResolvedValue(membership);
        const req = eduReq();
        const next = await callMiddleware(
            requireSchoolMembership('coordinator', 'educator'),
            req
        );
        expect(next).toHaveBeenCalledWith();
        expect(req.schoolMembership).toBe(membership);
    });

    it('allows any active role when no roles are listed', async () => {
        prisma.school_memberships.findUnique.mockResolvedValue({
            status: 'active',
            role: 'educator',
        });
        expect(
            await callMiddleware(requireSchoolMembership(), eduReq())
        ).toHaveBeenCalledWith();
    });

    it('passes database errors to the error handler', async () => {
        const boom = new Error('db down');
        prisma.school_memberships.findUnique.mockRejectedValue(boom);
        expect(
            await callMiddleware(requireSchoolMembership(), eduReq())
        ).toHaveBeenCalledWith(boom);
    });
});
