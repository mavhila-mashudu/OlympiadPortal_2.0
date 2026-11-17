jest.mock('../../../src/config/database', () => ({
    __esModule: true,
    default: require('../helpers/prismaMock').prisma,
}));
jest.mock('../../../src/config/supabase', () => ({
    auth: {
        admin: {
            createUser: jest.fn(),
            deleteUser: jest.fn(),
            getUserById: jest.fn(),
            signOut: jest.fn(),
        },
    },
}));

const { prisma, resetPrismaMock } = require('../helpers/prismaMock');
const supabase = require('../../../src/config/supabase');
const authService = require('../../../src/services/authService');

// The signup flow rejects a school id that is not a UUID before it creates the
// Supabase account, so the tests use a real one.
const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';

const input = (overrides = {}) => ({
    full_name: 'Thandi Mokoena',
    email: 'thandi@test.com',
    password: 'Secret123',
    role: 'educator',
    ...overrides,
});

beforeEach(() => {
    resetPrismaMock();
    supabase.auth.admin.createUser.mockReset().mockResolvedValue({
        data: { user: { id: 'auth-1' } },
        error: null,
    });
    supabase.auth.admin.deleteUser.mockReset().mockResolvedValue({});
    prisma.users.findUnique.mockResolvedValue(null);
    prisma.users.create.mockResolvedValue({ id: 'auth-1', role: 'organiser' });
});

