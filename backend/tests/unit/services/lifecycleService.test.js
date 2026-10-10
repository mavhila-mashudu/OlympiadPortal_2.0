jest.mock('../../../src/config/database', () => ({
    __esModule: true,
    default: require('../helpers/prismaMock').prisma,
}));
jest.mock('../../../src/services/markingService', () => ({
    autoMarkRoundInternal: jest.fn(),
}));
jest.mock('../../../src/services/notificationDispatchService', () => ({
    processDueNotifications: jest.fn(),
}));

const { prisma, resetPrismaMock } = require('../helpers/prismaMock');
const {
    autoMarkRoundInternal,
} = require('../../../src/services/markingService');
const {
    processDueNotifications,
} = require('../../../src/services/notificationDispatchService');
const { runLifecycleTick } = require('../../../src/services/lifecycleService');

const NOW = new Date('2026-06-01T09:00:00Z');

let consoleLog;
let consoleError;
beforeEach(() => {
    resetPrismaMock();
    prisma.rounds.updateMany.mockResolvedValue({ count: 1 });
    autoMarkRoundInternal.mockReset().mockResolvedValue({ total: 0 });
    processDueNotifications.mockReset().mockResolvedValue({ due: 0, sent: 0 });
    jest.useFakeTimers().setSystemTime(NOW);
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    jest.useRealTimers();
    consoleLog.mockRestore();
    consoleError.mockRestore();
});

// findMany is called three times per tick: rounds to open, rounds to close,
// then closed rounds with sittings still unmarked
const arrange = ({ toOpen = [], toClose = [], leftover = [] }) => {
    prisma.rounds.findMany
        .mockResolvedValueOnce(toOpen)
        .mockResolvedValueOnce(toClose)
        .mockResolvedValueOnce(leftover);
};

