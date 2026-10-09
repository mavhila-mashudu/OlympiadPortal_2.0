jest.mock('../../../src/config/database', () => ({
    __esModule: true,
    default: require('../helpers/prismaMock').prisma,
}));
// The real config exits when the database and Supabase settings are missing,
// as they are in CI; the dispatcher only needs the portal's address for links
jest.mock('../../../src/config/env', () => ({
    frontend: { url: 'https://portal.test' },
}));
jest.mock('../../../src/lib/mailer', () => ({
    sendNotificationEmail: jest.fn(),
    isMailerConfigured: jest.fn(),
}));

const { prisma, resetPrismaMock } = require('../helpers/prismaMock');
const {
    sendNotificationEmail,
    isMailerConfigured,
} = require('../../../src/lib/mailer');
const {
    processDueNotifications,
} = require('../../../src/services/notificationDispatchService');

const NOW = new Date('2026-06-01T09:00:00Z');

// A round that opened an hour ago, so the built-in "round is now open"
// notice is due for the educators of its one registered school
const openRound = {
    id: 'round-1',
    olympiad_id: 'olympiad-1',
    name: 'Qualifier',
    state: 'open',
    opens_at: new Date('2026-06-01T08:00:00Z'),
    closes_at: new Date('2026-06-02T08:00:00Z'),
    results_release_at: null,
    olympiads: {
        id: 'olympiad-1',
        name: 'Maths Olympiad',
        timezone: 'Africa/Johannesburg',
    },
    _count: { submissions: 0 },
};

beforeEach(() => {
    resetPrismaMock();
    isMailerConfigured.mockReset().mockReturnValue(true);
    sendNotificationEmail.mockReset().mockResolvedValue({ delivered: true });
    prisma.notification_rules.findMany.mockResolvedValue([]);
    prisma.rounds.findMany.mockResolvedValue([openRound]);
    prisma.school_registrations.findMany.mockResolvedValue([
        { school_id: 'school-1' },
    ]);
    prisma.educators.findMany.mockResolvedValue([
        { users: { email: 'a@school.test', deleted_at: null } },
        { users: { email: 'b@school.test', deleted_at: null } },
    ]);
    prisma.sent_notifications.findMany.mockResolvedValue([]);
    // Each email's claim succeeds unless a test says another dispatch holds it
    prisma.sent_notifications.createMany.mockResolvedValue({ count: 1 });
    prisma.sent_notifications.deleteMany.mockResolvedValue({ count: 1 });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

const recordFor = (recipient) => ({
    dedup_key: 'default:round_opens',
    round_id: 'round-1',
    recipient,
});

describe('processDueNotifications', () => {
    it('claims each email before sending it, and keeps the claim once delivered', async () => {
        await expect(processDueNotifications(NOW)).resolves.toEqual({
            due: 1,
            sent: 2,
            failed: 0,
        });

        expect(prisma.sent_notifications.createMany.mock.calls).toEqual([
            [{ data: [recordFor('a@school.test')], skipDuplicates: true }],
            [{ data: [recordFor('b@school.test')], skipDuplicates: true }],
        ]);
        // The claim for an email comes before its send
        expect(
            prisma.sent_notifications.createMany.mock.invocationCallOrder[0]
        ).toBeLessThan(sendNotificationEmail.mock.invocationCallOrder[0]);
        expect(prisma.sent_notifications.deleteMany).not.toHaveBeenCalled();
    });

    it('skips an email another dispatch running at the same time has already claimed', async () => {
        prisma.sent_notifications.createMany
            .mockResolvedValueOnce({ count: 0 })
            .mockResolvedValueOnce({ count: 1 });

        await expect(processDueNotifications(NOW)).resolves.toEqual({
            due: 1,
            sent: 1,
            failed: 0,
        });
        expect(sendNotificationEmail).toHaveBeenCalledTimes(1);
        expect(sendNotificationEmail).toHaveBeenCalledWith(
            expect.objectContaining({ to: 'b@school.test' })
        );
    });

    it('releases the claim on an undelivered email so a later tick retries it', async () => {
        sendNotificationEmail
            .mockResolvedValueOnce({ delivered: false })
            .mockResolvedValueOnce({ delivered: true });

        await expect(processDueNotifications(NOW)).resolves.toEqual({
            due: 1,
            sent: 1,
            failed: 1,
        });

        expect(prisma.sent_notifications.deleteMany).toHaveBeenCalledTimes(1);
        expect(prisma.sent_notifications.deleteMany).toHaveBeenCalledWith({
            where: recordFor('a@school.test'),
        });
    });

    it('counts a send that throws as undelivered and releases its claim', async () => {
        sendNotificationEmail.mockRejectedValue(new Error('network down'));

        await expect(processDueNotifications(NOW)).resolves.toEqual({
            due: 1,
            sent: 0,
            failed: 2,
        });
        expect(prisma.sent_notifications.deleteMany).toHaveBeenCalledTimes(2);
    });

    it('does not resend to recipients already notified', async () => {
        prisma.sent_notifications.findMany.mockResolvedValue([
            {
                dedup_key: 'default:round_opens',
                round_id: 'round-1',
                recipient: 'a@school.test',
            },
        ]);

        await processDueNotifications(NOW);

        expect(sendNotificationEmail).toHaveBeenCalledTimes(1);
        expect(sendNotificationEmail).toHaveBeenCalledWith(
            expect.objectContaining({ to: 'b@school.test' })
        );
    });

    it('skips the pass without touching the database when EmailJS is not configured', async () => {
        isMailerConfigured.mockReturnValue(false);

        await expect(processDueNotifications(NOW)).resolves.toEqual({
            due: 0,
            sent: 0,
            failed: 0,
        });
        expect(prisma.rounds.findMany).not.toHaveBeenCalled();
        expect(sendNotificationEmail).not.toHaveBeenCalled();
    });
});
