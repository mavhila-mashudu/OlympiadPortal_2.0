jest.mock('../../../src/config/database', () => ({
    __esModule: true,
    default: require('../helpers/prismaMock').prisma,
}));
jest.mock('../../../src/middlewares/auth', () => ({
    forgetCachedUser: jest.fn(),
}));
jest.mock('../../../src/lib/mailer', () => ({
    sendEducatorApprovalEmail: jest.fn().mockResolvedValue({ delivered: true }),
}));

const { prisma, resetPrismaMock } = require('../helpers/prismaMock');
const { forgetCachedUser } = require('../../../src/middlewares/auth');
const { sendEducatorApprovalEmail } = require('../../../src/lib/mailer');
const service = require('../../../src/services/membershipApprovalService');

const coordinator = { role: 'educator', userId: 'coord-1', schoolId: 'school-1' };
const pendingStudent = {
    id: 'ent-new',
    user_id: 'stu-1',
    school_id: 'school-1',
    full_name: 'Thandi Mokoena',
    status: 'pending',
};

beforeEach(() => {
    resetPrismaMock();
    forgetCachedUser.mockReset();
    sendEducatorApprovalEmail.mockReset().mockResolvedValue({ delivered: true });
    prisma.entrants.findUnique.mockResolvedValue(pendingStudent);
    prisma.school_memberships.findUnique.mockResolvedValue({
        role: 'coordinator',
        status: 'active',
    });
    prisma.entrants.findFirst.mockResolvedValue(null);
    prisma.entrants.update.mockImplementation(async ({ where, data }) => ({
        id: where.id,
        user_id: data.user_id ?? 'stu-1',
        status: data.status,
    }));
});

describe('decideRequest', () => {
    it('emails an educator after approval and keeps contact details out of the response', async () => {
        prisma.school_memberships.findUnique.mockResolvedValue({
            id: 'mem-1',
            user_id: 'edu-1',
            school_id: 'school-1',
            role: 'coordinator',
            status: 'pending',
        });
        prisma.school_memberships.findFirst.mockResolvedValue(null);
        prisma.school_memberships.update.mockResolvedValue({
            id: 'mem-1',
            user_id: 'edu-1',
            role: 'coordinator',
            status: 'active',
            users: { full_name: 'Thandi Mokoena', email: 'thandi@example.test' },
            schools: { name: 'Parktown High' },
        });

        const result = await service.decideRequest(
            { role: 'organiser', userId: 'org-1' },
            'mem-1',
            'approve'
        );

        expect(sendEducatorApprovalEmail).toHaveBeenCalledWith({
            to: 'thandi@example.test',
            fullName: 'Thandi Mokoena',
            schoolName: 'Parktown High',
        });
        expect(result).toEqual({
            id: 'mem-1',
            user_id: 'edu-1',
            role: 'coordinator',
            status: 'active',
        });
    });
});

