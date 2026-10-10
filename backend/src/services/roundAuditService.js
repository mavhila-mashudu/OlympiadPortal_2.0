// An append-only timeline for organisers. Callers supply stable keys for
// scheduled jobs so retries never invent a second occurrence.
const prisma = require('../config/database').default;
const { NotFoundError, BadRequestError } = require('../errors/AppError');

async function recordRoundEvent(
    roundId,
    kind,
    origin,
    eventKey,
    details = {},
    db = prisma,
    occurredAt = new Date()
) {
    await db.round_events.createMany({
        data: [
            {
                round_id: roundId,
                kind,
                origin,
                event_key: eventKey,
                details,
                occurred_at: occurredAt,
            },
        ],
        skipDuplicates: true,
    });
}

function deadlineDecision(now, closesAt) {
    if (!closesAt)
        throw new BadRequestError(
            'A round closing time is required to settle a submission'
        );
    const deadline = new Date(closesAt);
    const accepted = now.getTime() < deadline.getTime();
    return {
        accepted,
        decided_at: now,
        closes_at: deadline,
        explanation: accepted
            ? 'Received before the closing instant (exclusive boundary).'
            : 'Received at or after the closing instant (exclusive boundary).',
    };
}

// Whether the round was open when a request arrived. A round the lifecycle job
// closed while the request was still being handled was open at arrival: under
// peak load many requests arrive in the last second, and the close must not
// turn away the ones that arrived before it. closed_at is null for rounds
// closed before it was recorded, which keeps the stricter rule for them.
function wasOpenAt(receivedAt, round) {
    if (round.state === 'open') return true;
    return (
        ['closed', 'marking'].includes(round.state) &&
        round.closed_at != null &&
        receivedAt.getTime() < new Date(round.closed_at).getTime()
    );
}

async function recordDeadlineDecision(
    roundId,
    entrantId,
    route,
    decision,
    db = prisma
) {
    return db.submission_deadline_decisions.create({
        data: { round_id: roundId, entrant_id: entrantId, route, ...decision },
    });
}

async function replayRound(roundId, organiserId) {
    const round = await prisma.rounds.findFirst({
        where: { id: roundId, olympiads: { organiser_id: organiserId } },
        select: {
            id: true,
            name: true,
            opens_at: true,
            closes_at: true,
            state: true,
        },
    });
    if (!round) throw new NotFoundError('Round not found');
    const [events, decisions] = await Promise.all([
        prisma.round_events.findMany({
            where: { round_id: roundId },
            orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }],
        }),
        prisma.submission_deadline_decisions.findMany({
            where: { round_id: roundId },
            orderBy: [{ decided_at: 'asc' }, { id: 'asc' }],
        }),
    ]);
    const timeline = [
        ...events.map((event) => ({
            id: event.id,
            at: event.occurred_at,
            kind: event.kind,
            origin: event.origin,
            details: event.details,
        })),
        ...decisions.map((d) => ({
            id: d.id,
            at: d.decided_at,
            kind: 'submission_deadline_decision',
            origin: d.route,
            details: {
                entrant_id: d.entrant_id,
                accepted: d.accepted,
                closes_at: d.closes_at,
                explanation: d.explanation,
            },
        })),
    ].sort(
        (a, b) => new Date(a.at) - new Date(b.at) || a.id.localeCompare(b.id)
    );
    return { round, timeline };
}

module.exports = {
    recordRoundEvent,
    deadlineDecision,
    wasOpenAt,
    recordDeadlineDecision,
    replayRound,
};
