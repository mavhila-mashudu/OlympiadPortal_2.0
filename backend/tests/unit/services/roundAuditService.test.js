jest.mock('../../../src/config/database', () => ({
    __esModule: true,
    default: require('../helpers/prismaMock').prisma,
}));
const { prisma, resetPrismaMock } = require('../helpers/prismaMock');
const {
    deadlineDecision,
    replayRound,
} = require('../../../src/services/roundAuditService');

beforeEach(resetPrismaMock);

it('uses an exclusive deadline boundary for both submission routes', () => {
    const close = new Date('2026-09-25T10:00:00.000Z');
    expect(
        deadlineDecision(new Date(close.getTime() - 1), close).accepted
    ).toBe(true);
    expect(deadlineDecision(close, close).accepted).toBe(false);
    expect(
        deadlineDecision(new Date(close.getTime() + 1), close).accepted
    ).toBe(false);
});

it("returns an owned round's actions and deadline rulings in time order", async () => {
    prisma.rounds.findFirst.mockResolvedValue({ id: 'round-1', name: 'Final' });
    prisma.round_events.findMany.mockResolvedValue([
        {
            id: 'event-2',
            occurred_at: new Date('2026-09-25T10:01:00Z'),
            kind: 'round_closed',
            origin: 'lifecycle',
            details: {},
        },
    ]);
    prisma.submission_deadline_decisions.findMany.mockResolvedValue([
        {
            id: 'decision-1',
            decided_at: new Date('2026-09-25T10:00:00Z'),
            entrant_id: 'entrant-1',
            accepted: false,
            closes_at: new Date('2026-09-25T10:00:00Z'),
            route: 'online',
            explanation: 'At deadline',
        },
    ]);
    const replay = await replayRound('round-1', 'organiser-1');
    expect(replay.timeline.map((e) => e.kind)).toEqual([
        'submission_deadline_decision',
        'round_closed',
    ]);
    expect(prisma.rounds.findFirst).toHaveBeenCalledWith({
        where: { id: 'round-1', olympiads: { organiser_id: 'organiser-1' } },
        select: {
            id: true,
            name: true,
            opens_at: true,
            closes_at: true,
            state: true,
        },
    });
});

it("does not reveal a missing or foreign round's timeline", async () => {
    prisma.rounds.findFirst.mockResolvedValue(null);
    await expect(
        replayRound('round-1', 'other-organiser')
    ).rejects.toMatchObject({
        statusCode: 404,
    });
    expect(prisma.round_events.findMany).not.toHaveBeenCalled();
});
