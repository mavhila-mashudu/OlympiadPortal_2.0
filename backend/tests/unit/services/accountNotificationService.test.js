jest.mock('../../../src/config/database', () => ({
    __esModule: true,
    default: require('../helpers/prismaMock').prisma,
}));

const { prisma, resetPrismaMock } = require('../helpers/prismaMock');
const notice = require('../../../src/services/accountNotificationService');

beforeEach(() => {
    resetPrismaMock();
    prisma.school_memberships.findMany.mockResolvedValue([]);
    prisma.users.findMany.mockResolvedValue([]);
});

test('sends a school approval request only to active coordinators', async () => {
    prisma.school_memberships.findMany.mockResolvedValue([{ user_id: 'coordinator-A' }]);
    await notice.notifyPendingSignup(prisma, {
        userId: 'new-user', name: 'Sam', schoolId: 'school-A', type: 'student',
    });
    expect(prisma.users.findMany).not.toHaveBeenCalled();
    expect(prisma.school_memberships.findMany).toHaveBeenCalledWith({
        where: { school_id: 'school-A', role: 'coordinator', status: 'active', users: { deleted_at: null } },
        select: { user_id: true },
    });
    expect(prisma.portal_notifications.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({
            user_id: 'coordinator-A',
            dedupe_key: 'account:signup:new-user:pending:coordinator-A',
            title: 'New school approval request',
        })],
        skipDuplicates: true,
    });
});

test('the first educator signup is routed to organisers instead', async () => {
    prisma.users.findMany.mockResolvedValue([{ id: 'org-A' }, { id: 'org-B' }]);
    await notice.notifyPendingSignup(prisma, {
        userId: 'new-user', name: 'Sam', schoolId: 'school-A', type: 'educator',
    });
    expect(prisma.portal_notifications.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
            expect.objectContaining({ user_id: 'org-A' }),
            expect.objectContaining({ user_id: 'org-B' }),
        ]),
        skipDuplicates: true,
    });
});

test('student requests without a coordinator are not routed to an unauthorised organiser', async () => {
    await notice.notifyPendingSignup(prisma, {
        userId: 'student', name: 'Sam', schoolId: 'school-A', type: 'student',
    });
    expect(prisma.portal_notifications.createMany).not.toHaveBeenCalled();
});

test('a redeemed code notifies only its original inviter', async () => {
    await notice.notifyInvitationAccepted(prisma, {
        invitationId: 'invite-A', invitedById: 'teacher-A', userId: 'user-B',
        name: 'Sam', type: 'educator',
    });
    expect(prisma.portal_notifications.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({
            user_id: 'teacher-A',
            dedupe_key: 'account:invite:invite-A:accepted:teacher-A',
        })], skipDuplicates: true,
    });
});

test.each(['approve', 'reject'])('applicant gets a %s outcome', async (decision) => {
    await notice.notifyDecision(prisma, {
        requestId: 'request-A', userId: 'user-A', decision, type: 'student',
    });
    expect(prisma.portal_notifications.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({
            user_id: 'user-A',
            dedupe_key: `account:approval:student:request-A:${decision}:user-A`,
        })], skipDuplicates: true,
    });
});