describe('register', () => {
    it('rejects an unknown role before touching Supabase', async () => {
        await expect(
            authService.register(input({ role: 'admin' }))
        ).rejects.toMatchObject({
            statusCode: 400,
            message: 'Unknown account type',
        });
        expect(supabase.auth.admin.createUser).not.toHaveBeenCalled();
    });

    it('rejects an email that is already registered', async () => {
        prisma.users.findUnique.mockResolvedValue({ id: 'existing' });

        await expect(authService.register(input())).rejects.toMatchObject({
            statusCode: 409,
            message: 'Email already registered',
        });
        expect(supabase.auth.admin.createUser).not.toHaveBeenCalled();
    });

    it('surfaces a Supabase failure as a 400', async () => {
        supabase.auth.admin.createUser.mockResolvedValue({
            data: null,
            error: { message: 'weak password' },
        });
        prisma.schools.findUnique.mockResolvedValue({ id: SCHOOL_ID });

        await expect(
            authService.register(input({ school_id: SCHOOL_ID }))
        ).rejects.toMatchObject({
            statusCode: 400,
            message: 'weak password',
        });
    });

    describe('organiser', () => {
        // The role carries authority over every olympiad, so self-service sign-up
        // must never grant it, however the request is phrased.
        it('refuses to create an organiser from public sign-up, before touching Supabase', async () => {
            await expect(
                authService.register(input({ role: 'organiser' }))
            ).rejects.toMatchObject({
                statusCode: 403,
                message:
                    'Organiser accounts are created by the portal administrator',
            });
            expect(supabase.auth.admin.createUser).not.toHaveBeenCalled();
            expect(prisma.users.create).not.toHaveBeenCalled();
        });
    });

    describe('educator', () => {
        const educatorInput = (overrides) =>
            input({ role: 'educator', ...overrides });

        beforeEach(() => {
            prisma.users.create.mockResolvedValue({
                id: 'auth-1',
                role: 'educator',
            });
            prisma.schools.findUnique.mockResolvedValue({ id: SCHOOL_ID });
            prisma.schools.findFirst.mockResolvedValue(null);
            prisma.school_memberships.findFirst.mockResolvedValue(null);
        });

        it('requires a school', async () => {
            await expect(
                authService.register(educatorInput())
            ).rejects.toMatchObject({
                statusCode: 400,
                message: 'Select your school, or enter its name',
            });
            expect(supabase.auth.admin.createUser).not.toHaveBeenCalled();
        });

        it('joins the chosen school and coordinates it when it has no coordinator yet', async () => {
            await authService.register(
                educatorInput({ school_id: SCHOOL_ID })
            );

            expect(prisma.educators.create).toHaveBeenCalledWith({
                data: { user_id: 'auth-1', school_id: SCHOOL_ID },
            });
            expect(prisma.school_memberships.create).toHaveBeenCalledWith({
                data: {
                    user_id: 'auth-1',
                    school_id: SCHOOL_ID,
                    role: 'coordinator',
                    status: 'pending',
                },
            });
        });

        it('joins as an ordinary member when the school already has a coordinator', async () => {
            prisma.school_memberships.findFirst.mockResolvedValue({
                id: 'membership-1',
            });

            await authService.register(
                educatorInput({ school_id: SCHOOL_ID })
            );

            expect(prisma.school_memberships.create).toHaveBeenCalledWith({
                data: {
                    user_id: 'auth-1',
                    school_id: SCHOOL_ID,
                    role: 'educator',
                    status: 'pending',
                },
            });
        });

        it('rejects a school id that does not exist', async () => {
            prisma.schools.findUnique.mockResolvedValue(null);

            await expect(
                authService.register(educatorInput({ school_id: SCHOOL_ID }))
            ).rejects.toMatchObject({
                statusCode: 400,
                message: 'The selected school no longer exists. Please select another.',
            });
            // Checked before any Supabase account is created, so nothing to undo
            expect(supabase.auth.admin.createUser).not.toHaveBeenCalled();
        });

        it('rejects a school id that is not a UUID', async () => {
            await expect(
                authService.register(educatorInput({ school_id: 'missing' }))
            ).rejects.toMatchObject({
                statusCode: 400,
                message: 'Invalid school selection. Please select your school again.',
            });
            expect(supabase.auth.admin.createUser).not.toHaveBeenCalled();
        });

        it('creates a school that is not on the platform yet, trimming its name', async () => {
            prisma.schools.create.mockResolvedValue({ id: 'school-new' });

            await authService.register(
                educatorInput({ school_name: '  Parktown Boys High ' })
            );

            expect(prisma.schools.findFirst).toHaveBeenCalledWith({
                where: {
                    name: { equals: 'Parktown Boys High', mode: 'insensitive' },
                },
                select: { id: true },
            });
            expect(prisma.schools.create).toHaveBeenCalledWith({
                data: { name: 'Parktown Boys High' },
            });
            expect(prisma.educators.create).toHaveBeenCalledWith({
                data: { user_id: 'auth-1', school_id: 'school-new' },
            });
        });

        it('reuses a school whose name matches apart from case', async () => {
            prisma.schools.findFirst.mockResolvedValue({ id: SCHOOL_ID });

            await authService.register(
                educatorInput({ school_name: 'parktown BOYS high' })
            );

            expect(prisma.schools.create).not.toHaveBeenCalled();
            expect(prisma.educators.create).toHaveBeenCalledWith({
                data: { user_id: 'auth-1', school_id: SCHOOL_ID },
            });
        });
    });

    describe('student', () => {
        const studentInput = (overrides) =>
            input({ role: 'student', ...overrides });

        beforeEach(() => {
            prisma.users.create.mockResolvedValue({
                id: 'auth-1',
                role: 'student',
            });
            prisma.schools.findUnique.mockResolvedValue({ id: SCHOOL_ID });
            prisma.entrants.findFirst.mockResolvedValue(null);
        });

        it('must pick a school from the list, and may not name a new one', async () => {
            await expect(
                authService.register(
                    studentInput({ school_name: 'Somewhere New' })
                )
            ).rejects.toMatchObject({
                statusCode: 400,
                message: 'Select your school from the list',
            });
            expect(supabase.auth.admin.createUser).not.toHaveBeenCalled();
        });

        it('creates a pending entrant at the chosen school, awaiting the coordinator', async () => {
            await authService.register(studentInput({ school_id: SCHOOL_ID }));

            expect(prisma.entrants.create).toHaveBeenCalledWith({
                data: {
                    user_id: 'auth-1',
                    school_id: SCHOOL_ID,
                    full_name: 'Thandi Mokoena',
                    status: 'pending',
                },
            });
        });

        it('does not take over an entrant an educator listed under the same name', async () => {
            prisma.entrants.findFirst.mockResolvedValue({ id: 'entrant-1' });

            await authService.register(studentInput({ school_id: SCHOOL_ID }));

            // Linking to a listed record only happens when the coordinator approves
            expect(prisma.entrants.findFirst).not.toHaveBeenCalled();
            expect(prisma.entrants.update).not.toHaveBeenCalled();
            expect(prisma.entrants.create).toHaveBeenCalledTimes(1);
        });
    });
});