describe('decideStudentRequest', () => {
    it('approves a pending student and clears their cached permissions', async () => {
        const result = await service.decideStudentRequest(
            coordinator,
            'ent-new',
            'approve'
        );

        expect(prisma.entrants.update).toHaveBeenCalledWith({
            where: { id: 'ent-new', status: 'pending' },
            data: { status: 'active' },
            select: { id: true, status: true, user_id: true },
        });
        expect(prisma.entrants.delete).not.toHaveBeenCalled();
        expect(result.status).toBe('active');
        expect(forgetCachedUser).toHaveBeenCalledWith('stu-1');
    });

    it('adds an in-app decision notification for the student', async () => {
        await service.decideStudentRequest(coordinator, 'ent-new', 'approve');

        expect(prisma.portal_notifications.createMany).toHaveBeenCalledWith({
            data: [expect.objectContaining({
                user_id: 'stu-1',
                title: 'School membership approved',
            })],
            skipDuplicates: true,
        });
    });

    it('rejects a pending student', async () => {
        const result = await service.decideStudentRequest(
            coordinator,
            'ent-new',
            'reject'
        );

        expect(prisma.entrants.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: { status: 'rejected' } })
        );
        expect(result.status).toBe('rejected');
    });

    it('never links by name alone: two students may share one', async () => {
        // A listed entrant with the same name exists, but the coordinator did not pick it
        prisma.entrants.findFirst.mockResolvedValue({ id: 'ent-listed' });

        await service.decideStudentRequest(coordinator, 'ent-new', 'approve');

        expect(prisma.entrants.findFirst).not.toHaveBeenCalled();
        expect(prisma.entrants.delete).not.toHaveBeenCalled();
        expect(prisma.entrants.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'ent-new', status: 'pending' },
                data: { status: 'active' },
            })
        );
    });

    it('links the login to the listed record the coordinator chose', async () => {
        prisma.entrants.findFirst.mockResolvedValue({ id: 'ent-listed' });

        await service.decideStudentRequest(
            coordinator,
            'ent-new',
            'approve',
            'ent-listed'
        );

        // Only an unclaimed, active record of the student's own school qualifies
        expect(prisma.entrants.findFirst).toHaveBeenCalledWith({
            where: {
                id: 'ent-listed',
                school_id: 'school-1',
                user_id: null,
                status: 'active',
            },
            select: { id: true },
        });
        // The pending row goes first so the login's unique link is free
        expect(prisma.entrants.delete).toHaveBeenCalledWith({
            where: { id: 'ent-new' },
        });
        expect(prisma.entrants.update).toHaveBeenCalledWith({
            where: { id: 'ent-listed' },
            data: { user_id: 'stu-1', status: 'active' },
            select: { id: true, status: true, user_id: true },
        });
    });

    it('will not link to a record that has been claimed or does not exist', async () => {
        prisma.entrants.findFirst.mockResolvedValue(null);

        await expect(
            service.decideStudentRequest(
                coordinator,
                'ent-new',
                'approve',
                'ent-gone'
            )
        ).rejects.toMatchObject({ statusCode: 409 });
        expect(prisma.entrants.delete).not.toHaveBeenCalled();
        expect(prisma.entrants.update).not.toHaveBeenCalled();
    });

    it('does not link anything when the student is only rejected', async () => {
        prisma.entrants.findFirst.mockResolvedValue({ id: 'ent-listed' });

        await service.decideStudentRequest(
            coordinator,
            'ent-new',
            'reject',
            'ent-listed'
        );

        expect(prisma.entrants.findFirst).not.toHaveBeenCalled();
        expect(prisma.entrants.delete).not.toHaveBeenCalled();
    });

    it('refuses anyone who is not the active coordinator of the student\'s school', async () => {
        for (const membership of [
            null,
            { role: 'educator', status: 'active' },
            { role: 'coordinator', status: 'pending' },
        ]) {
            prisma.school_memberships.findUnique.mockResolvedValue(membership);
            await expect(
                service.decideStudentRequest(coordinator, 'ent-new', 'approve')
            ).rejects.toMatchObject({ statusCode: 403 });
        }
        expect(prisma.entrants.update).not.toHaveBeenCalled();
    });

    it('looks up the coordinator role in the student\'s own school', async () => {
        await service.decideStudentRequest(coordinator, 'ent-new', 'approve');

        expect(prisma.school_memberships.findUnique).toHaveBeenCalledWith({
            where: {
                user_id_school_id: { user_id: 'coord-1', school_id: 'school-1' },
            },
        });
    });

    it('refuses organisers and students', async () => {
        for (const role of ['organiser', 'student']) {
            await expect(
                service.decideStudentRequest(
                    { role, userId: 'x', schoolId: null },
                    'ent-new',
                    'approve'
                )
            ).rejects.toMatchObject({ statusCode: 403 });
        }
    });

    it('will not decide a request twice', async () => {
        prisma.entrants.findUnique.mockResolvedValue({
            ...pendingStudent,
            status: 'active',
        });

        await expect(
            service.decideStudentRequest(coordinator, 'ent-new', 'approve')
        ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('is not found for an entrant that has no login', async () => {
        prisma.entrants.findUnique.mockResolvedValue({
            ...pendingStudent,
            user_id: null,
        });

        await expect(
            service.decideStudentRequest(coordinator, 'ent-new', 'approve')
        ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('rejects an unknown decision', async () => {
        await expect(
            service.decideStudentRequest(coordinator, 'ent-new', 'maybe')
        ).rejects.toMatchObject({ statusCode: 400 });
    });
});

describe('decideRequestById', () => {
    const membershipRequest = {
        id: 'mem-1',
        user_id: 'edu-1',
        school_id: 'school-1',
        role: 'educator',
        status: 'pending',
    };

    it('decides a staff membership when the id is a school membership', async () => {
        prisma.school_memberships.findUnique.mockResolvedValue(
            membershipRequest
        );
        prisma.school_memberships.findFirst.mockResolvedValue(null);
        prisma.school_memberships.update.mockResolvedValue({
            id: 'mem-1',
            status: 'active',
            role: 'coordinator',
            user_id: 'edu-1',
        });

        const decided = await service.decideRequestById(
            { role: 'organiser', userId: 'org-1' },
            'mem-1',
            'approve'
        );

        expect(decided.membership).toMatchObject({ id: 'mem-1', status: 'active' });
        expect(decided).not.toHaveProperty('student');
        expect(prisma.entrants.findUnique).not.toHaveBeenCalled();
    });

    it('decides a student signup when the id is in entrants', async () => {
        // The dispatch lookup misses the membership table; the coordinator
        // check inside decideStudentRequest still sees the real membership
        prisma.school_memberships.findUnique.mockResolvedValueOnce(null);

        const decided = await service.decideRequestById(
            coordinator,
            'ent-new',
            'approve'
        );

        expect(decided.student).toMatchObject({ id: 'ent-new', status: 'active' });
        expect(decided).not.toHaveProperty('membership');
    });

    it('is not found when the id matches neither kind', async () => {
        prisma.school_memberships.findUnique.mockResolvedValue(null);
        prisma.entrants.findUnique.mockResolvedValue(null);

        await expect(
            service.decideRequestById(coordinator, 'gone', 'approve')
        ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('rejects an unknown decision before looking anything up', async () => {
        await expect(
            service.decideRequestById(coordinator, 'ent-new', 'maybe')
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(prisma.school_memberships.findUnique).not.toHaveBeenCalled();
    });
});

describe('listRequests for a coordinator', () => {
    it('includes pending students with the listed entrants that share their name', async () => {
        prisma.school_memberships.findUnique.mockResolvedValue({
            role: 'coordinator',
            status: 'active',
        });
        prisma.school_memberships.findMany.mockResolvedValue([
            { id: 'm-1', created_at: '2026-10-10T08:00:00Z', role: 'educator' },
        ]);
        prisma.entrants.findMany
            .mockResolvedValueOnce([
                {
                    id: 'ent-new',
                    school_id: 'school-1',
                    user_id: 'stu-1',
                    status: 'pending',
                    full_name: 'Thandi Mokoena',
                    created_at: '2026-10-10T09:00:00Z',
                    users: { full_name: 'Thandi Mokoena', email: 't@x.test' },
                    schools: { name: 'Parktown' },
                },
            ])
            .mockResolvedValueOnce([
                { id: 'ent-a', full_name: 'THANDI MOKOENA', grade: '11', external_ref: 'STU-001' },
                { id: 'ent-b', full_name: 'Someone Else', grade: '10', external_ref: null },
            ]);

        const requests = await service.listRequests(coordinator);

        expect(requests.map((r) => [r.id, r.kind])).toEqual([
            ['m-1', 'educator'],
            ['ent-new', 'student'],
        ]);
        expect(requests[1]).toMatchObject({
            role: 'student',
            candidates: [
                { id: 'ent-a', full_name: 'THANDI MOKOENA', grade: '11', external_ref: 'STU-001' },
            ],
        });
        expect(requests[1]).not.toHaveProperty('full_name');
    });

    it('does not show students to an organiser', async () => {
        prisma.school_memberships.findMany.mockResolvedValue([]);

        await service.listRequests({ role: 'organiser', userId: 'org-1' });

        expect(prisma.entrants.findMany).not.toHaveBeenCalled();
    });
});
