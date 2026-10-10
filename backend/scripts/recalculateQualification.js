// @ts-nocheck
// One-off repair for BUG-055. Before the fix, a round's qualifying threshold
// was compared with raw points instead of a percentage of the paper's marks,
// so released rounds hold the wrong "qualified" flags, and students who did
// qualify were never entered for the next round.
//
// For every released round with a threshold this recalculates qualification
// (and ranks, which now share places on equal scores) with today's rule, and
// enters newly qualified students for the next round if it hasn't opened
// yet, as releasing results does. Nobody is withdrawn from a next round:
// students who no longer qualify are listed for the organiser to decide.
//
//   npx tsx scripts/recalculateQualification.js           # dry run: report only
//   npx tsx scripts/recalculateQualification.js --apply   # make the changes
const {
    qualifies,
    paperMaxPoints,
    competitionRanks,
} = require('../src/services/markingMath');

async function planRound(db, round) {
    const maxPoints = await paperMaxPoints(db, round.id);
    const results = await db.results.findMany({
        where: { round_id: round.id },
        orderBy: [{ total_points: 'desc' }, { id: 'asc' }],
    });
    const ranks = competitionRanks(results);
    const updates = [];
    const gained = [];
    const lost = [];
    results.forEach((result, i) => {
        const qualified = qualifies({
            totalPoints: result.total_points,
            maxPoints,
            threshold: round.qualifying_threshold,
        });
        if (qualified && !result.qualified) gained.push(result.entrant_id);
        if (!qualified && result.qualified) lost.push(result.entrant_id);
        if (qualified !== result.qualified || ranks[i] !== result.rank) {
            updates.push({ id: result.id, rank: ranks[i], qualified });
        }
    });

    const nextRound = await db.rounds.findFirst({
        where: {
            olympiad_id: round.olympiad_id,
            opens_at: { gt: round.opens_at },
        },
        orderBy: { opens_at: 'asc' },
        select: { id: true, name: true, state: true },
    });

    // Only students entered for this round by an educator can be entered for
    // the next one, by the same educator (as at release)
    let toEnter = [];
    if (nextRound && nextRound.state === 'scheduled' && gained.length) {
        const registrations = await db.entrant_registrations.findMany({
            where: { round_id: round.id, entrant_id: { in: gained } },
            select: { entrant_id: true, registered_by: true },
        });
        const already = new Set(
            (
                await db.entrant_registrations.findMany({
                    where: {
                        round_id: nextRound.id,
                        entrant_id: { in: gained },
                    },
                    select: { entrant_id: true },
                })
            ).map((r) => r.entrant_id)
        );
        toEnter = registrations
            .filter((r) => !already.has(r.entrant_id))
            .map((r) => ({
                entrant_id: r.entrant_id,
                round_id: nextRound.id,
                registered_by: r.registered_by,
            }));
    }

    return {
        round,
        maxPoints,
        resultCount: results.length,
        updates,
        gained,
        lost,
        nextRound,
        toEnter,
    };
}

async function recalculateQualification(db, { apply = false } = {}) {
    const rounds = await db.rounds.findMany({
        where: {
            state: 'results_released',
            qualifying_threshold: { not: null },
        },
        orderBy: [{ olympiad_id: 'asc' }, { opens_at: 'asc' }],
        select: {
            id: true,
            name: true,
            olympiad_id: true,
            opens_at: true,
            qualifying_threshold: true,
            olympiads: { select: { name: true } },
        },
    });

    const plans = [];
    for (const round of rounds) {
        const plan = await planRound(db, round);
        if (apply && (plan.updates.length || plan.toEnter.length)) {
            await db.$transaction(async (tx) => {
                for (const { id, rank, qualified } of plan.updates) {
                    await tx.results.update({
                        where: { id },
                        data: { rank, qualified },
                    });
                }
                if (plan.toEnter.length) {
                    await tx.entrant_registrations.createMany({
                        data: plan.toEnter,
                        skipDuplicates: true,
                    });
                }
            });
        }
        plans.push(plan);
    }
    return plans;
}

const describePlan = ({
    round,
    maxPoints,
    resultCount,
    updates,
    gained,
    lost,
    nextRound,
    toEnter,
}) => {
    const lines = [
        `${round.olympiads?.name ?? round.olympiad_id} / ${round.name}: threshold ${Number(round.qualifying_threshold)}% of ${maxPoints} marks, ${resultCount} results`,
        `  now qualify: ${gained.length}, no longer qualify: ${lost.length}, results changed (qualified or rank): ${updates.length}`,
    ];
    if (!nextRound) lines.push('  no next round');
    else if (nextRound.state !== 'scheduled') {
        if (gained.length)
            lines.push(
                `  next round "${nextRound.name}" is already ${nextRound.state}: nobody entered automatically`
            );
    } else
        lines.push(
            `  entered for next round "${nextRound.name}": ${toEnter.length}`
        );
    if (lost.length)
        lines.push(
            `  no longer qualify (left in any next round; decide by hand): ${lost.join(', ')}`
        );
    return lines.join('\n');
};

module.exports = { recalculateQualification, describePlan };

if (require.main === module) {
    require('dotenv').config();
    const apply = process.argv.includes('--apply');
    const prisma = require('../src/config/database').default;
    recalculateQualification(prisma, { apply })
        .then((plans) => {
            console.log(
                apply
                    ? 'APPLIED\n'
                    : 'DRY RUN (nothing changed; add --apply to make these changes)\n'
            );
            for (const plan of plans) console.log(describePlan(plan));
            const total = (key) => plans.reduce((n, p) => n + p[key].length, 0);
            console.log(
                `\n${plans.length} released rounds with a threshold; now qualify: ${total('gained')}, no longer qualify: ${total('lost')}, entered for a next round: ${total('toEnter')}`
            );
        })
        .catch((err) => {
            console.error(err);
            process.exitCode = 1;
        })
        .finally(() => prisma.$disconnect());
}