describe('registerOrganiser', () => {
    it('registers with the organiser role, whatever else is passed', async () => {
        const { user } = await authService.registerOrganiser({
            full_name: 'Thandi Mokoena',
            email: 'thandi@test.com',
            password: 'Secret123',
        });

        expect(prisma.users.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ role: 'organiser' }),
            })
        );
        expect(user).toEqual({ id: 'auth-1', role: 'organiser' });
    });

    it('creates a confirmed Supabase user and the account with the same id, and no school profile', async () => {
        await authService.registerOrganiser({
            full_name: 'Thandi Mokoena',
            email: 'thandi@test.com',
            password: 'Secret123',
        });

        expect(supabase.auth.admin.createUser).toHaveBeenCalledWith({
            email: 'thandi@test.com',
            password: 'Secret123',
            email_confirm: true,
        });
        expect(prisma.users.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    id: 'auth-1',
                    auth_provider_id: 'auth-1',
                    role: 'organiser',
                }),
            })
        );
        expect(prisma.educators.create).not.toHaveBeenCalled();
        expect(prisma.entrants.create).not.toHaveBeenCalled();
    });

    it('deletes the Supabase login again if the account row cannot be written', async () => {
        prisma.users.create.mockRejectedValue(new Error('db down'));

        await expect(
            authService.registerOrganiser({
                full_name: 'Thandi',
                email: 'thandi@test.com',
                password: 'Secret123',
            })
        ).rejects.toThrow('db down');
        expect(supabase.auth.admin.deleteUser).toHaveBeenCalledWith('auth-1');
    });
});

describe('listSchools', () => {
    it('returns the schools by name, with only the fields the signup form needs', async () => {
        prisma.schools.findMany.mockResolvedValue([
            { id: SCHOOL_ID, name: 'Alpha Academy' },
        ]);

        await expect(authService.listSchools()).resolves.toEqual([
            { id: SCHOOL_ID, name: 'Alpha Academy' },
        ]);
        expect(prisma.schools.findMany).toHaveBeenCalledWith({
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });
    });
});

describe('listEducatorOlympiads', () => {
    it("returns only the approved registrations' olympiads", async () => {
        prisma.school_registrations.findMany.mockResolvedValue([
            { olympiads: { id: 'oly-1', name: 'Nationals' } },
        ]);

        await expect(
            authService.listEducatorOlympiads(SCHOOL_ID)
        ).resolves.toEqual([{ id: 'oly-1', name: 'Nationals' }]);
        expect(prisma.school_registrations.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { school_id: SCHOOL_ID, status: 'approved' },
            })
        );
    });
});

describe('logout', () => {
    it('has Supabase end this session', async () => {
        supabase.auth.admin.signOut.mockResolvedValue({
            data: null,
            error: null,
        });
        await authService.logout('jwt-1');
        expect(supabase.auth.admin.signOut).toHaveBeenCalledWith(
            'jwt-1',
            'local'
        );
    });

    it("logs, rather than fails, when Supabase can't end it", async () => {
        supabase.auth.admin.signOut.mockResolvedValue({
            data: null,
            error: { message: 'network down' },
        });
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

        await expect(authService.logout('jwt-1')).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledWith(
            '[auth] Supabase could not end the session: network down'
        );
        warn.mockRestore();
    });
});

