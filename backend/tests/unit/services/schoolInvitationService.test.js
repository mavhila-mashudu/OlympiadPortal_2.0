jest.mock('../../../src/config/database', () => ({
    __esModule: true,
    default: require('../helpers/prismaMock').prisma,
}));
jest.mock('../../../src/config/env', () => ({
    frontend: { url: 'https://olympiad.test/' },
}));
jest.mock('../../../src/lib/mailer', () => ({
    sendSchoolEducatorInviteEmail: jest.fn(),
}));

const { prisma, resetPrismaMock } = require('../helpers/prismaMock');
const mailer = require('../../../src/lib/mailer');
const service = require('../../../src/services/schoolInvitationService');

const SCHOOL = '11111111-1111-4111-8111-111111111111';
const OTHER_SCHOOL = '22222222-2222-4222-8222-222222222222';
const organiser = { role: 'organiser', userId: 'org-1', schoolId: null };
const coordinator = { role: 'educator', userId: 'coord-1', schoolId: SCHOOL };

const DAY = 24 * 60 * 60 * 1000;
const row = (overrides = {}) => ({
    id: 'inv-1',
    school_id: SCHOOL,
    email: 'ayanda@test.com',
    role: 'educator',
    account_type: 'educator',
    created_at: new Date(),
    expires_at: new Date(Date.now() + DAY),
    used_at: null,
    revoked_at: null,
    schools: { id: SCHOOL, name: 'Parktown High' },
    invited_by: { full_name: 'Org Anizer' },
    ...overrides,
});

beforeEach(() => {
    resetPrismaMock();
    mailer.sendSchoolEducatorInviteEmail
        .mockReset()
        .mockResolvedValue({ delivered: true });
    prisma.schools.findUnique.mockResolvedValue({
        id: SCHOOL,
        name: 'Parktown High',
    });
    prisma.users.findUnique.mockResolvedValue(null);
    prisma.school_memberships.findFirst.mockResolvedValue(null);
    prisma.school_invitations.create.mockImplementation(async ({ data }) =>
        row({ email: data.email, role: data.role, account_type: data.account_type, expires_at: data.expires_at })
    );
});

describe('codes', () => {
    it('are 12 unambiguous characters in groups of four', () => {
        for (let i = 0; i < 50; i += 1) {
            expect(service.generateCode()).toMatch(
                /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/
            );
        }
    });

    it('hash the same however they were typed', () => {
        const hash = service.hashCode('K7QD-2MXP-9TBW');
        expect(service.hashCode('k7qd 2mxp 9tbw')).toBe(hash);
        expect(service.hashCode('K7QD2MXP9TBW')).toBe(hash);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
        expect(service.hashCode('K7QD-2MXP-9TBX')).not.toBe(hash);
    });
});

