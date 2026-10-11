// Educator signup with an invitation code: the one path that skips the
// approval queue. (Signup without a code is covered in authService.test.js.)
jest.mock('../../../src/config/database', () => ({
    __esModule: true,
    default: require('../helpers/prismaMock').prisma,
}));
jest.mock('../../../src/config/supabase', () => ({
    auth: { admin: { createUser: jest.fn(), deleteUser: jest.fn() } },
}));

const { prisma, resetPrismaMock } = require('../helpers/prismaMock');
const supabase = require('../../../src/config/supabase');
const authService = require('../../../src/services/authService');

const SCHOOL = '11111111-1111-4111-8111-111111111111';
const OTHER_SCHOOL = '22222222-2222-4222-8222-222222222222';
const CODE = 'K7QD-2MXP-9TBW';

const invitation = (overrides = {}) => ({
    id: 'inv-1',
    school_id: SCHOOL,
    email: 'ayanda@test.com',
    role: 'educator',
    account_type: 'educator',
    used_at: null,
    revoked_at: null,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    schools: { id: SCHOOL, name: 'Parktown High' },
    ...overrides,
});

const signup = (overrides = {}) => ({
    full_name: 'Ayanda Dlamini',
    email: 'ayanda@test.com',
    password: 'Secret123',
    role: 'educator',
    invitation_code: CODE,
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
    prisma.users.create.mockResolvedValue({ id: 'auth-1', role: 'educator' });
    prisma.schools.findUnique.mockResolvedValue({ id: SCHOOL });
    prisma.school_memberships.findFirst.mockResolvedValue(null);
    prisma.school_invitations.findUnique.mockResolvedValue(invitation());
    prisma.school_invitations.updateMany.mockResolvedValue({ count: 1 });
});

describe('educator signup with an invitation code', () => {
    it('joins the invited school with active access, ignoring the school on the form', async () => {
        await authService.register(
            signup({ school_id: OTHER_SCHOOL, school_name: 'Somewhere Else' })
        );

        expect(prisma.educators.create).toHaveBeenCalledWith({
            data: { user_id: 'auth-1', school_id: SCHOOL },
        });
        expect(prisma.school_memberships.create).toHaveBeenCalledWith({
            data: {
                user_id: 'auth-1',
                school_id: SCHOOL,
                role: 'educator',
                status: 'active',
            },
        });
        expect(prisma.schools.create).not.toHaveBeenCalled();
    });

    it('uses the code up as part of creating the account', async () => {
        await authService.register(signup());

        expect(prisma.school_invitations.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ id: 'inv-1', used_at: null }),
                data: { used_at: expect.any(Date), used_by_id: 'auth-1' },
            })
        );
    });

    it('notifies the educator who sent the invitation after redemption', async () => {
        prisma.school_invitations.findUnique.mockResolvedValue(
            invitation({ invited_by_id: 'inviter-id' })
        );

        await authService.register(signup());

        expect(prisma.portal_notifications.createMany).toHaveBeenCalledWith({
            data: [expect.objectContaining({
                user_id: 'inviter-id',
                dedupe_key: 'account:invite:inv-1:accepted:inviter-id',
            })],
            skipDuplicates: true,
        });
    });

    it('makes the first educator of a school its active coordinator when invited as one', async () => {
        prisma.school_invitations.findUnique.mockResolvedValue(
            invitation({ role: 'coordinator' })
        );

        await authService.register(signup());

        expect(prisma.school_memberships.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                role: 'coordinator',
                status: 'active',
            }),
        });
    });

    it('does not make a second coordinator if the school got one in the meantime', async () => {
        prisma.school_invitations.findUnique.mockResolvedValue(
            invitation({ role: 'coordinator' })
        );
        prisma.school_memberships.findFirst.mockResolvedValue({ id: 'm-1' });

        await authService.register(signup());

        expect(prisma.school_memberships.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ role: 'educator', status: 'active' }),
        });
    });

    it.each([
        ['an unknown code', null],
        ['an expired code', invitation({ expires_at: new Date(Date.now() - 1000) })],
        ['a used code', invitation({ used_at: new Date() })],
        ['a code sent to a different email', invitation({ email: 'other@test.com' })],
    ])('refuses %s without creating anything or falling back to pending', async (_l, found) => {
        prisma.school_invitations.findUnique.mockResolvedValue(found);

        await expect(authService.register(signup())).rejects.toMatchObject({
            statusCode: 400,
        });
        expect(supabase.auth.admin.createUser).not.toHaveBeenCalled();
        expect(prisma.school_memberships.create).not.toHaveBeenCalled();
    });

    it('removes the new login again if the code was taken by a simultaneous signup', async () => {
        prisma.school_invitations.updateMany.mockResolvedValue({ count: 0 });

        await expect(authService.register(signup())).rejects.toMatchObject({
            statusCode: 400,
        });
        expect(supabase.auth.admin.deleteUser).toHaveBeenCalledWith('auth-1');
    });

    it('rejects using a code for the wrong account type before creating a login', async () => {
        await expect(
            authService.register(signup({ role: 'student', school_id: SCHOOL }))
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(supabase.auth.admin.createUser).not.toHaveBeenCalled();
    });

    it('lets an invited student sign up as ACTIVE without claiming an existing entrant', async () => {
        prisma.school_invitations.findUnique.mockResolvedValue(invitation({
            account_type: 'student', role: null,
        }));
        await authService.register(signup({
            role: 'student', school_id: OTHER_SCHOOL,
        }));
        expect(prisma.entrants.create).toHaveBeenCalledWith({
            data: {
                user_id: 'auth-1', school_id: SCHOOL,
                full_name: 'Ayanda Dlamini', status: 'active',
            },
        });
        expect(prisma.school_memberships.create).not.toHaveBeenCalled();
        expect(prisma.school_invitations.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ id: 'inv-1', used_at: null }),
                data: { used_at: expect.any(Date), used_by_id: 'auth-1' },
            })
        );
        expect(prisma.entrants.findFirst).not.toHaveBeenCalled();
    });

    it('student signup without a code is still pending', async () => {
        await authService.register(signup({
            role: 'student', invitation_code: undefined, school_id: SCHOOL,
        }));
        expect(prisma.entrants.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ status: 'pending' }),
        });
    });

    it('leaves signup without a code waiting for approval, as before', async () => {
        await authService.register(
            signup({ invitation_code: undefined, school_id: SCHOOL })
        );

        expect(prisma.school_memberships.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ status: 'pending' }),
        });
        expect(prisma.school_invitations.updateMany).not.toHaveBeenCalled();
    });
});