describe('deleteAccount', () => {
    beforeEach(() => {
        prisma.users.findUnique.mockResolvedValue({ role: 'student' });
        supabase.auth.admin.deleteUser.mockResolvedValue({
            data: {},
            error: null,
        });
        supabase.auth.admin.getUserById.mockResolvedValue({
            data: { user: { id: 'user-1' } },
            error: null,
        });
    });

    it("removes the Supabase login and the person's details, and ends their school ties", async () => {
        await authService.deleteAccount('user-1');

        expect(supabase.auth.admin.deleteUser).toHaveBeenCalledWith('user-1');
        expect(prisma.users.update).toHaveBeenCalledWith({
            where: { id: 'user-1' },
            data: {
                deleted_at: expect.any(Date),
                email: 'deleted-user-1@deleted.invalid',
                full_name: 'Deleted user',
                auth_provider_id: null,
            },
        });
        expect(prisma.school_memberships.updateMany).toHaveBeenCalledWith({
            where: { user_id: 'user-1' },
            data: { status: 'removed' },
        });
        expect(prisma.entrants.updateMany).toHaveBeenCalledWith({
            where: { user_id: 'user-1' },
            data: { user_id: null },
        });
    });

    it('reports a Supabase deletion failure when the login still exists', async () => {
        supabase.auth.admin.deleteUser.mockResolvedValue({
            data: null,
            error: { status: 500, message: 'Database error' },
        });

        await expect(authService.deleteAccount('user-1')).rejects.toMatchObject(
            {
                statusCode: 502,
                message: 'We couldn’t delete your account. Please try again.',
            }
        );
        expect(prisma.users.update.mock.invocationCallOrder[0]).toBeLessThan(
            supabase.auth.admin.deleteUser.mock.invocationCallOrder[0]
        );
        expect(supabase.auth.admin.getUserById).toHaveBeenCalledWith('user-1');
    });

    it('treats an error as success when Supabase confirms the login is gone', async () => {
        supabase.auth.admin.deleteUser.mockResolvedValue({
            data: null,
            error: { status: 500, message: 'Response failed' },
        });
        supabase.auth.admin.getUserById.mockResolvedValue({
            data: { user: null },
            error: null,
        });

        await expect(authService.deleteAccount('user-1')).resolves.toBeUndefined();
    });

    it('does not assume the login is gone when Supabase verification fails', async () => {
        supabase.auth.admin.deleteUser.mockResolvedValue({
            data: null,
            error: { status: 500, message: 'Response failed' },
        });
        supabase.auth.admin.getUserById.mockResolvedValue({
            data: null,
            error: { status: 503, message: 'Auth service unavailable' },
        });

        await expect(authService.deleteAccount('user-1')).rejects.toMatchObject(
            { statusCode: 502 }
        );
    });

    it('carries on when the Supabase login is already gone', async () => {
        supabase.auth.admin.deleteUser.mockResolvedValue({
            data: null,
            error: { status: 404, message: 'User not found' },
        });
        await expect(
            authService.deleteAccount('user-1')
        ).resolves.toBeUndefined();
    });

    it('refuses an organiser whose olympiad is still running', async () => {
        prisma.users.findUnique.mockResolvedValue({ role: 'organiser' });
        prisma.olympiads.findFirst.mockResolvedValue({
            name: 'Maths Olympiad',
        });

        await expect(authService.deleteAccount('user-1')).rejects.toMatchObject(
            {
                statusCode: 409,
            }
        );
        expect(prisma.olympiads.findFirst).toHaveBeenCalledWith({
            where: {
                organiser_id: 'user-1',
                rounds: { some: { state: { not: 'results_released' } } },
            },
            select: { name: true },
        });
        expect(supabase.auth.admin.deleteUser).not.toHaveBeenCalled();
        expect(prisma.users.update).not.toHaveBeenCalled();
    });

    it("rejects an account that doesn't exist", async () => {
        prisma.users.findUnique.mockResolvedValue(null);
        await expect(authService.deleteAccount('user-1')).rejects.toMatchObject(
            {
                statusCode: 404,
            }
        );
    });
});