describe('runLifecycleTick', () => {
    it('does nothing when no round is due', async () => {
        arrange({});
        await expect(runLifecycleTick()).resolves.toEqual({
            opened: 0,
            closed: 0,
        });
        expect(prisma.rounds.updateMany).not.toHaveBeenCalled();
        expect(autoMarkRoundInternal).not.toHaveBeenCalled();
    });

    it('looks for scheduled rounds past their open time and open rounds past their close time', async () => {
        arrange({});
        await runLifecycleTick();
        expect(prisma.rounds.findMany).toHaveBeenNthCalledWith(1, {
            where: { state: 'scheduled', opens_at: { lte: NOW } },
            select: { id: true, name: true, olympiad_id: true },
        });
        expect(prisma.rounds.findMany).toHaveBeenNthCalledWith(2, {
            where: { state: 'open', closes_at: { lte: NOW } },
            select: { id: true, name: true, olympiad_id: true },
        });
    });

    it('opens each due round and logs the transition', async () => {
        arrange({
            toOpen: [
                { id: 'r1', name: 'A' },
                { id: 'r2', name: 'B' },
            ],
        });
        await expect(runLifecycleTick()).resolves.toEqual({
            opened: 2,
            closed: 0,
        });
        expect(prisma.rounds.updateMany).toHaveBeenCalledWith({
            where: { id: 'r1', state: 'scheduled', opens_at: { lte: NOW } },
            data: { state: 'open' },
        });
        expect(prisma.round_events.createMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: [expect.objectContaining({ kind: 'round_opened' })],
            })
        );
    });

    it('closes due rounds and auto-marks each one', async () => {
        arrange({
            toClose: [
                { id: 'r3', name: 'C' },
                { id: 'r4', name: 'D' },
            ],
        });
        await expect(runLifecycleTick()).resolves.toEqual({
            opened: 0,
            closed: 2,
        });
        expect(prisma.rounds.updateMany).toHaveBeenCalledWith({
            where: { id: 'r3', state: 'open', closes_at: { lte: NOW } },
            data: { state: 'closed', closed_at: NOW },
        });
        expect(autoMarkRoundInternal.mock.calls).toEqual([['r3'], ['r4']]);
    });

    it('keeps marking the other rounds if one fails', async () => {
        arrange({
            toClose: [
                { id: 'r3', name: 'C' },
                { id: 'r4', name: 'D' },
            ],
        });
        autoMarkRoundInternal
            .mockRejectedValueOnce(new Error('bad data'))
            .mockResolvedValueOnce({ total: 1 });

        await expect(runLifecycleTick()).resolves.toEqual({
            opened: 0,
            closed: 2,
        });
        expect(autoMarkRoundInternal).toHaveBeenCalledTimes(2);
        expect(consoleError).toHaveBeenCalledWith(
            expect.stringContaining('bad data')
        );
    });

    it('opens and closes in the same tick', async () => {
        arrange({
            toOpen: [{ id: 'r1', name: 'A' }],
            toClose: [{ id: 'r2', name: 'B' }],
        });
        await expect(runLifecycleTick()).resolves.toEqual({
            opened: 1,
            closed: 1,
        });
        expect(prisma.rounds.updateMany).toHaveBeenCalledTimes(2);
    });

    it('dispatches due notifications after the transitions', async () => {
        arrange({ toOpen: [{ id: 'r1', name: 'A' }] });
        processDueNotifications.mockResolvedValueOnce({ due: 3, sent: 2 });

        await runLifecycleTick();
        expect(processDueNotifications).toHaveBeenCalledWith(NOW);
        expect(consoleLog).toHaveBeenCalledWith(
            '[lifecycle] dispatched 2 notification email(s)'
        );
    });

    it('warns about notification emails that were not delivered', async () => {
        arrange({});
        const consoleWarn = jest
            .spyOn(console, 'warn')
            .mockImplementation(() => {});
        processDueNotifications.mockResolvedValueOnce({
            due: 1,
            sent: 0,
            failed: 2,
        });

        await runLifecycleTick();
        expect(consoleWarn).toHaveBeenCalledWith(
            '[lifecycle] 2 notification email(s) not delivered; retrying next tick'
        );
    });

    it('marks sittings left unmarked in rounds that have already closed', async () => {
        arrange({ leftover: [{ id: 'r9', name: 'Final' }] });
        autoMarkRoundInternal.mockResolvedValueOnce({
            total: 2,
            processed: [
                { submissionId: 'late-2', status: 'processed' },
                { submissionId: 'late-1', status: 'processed' },
            ],
        });

        await runLifecycleTick();

        expect(prisma.rounds.findMany).toHaveBeenNthCalledWith(3, {
            where: {
                state: { in: ['closed', 'marking'] },
                submissions: { some: { status: 'received' } },
            },
            select: { id: true, name: true },
        });
        expect(autoMarkRoundInternal).toHaveBeenCalledWith('r9');
        // Logged once per batch: the key comes from the (sorted) sittings marked
        expect(prisma.round_events.createMany).toHaveBeenCalledWith({
            data: [
                expect.objectContaining({
                    round_id: 'r9',
                    kind: 'late_sittings_automarked',
                    event_key: expect.stringMatching(
                        /^mark-late:r9:[0-9a-f]{16}$/
                    ),
                    details: { submissions: 2 },
                }),
            ],
            skipDuplicates: true,
        });
        expect(consoleLog).toHaveBeenCalledWith(
            '[lifecycle] auto-marked 2 late sitting(s) for round "Final"'
        );
    });

    it('logs nothing for a leftover round another marker had already dealt with', async () => {
        arrange({ leftover: [{ id: 'r9', name: 'Final' }] });
        autoMarkRoundInternal.mockResolvedValueOnce({
            total: 1,
            processed: [{ submissionId: 's', status: 'already_marked' }],
        });

        await runLifecycleTick();
        expect(prisma.round_events.createMany).not.toHaveBeenCalled();
    });

    it('keeps the tick alive when notification dispatch fails', async () => {
        arrange({});
        processDueNotifications.mockRejectedValueOnce(new Error('mailer down'));

        await expect(runLifecycleTick()).resolves.toEqual({
            opened: 0,
            closed: 0,
        });
        expect(consoleError).toHaveBeenCalledWith(
            '[lifecycle] notification dispatch failed: mailer down'
        );
    });
});
