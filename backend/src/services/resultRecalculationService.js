// Brings a round's results back in line with its answers after a mark has
// changed (moderation, an organiser's remark decision or an educator's
// re-mark). Totals are re-summed for every submission. Once results are
// released, ranks and qualification are recomputed and the next round's
// enrolment follows: newly qualified entrants are enrolled, and entrants who
// no longer qualify are withdrawn while that round is still scheduled and
// they have not submitted. Runs inside the caller's transaction.
const {
    qualifies,
    paperMaxPoints,
    competitionRanks,
} = require('./markingMath');

async function recalculateRoundResults(tx, roundId) {
    const round = await tx.rounds.findUnique({ where: { id: roundId } });
    const submissions = await tx.submissions.findMany({
        where: { round_id: roundId },
        include: { answers: true },
    });
    for (const submission of submissions) {
        const total = submission.answers.reduce(
            (n, a) => n + Number(a.points_awarded || 0),
            0
        );
        await tx.results.upsert({
            where: {
                round_id_entrant_id: {
                    round_id: roundId,
                    entrant_id: submission.entrant_id,
                },
            },
            create: {
                round_id: roundId,
                entrant_id: submission.entrant_id,
                total_points: total,
            },
            update: { total_points: total },
        });
    }
    if (round.state === 'results_released') {
        // The threshold is a percentage of the paper's marks (markingMath.qualifies)
        const maxPoints = await paperMaxPoints(tx, roundId);
        const passes = (result) =>
            qualifies({
                totalPoints: result.total_points,
                maxPoints,
                threshold: round.qualifying_threshold,
            });
        const results = await tx.results.findMany({
            where: { round_id: roundId },
            orderBy: [{ total_points: 'desc' }, { id: 'asc' }],
        });
        const ranks = competitionRanks(results);
        for (let i = 0; i < results.length; i++) {
            await tx.results.update({
                where: { id: results[i].id },
                data: {
                    rank: ranks[i],
                    qualified: passes(results[i]),
                },
            });
        }
        // Without a threshold nobody advances automatically: the next round's
        // entrants were entered by hand, so they're left alone (as at release)
        if (
            round.qualifying_threshold === null ||
            round.qualifying_threshold === undefined
        )
            return;
        const nextRound = await tx.rounds.findFirst({
            where: {
                olympiad_id: round.olympiad_id,
                opens_at: { gt: round.opens_at },
            },
            orderBy: { opens_at: 'asc' },
            select: { id: true, state: true },
        });
        if (nextRound && ['scheduled', 'open'].includes(nextRound.state)) {
            const previousRegistrations =
                await tx.entrant_registrations.findMany({
                    where: { round_id: roundId },
                    select: { entrant_id: true, registered_by: true },
                });
            const registrants = new Map(
                previousRegistrations.map((r) => [
                    r.entrant_id,
                    r.registered_by,
                ])
            );
            const qualified = new Set(
                results.filter(passes).map((r) => r.entrant_id)
            );
            const newlyQualified = [...qualified].filter((id) =>
                registrants.has(id)
            );
            if (newlyQualified.length)
                await tx.entrant_registrations.createMany({
                    data: newlyQualified.map((id) => ({
                        entrant_id: id,
                        round_id: nextRound.id,
                        registered_by: registrants.get(id),
                    })),
                    skipDuplicates: true,
                });
            const noLongerQualified = [...registrants.keys()].filter(
                (id) => !qualified.has(id)
            );
            if (noLongerQualified.length && nextRound.state === 'scheduled') {
                const submitted = await tx.submissions.findMany({
                    where: {
                        round_id: nextRound.id,
                        entrant_id: { in: noLongerQualified },
                    },
                    select: { entrant_id: true },
                });
                const protectedIds = new Set(
                    submitted.map((s) => s.entrant_id)
                );
                await tx.entrant_registrations.deleteMany({
                    where: {
                        round_id: nextRound.id,
                        entrant_id: {
                            in: noLongerQualified.filter(
                                (id) => !protectedIds.has(id)
                            ),
                        },
                    },
                });
            }
        }
    }
}

module.exports = { recalculateRoundResults };