describe('createInvitation', () => {
    it('stores only the hash and emails the code and link', async () => {
        const result = await service.createInvitation(organiser, {
            email: '  Ayanda@Test.com ',
            schoolId: SCHOOL,
        });

        const stored = prisma.school_invitations.create.mock.calls[0][0].data;
        const sent = mailer.sendSchoolEducatorInviteEmail.mock.calls[0][0];
        expect(sent.to).toBe('ayanda@test.com');
        expect(sent.code).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){2}$/);
        // The database has a hash of the code, never the code
        expect(stored.code_hash).toBe(service.hashCode(sent.code));
        expect(JSON.stringify(stored)).not.toContain(sent.code);
        expect(sent.signupUrl).toBe(
            `https://olympiad.test/signup?code=${encodeURIComponent(sent.code)}`
        );
        expect(stored.email).toBe('ayanda@test.com');
        expect(stored.account_type).toBe('educator');
        expect(stored.invited_by_id).toBe('org-1');
        expect(stored.expires_at.getTime()).toBeGreaterThan(Date.now() + 6 * DAY);
        // The caller is not handed the code when the email went out
        expect(result).toMatchObject({ emailSent: true });
        expect(result).not.toHaveProperty('code');
        expect(result.invitation).toMatchObject({
            email: 'ayanda@test.com',
            status: 'pending',
        });
    });

    it('makes an organiser invite to a school with no coordinator the coordinator', async () => {
        await service.createInvitation(organiser, {
            email: 'a@test.com',
            schoolId: SCHOOL,
        });

        expect(prisma.school_invitations.create.mock.calls[0][0].data.role).toBe(
            'coordinator'
        );
        expect(
            mailer.sendSchoolEducatorInviteEmail.mock.calls[0][0].asCoordinator
        ).toBe(true);
    });

    it('invites an ordinary educator when the school already has a coordinator', async () => {
        prisma.school_memberships.findFirst.mockResolvedValue({ id: 'm-1' });

        await service.createInvitation(organiser, {
            email: 'a@test.com',
            schoolId: SCHOOL,
        });

        expect(prisma.school_invitations.create.mock.calls[0][0].data.role).toBe(
            'educator'
        );
    });

    it('lets a coordinator invite educators to their own school only', async () => {
        prisma.school_memberships.findUnique.mockResolvedValue({
            role: 'coordinator',
            status: 'active',
        });
        // No coordinator lookup result: still only ever an educator for them
        await service.createInvitation(coordinator, { email: 'a@test.com' });
        const data = prisma.school_invitations.create.mock.calls[0][0].data;
        expect(data.school_id).toBe(SCHOOL);
        expect(data.role).toBe('educator');

        await expect(
            service.createInvitation(coordinator, {
                email: 'a@test.com',
                schoolId: OTHER_SCHOOL,
            })
        ).rejects.toMatchObject({ statusCode: 403 });
    });

    it.each([
        ['an educator still awaiting approval', { role: 'educator', status: 'pending' }],
        ['a coordinator still awaiting approval', { role: 'coordinator', status: 'pending' }],
        ['someone with no membership', null],
    ])('refuses %s', async (_label, membership) => {
        prisma.school_memberships.findUnique.mockResolvedValue(membership);

        await expect(
            service.createInvitation(coordinator, { email: 'a@test.com' })
        ).rejects.toMatchObject({ statusCode: 403 });
        expect(prisma.school_invitations.create).not.toHaveBeenCalled();
        expect(mailer.sendSchoolEducatorInviteEmail).not.toHaveBeenCalled();
    });

    it('lets an ordinary ACTIVE educator invite a student and another educator', async () => {
        prisma.school_memberships.findUnique.mockResolvedValue({
            role: 'educator', status: 'active',
        });
        await service.createInvitation(coordinator, { email: 'student@test.com', accountType: 'student' });
        const stored = prisma.school_invitations.create.mock.calls[0][0].data;
        expect(stored).toMatchObject({
            school_id: SCHOOL, role: null, account_type: 'student',
        });
        expect(mailer.sendSchoolEducatorInviteEmail.mock.calls[0][0]).toMatchObject({
            to: 'student@test.com', accountType: 'student',
        });
        await service.createInvitation(coordinator, { email: 'teacher@test.com' });
        const second = prisma.school_invitations.create.mock.calls[1][0].data;
        expect(second).toMatchObject({ account_type: 'educator', role: 'educator' });
    });

    it('never lets an ordinary educator invite to another school', async () => {
        prisma.school_memberships.findUnique.mockResolvedValue({ role: 'educator', status: 'active' });
        await expect(service.createInvitation(coordinator, {
            email: 'student@test.com', schoolId: OTHER_SCHOOL, accountType: 'student',
        })).rejects.toMatchObject({ statusCode: 403 });
    });

    it('does not let organisers issue student codes', async () => {
        await expect(service.createInvitation(organiser, {
            email: 'student@test.com', schoolId: SCHOOL, accountType: 'student',
        })).rejects.toMatchObject({ statusCode: 403 });
        expect(prisma.school_invitations.create).not.toHaveBeenCalled();
    });

    it('replaces an earlier open invitation to the same address', async () => {
        await service.createInvitation(organiser, {
            email: 'a@test.com',
            schoolId: SCHOOL,
        });

        expect(prisma.school_invitations.updateMany).toHaveBeenCalledWith({
            where: {
                school_id: SCHOOL,
                email: 'a@test.com',
                used_at: null,
                revoked_at: null,
            },
            data: { revoked_at: expect.any(Date) },
        });
    });

    it('will not invite an address that already has an account', async () => {
        prisma.users.findUnique.mockResolvedValue({ id: 'u-1' });

        await expect(
            service.createInvitation(organiser, {
                email: 'a@test.com',
                schoolId: SCHOOL,
            })
        ).rejects.toMatchObject({ statusCode: 409 });
        expect(prisma.school_invitations.create).not.toHaveBeenCalled();
    });

    it('needs a school from an organiser, and the school has to exist', async () => {
        await expect(
            service.createInvitation(organiser, { email: 'a@test.com' })
        ).rejects.toMatchObject({ statusCode: 400 });

        prisma.schools.findUnique.mockResolvedValue(null);
        await expect(
            service.createInvitation(organiser, {
                email: 'a@test.com',
                schoolId: SCHOOL,
            })
        ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('hands the code to the inviter when the email could not be delivered', async () => {
        mailer.sendSchoolEducatorInviteEmail.mockResolvedValue({
            delivered: false,
        });

        const result = await service.createInvitation(organiser, {
            email: 'a@test.com',
            schoolId: SCHOOL,
        });

        expect(result.emailSent).toBe(false);
        expect(result.code).toBe(
            mailer.sendSchoolEducatorInviteEmail.mock.calls[0][0].code
        );
        expect(result.signupUrl).toContain('/signup?code=');
        // Still created, so the code works when passed on by hand
        expect(prisma.school_invitations.create).toHaveBeenCalled();
    });
});

describe('listInvitations', () => {
    it('shows an organiser every invitation, or one school’s', async () => {
        prisma.school_invitations.findMany.mockResolvedValue([row()]);

        await service.listInvitations(organiser);
        expect(prisma.school_invitations.findMany.mock.calls[0][0].where).toEqual({});

        await service.listInvitations(organiser, { schoolId: SCHOOL });
        expect(prisma.school_invitations.findMany.mock.calls[1][0].where).toEqual({
            school_id: SCHOOL,
        });
    });

    it('shows a coordinator their own school’s only', async () => {
        prisma.school_memberships.findUnique.mockResolvedValue({
            role: 'coordinator',
            status: 'active',
        });
        prisma.school_invitations.findMany.mockResolvedValue([]);

        await service.listInvitations(coordinator, { schoolId: OTHER_SCHOOL });

        expect(prisma.school_invitations.findMany.mock.calls[0][0].where).toEqual({
            school_id: SCHOOL,
        });
    });

    it('works out each invitation’s status', async () => {
        prisma.school_invitations.findMany.mockResolvedValue([
            row({ id: 'a' }),
            row({ id: 'b', used_at: new Date() }),
            row({ id: 'c', revoked_at: new Date() }),
            row({ id: 'd', expires_at: new Date(Date.now() - 1000) }),
        ]);

        const list = await service.listInvitations(organiser);

        expect(list.map((i) => i.status)).toEqual([
            'pending',
            'used',
            'revoked',
            'expired',
        ]);
    });
});

describe('revokeInvitation', () => {
    const open = { id: 'inv-1', school_id: SCHOOL, used_at: null, revoked_at: null };

    it('cancels an open invitation', async () => {
        prisma.school_invitations.findUnique.mockResolvedValue(open);

        await service.revokeInvitation(organiser, 'inv-1');

        expect(prisma.school_invitations.update).toHaveBeenCalledWith({
            where: { id: 'inv-1' },
            data: { revoked_at: expect.any(Date) },
        });
    });

    it('is harmless to repeat, and refuses a used invitation', async () => {
        prisma.school_invitations.findUnique.mockResolvedValue({
            ...open,
            revoked_at: new Date(),
        });
        await service.revokeInvitation(organiser, 'inv-1');
        expect(prisma.school_invitations.update).not.toHaveBeenCalled();

        prisma.school_invitations.findUnique.mockResolvedValue({
            ...open,
            used_at: new Date(),
        });
        await expect(
            service.revokeInvitation(organiser, 'inv-1')
        ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('keeps a coordinator to their own school and reports a missing invitation', async () => {
        prisma.school_memberships.findUnique.mockResolvedValue({
            role: 'coordinator',
            status: 'active',
        });
        prisma.school_invitations.findUnique.mockResolvedValue({
            ...open,
            school_id: OTHER_SCHOOL,
        });
        await expect(
            service.revokeInvitation(coordinator, 'inv-1')
        ).rejects.toMatchObject({ statusCode: 403 });

        prisma.school_invitations.findUnique.mockResolvedValue(null);
        await expect(
            service.revokeInvitation(coordinator, 'nope')
        ).rejects.toMatchObject({ statusCode: 404 });
    });
});

describe('findUsableInvitation', () => {
    const CODE = 'K7QD-2MXP-9TBW';

    it('finds a pending invitation by the hash of the code, for the right email', async () => {
        prisma.school_invitations.findUnique.mockResolvedValue(row());

        const found = await service.findUsableInvitation(
            'k7qd 2mxp 9tbw',
            'Ayanda@test.com'
        );

        expect(found.school_id).toBe(SCHOOL);
        expect(prisma.school_invitations.findUnique.mock.calls[0][0].where).toEqual({
            code_hash: service.hashCode(CODE),
        });
    });

    it.each([
        ['an unknown code', null],
        ['a used code', row({ used_at: new Date() })],
        ['a revoked code', row({ revoked_at: new Date() })],
        ['an expired code', row({ expires_at: new Date(Date.now() - 1000) })],
        ['a code sent to someone else', row({ email: 'someone@else.com' })],
    ])('refuses %s with the same message', async (_label, invitation) => {
        prisma.school_invitations.findUnique.mockResolvedValue(invitation);

        await expect(
            service.findUsableInvitation(CODE, 'ayanda@test.com')
        ).rejects.toMatchObject({
            statusCode: 400,
            message: service.INVALID_CODE_MESSAGE,
        });
    });

    it('never redeems a student code as an educator or vice versa', async () => {
        prisma.school_invitations.findUnique.mockResolvedValue(row({
            account_type: 'student', role: null,
        }));
        await expect(service.findUsableInvitation(CODE, 'ayanda@test.com', 'educator'))
            .rejects.toMatchObject({ statusCode: 400 });
        await expect(service.findUsableInvitation(CODE, 'ayanda@test.com', 'student'))
            .resolves.toMatchObject({ account_type: 'student' });
    });

    it('refuses a code of the wrong length without a database lookup', async () => {
        await expect(
            service.findUsableInvitation('SHORT', 'a@test.com')
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(prisma.school_invitations.findUnique).not.toHaveBeenCalled();
    });

    it('checkCode tells the signup form the school and the invited address', async () => {
        prisma.school_invitations.findUnique.mockResolvedValue(
            row({ role: 'coordinator' })
        );

        await expect(service.checkCode(CODE)).resolves.toEqual({
            school: { id: SCHOOL, name: 'Parktown High' },
            email: 'ayanda@test.com',
            role: 'coordinator',
            accountType: 'educator',
        });
    });
});

describe('consumeInvitation', () => {
    it('marks it used only if it is still open, unexpired and unrevoked', async () => {
        prisma.school_invitations.updateMany.mockResolvedValue({ count: 1 });

        await service.consumeInvitation(prisma, 'inv-1', 'user-1');

        expect(prisma.school_invitations.updateMany).toHaveBeenCalledWith({
            where: {
                id: 'inv-1',
                used_at: null,
                revoked_at: null,
                expires_at: { gt: expect.any(Date) },
            },
            data: { used_at: expect.any(Date), used_by_id: 'user-1' },
        });
    });

    it('fails when another signup got there first', async () => {
        prisma.school_invitations.updateMany.mockResolvedValue({ count: 0 });

        await expect(
            service.consumeInvitation(prisma, 'inv-1', 'user-1')
        ).rejects.toMatchObject({ statusCode: 400 });
    });
});
