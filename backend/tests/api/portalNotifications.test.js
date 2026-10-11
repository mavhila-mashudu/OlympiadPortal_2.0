// The in-app inbox behind the notification bell: each user reads only their
// own notifications, newest first, and marks them read.
const prisma = require('../../src/config/database').default;
const f = require('../integration/helpers/factories');
const { as, expectError, expectOk } = require('./helpers/api');

const notify = (user, overrides = {}) =>
    prisma.portal_notifications.create({
        data: {
            user_id: user.id,
            dedupe_key: `test:${Math.random()}`,
            title: 'Round opens soon',
            body: 'Qualifier opens at 2026-10-01T11:00:00.000Z.',
            ...overrides,
        },
    });

describe('GET /notifications', () => {
    it("lists the user's own notifications, newest first", async () => {
        const { user } = await f.createEducator();
        const someoneElse = (await f.createEducator()).user;
        const older = await notify(user, {
            title: 'Older',
            created_at: new Date('2026-10-01T09:00:00Z'),
        });
        const newer = await notify(user, {
            title: 'Newer',
            created_at: new Date('2026-10-01T10:00:00Z'),
        });
        await notify(someoneElse, { title: 'Not yours' });

        const { notifications } = expectOk(
            await as(user).get('/notifications')
        );
        expect(notifications.map((n) => n.id)).toEqual([newer.id, older.id]);
        expect(notifications[0]).toEqual({
            id: newer.id,
            title: 'Newer',
            body: 'Qualifier opens at 2026-10-01T11:00:00.000Z.',
            created_at: '2026-10-01T10:00:00.000Z',
            read_at: null,
            round_id: null,
        });
    });

    it('returns at most the 50 most recent', async () => {
        const { user } = await f.createEducator();
        await prisma.portal_notifications.createMany({
            data: Array.from({ length: 55 }, (_, i) => ({
                user_id: user.id,
                dedupe_key: `bulk:${i}`,
                title: `Note ${i}`,
                body: '…',
                created_at: new Date(Date.UTC(2026, 9, 1, 0, i)),
            })),
        });

        const { notifications } = expectOk(
            await as(user).get('/notifications')
        );
        expect(notifications).toHaveLength(50);
        expect(notifications[0].title).toBe('Note 54');
    });

    it('is empty for a user with no notifications', async () => {
        const student = await f.createUser('student');
        expect(expectOk(await as(student).get('/notifications'))).toEqual({
            notifications: [],
        });
    });
});

describe('PATCH /notifications/:notificationId/read', () => {
    it("marks the user's notification read, and leaves the first read time alone", async () => {
        const { user } = await f.createEducator();
        const note = await notify(user);

        expectOk(await as(user).patch(`/notifications/${note.id}/read`));
        const { read_at: firstRead } =
            await prisma.portal_notifications.findUnique({
                where: { id: note.id },
            });
        expect(firstRead).toBeInstanceOf(Date);

        expectOk(await as(user).patch(`/notifications/${note.id}/read`));
        expect(
            (
                await prisma.portal_notifications.findUnique({
                    where: { id: note.id },
                })
            ).read_at
        ).toEqual(firstRead);
    });

    it("can't mark someone else's notification read", async () => {
        const { user } = await f.createEducator();
        const intruder = (await f.createEducator()).user;
        const note = await notify(user);

        // Answers the same way as for the owner, so it doesn't reveal whether the id exists
        expectOk(await as(intruder).patch(`/notifications/${note.id}/read`));
        expect(
            (
                await prisma.portal_notifications.findUnique({
                    where: { id: note.id },
                })
            ).read_at
        ).toBeNull();
    });

    it('rejects a malformed id', async () => {
        const { user } = await f.createEducator();
        expectError(
            await as(user).patch('/notifications/not-a-uuid/read'),
            400,
            'Invalid ID format'
        );
    });
});
