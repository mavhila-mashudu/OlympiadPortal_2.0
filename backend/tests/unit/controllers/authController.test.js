jest.mock('../../../src/config/database', () => ({
    __esModule: true,
    default: require('../helpers/prismaMock').prisma,
}));
jest.mock('../../../src/services/authService', () => ({
    register: jest.fn(),
    listSchools: jest.fn(),
    deleteAccount: jest.fn(),
    listEducatorOlympiads: jest.fn(),
}));

const { prisma, resetPrismaMock } = require('../helpers/prismaMock');
const authService = require('../../../src/services/authService');
const controller = require('../../../src/controllers/authController');
const { mockReq, run } = require('../helpers/http');
const { describeControllerCases } = require('../helpers/controllerCases');

const user = { userId: 'user-1', role: 'educator' };
const ok = (data) => ({ success: true, data });

beforeEach(() => {
    resetPrismaMock();
    prisma.educators.findUnique.mockResolvedValue({ school_id: 'school-1' });
});

describeControllerCases(controller, [
    {
        handler: 'register',
        service: authService,
        method: 'register',
        req: mockReq({
            body: {
                full_name: 'Sipho',
                email: 's@test.com',
                password: 'Secret123',
                role: 'educator',
                school_id: 'school-1',
                school_name: 'Parktown',
            },
        }),
        args: [
            {
                full_name: 'Sipho',
                email: 's@test.com',
                password: 'Secret123',
                role: 'educator',
                school_id: 'school-1',
                school_name: 'Parktown',
            },
        ],
        status: 201,
        result: { user: { id: 'auth-2', role: 'educator' } },
        json: () => ok({ user: { id: 'auth-2', role: 'educator' } }),
    },
    {
        handler: 'listSchools',
        service: authService,
        method: 'listSchools',
        req: mockReq({}),
        args: [],
        result: [{ id: 'school-1', name: 'Parktown' }],
        json: (result) => ok({ schools: result }),
    },
    {
        handler: 'deleteAccount',
        service: authService,
        method: 'deleteAccount',
        req: mockReq({ user }),
        args: ['user-1'],
        json: () => ok({ message: 'Account deleted' }),
    },
    {
        handler: 'getEducatorOlympiads',
        service: authService,
        method: 'listEducatorOlympiads',
        req: mockReq({ user }),
        args: ['school-1'],
        json: (result) => ok({ olympiads: result }),
    },
]);

describe('getEducatorOlympiads without an educator profile', () => {
    it("responds 401 and doesn't call the service", async () => {
        prisma.educators.findUnique.mockResolvedValue(null);
        authService.listEducatorOlympiads.mockReset();

        const { res, next } = await run(
            controller.getEducatorOlympiads,
            mockReq({ user })
        );

        expect(prisma.educators.findUnique).toHaveBeenCalledWith({
            where: { user_id: 'user-1' },
        });
        expect(next.mock.calls[0][0]).toMatchObject({
            statusCode: 401,
            message: 'Educator profile not found',
        });
        expect(authService.listEducatorOlympiads).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });
});

describe('me', () => {
    it("returns the signed-in user's profile with school details", async () => {
        const profile = { id: 'user-1', full_name: 'Sipho', role: 'educator' };
        prisma.users.findUnique.mockResolvedValue(profile);

        const { res, next } = await run(controller.me, mockReq({ user }));

        expect(prisma.users.findUnique).toHaveBeenCalledWith({
            where: { id: 'user-1' },
            select: expect.objectContaining({
                id: true,
                email: true,
                role: true,
                school_memberships: expect.objectContaining({
                    select: expect.objectContaining({ status: true }),
                }),
                educators: expect.any(Object),
                entrants: expect.any(Object),
            }),
        });
        expect(res.json).toHaveBeenCalledWith(ok({ user: profile }));
        expect(next).not.toHaveBeenCalled();
    });

    it('passes a database error to the error handler', async () => {
        const err = new Error('db down');
        prisma.users.findUnique.mockRejectedValue(err);
        const { next } = await run(controller.me, mockReq({ user }));
        expect(next).toHaveBeenCalledWith(err);
    });
});
