// The one-off repair for BUG-055: released rounds' qualification is
// recalculated as a percentage of the paper's marks, and newly qualified
// students are entered for a next round that hasn't opened yet.
const prisma = require('../../src/config/database').default;
const {
    recalculateQualification,
    describePlan,
} = require('../../scripts/recalculateQualification');
const f = require('./helpers/factories');

// A released round on a 10-mark paper with a 60% threshold, saved with the
// old rule (points compared with 60, so nobody qualified): Ayanda 8, Lerato 6,
// Sipho 6, Thabo 3
const setup = async ({ nextState = 'scheduled' } = {}) => {
    const world = await f.createOlympiadWithSchool();
    const { olympiad, school, educator } = world;
    const round = await f.createRound({
        olympiad,
        state: 'results_released',
        qualifying_threshold: 60,
        opens_at: f.hoursFromNow(-48),
        closes_at: f.hoursFromNow(-24),
    });
    const nextRound = await f.createRound({
        olympiad,
        state: nextState,
        opens_at: f.hoursFromNow(24),
        closes_at: f.hoursFromNow(26),
    });
    await f.createPaper({
        round,
        questions: [{ type: 'essay', max_points: 10 }],
    });

    const sat = async (points, rank) => {
        const { entrant } = await f.createStudent({ school });
        await f.registerEntrant({ entrant, round, educator });
        const result = await prisma.results.create({
            data: {
                round_id: round.id,
                entrant_id: entrant.id,
                total_points: points,
                rank,
                qualified: false,
                finalised_at: new Date(),
            },
        });
        return { entrant, result };
    };

    return {
        ...world,
        round,
        nextRound,
        ayanda: await sat(8, 1),
        lerato: await sat(6, 2),
        sipho: await sat(6, 3),
        thabo: await sat(3, 4),
    };
};

const resultOf = async ({ result }) =>
    prisma.results.findUnique({ where: { id: result.id } });
const enteredFor = async (round) =>
    (
        await prisma.entrant_registrations.findMany({
            where: { round_id: round.id },
        })
    )
        .map((r) => r.entrant_id)
        .sort();

it('changes nothing on a dry run, and reports what it would do', async () => {
    const { ayanda, nextRound } = await setup();

    const [plan] = await recalculateQualification(prisma);

    expect(plan.gained).toHaveLength(3);
    expect(plan.toEnter).toHaveLength(3);
    expect(describePlan(plan)).toContain(
        'now qualify: 3, no longer qualify: 0'
    );
    expect((await resultOf(ayanda)).qualified).toBe(false);
    expect(await enteredFor(nextRound)).toEqual([]);
});

it('qualifies students on or over 60% of the paper, shares tied ranks, and enters them for the next round', async () => {
    const { ayanda, lerato, sipho, thabo, educator, nextRound } = await setup();

    await recalculateQualification(prisma, { apply: true });

    expect(
        await Promise.all([ayanda, lerato, sipho, thabo].map(resultOf))
    ).toEqual([
        expect.objectContaining({ qualified: true, rank: 1 }),
        expect.objectContaining({ qualified: true, rank: 2 }),
        expect.objectContaining({ qualified: true, rank: 2 }),
        expect.objectContaining({ qualified: false, rank: 4 }),
    ]);
    expect(await enteredFor(nextRound)).toEqual(
        [ayanda, lerato, sipho].map((s) => s.entrant.id).sort()
    );
    const [registration] = await prisma.entrant_registrations.findMany({
        where: { round_id: nextRound.id },
    });
    expect(registration.registered_by).toBe(educator.id);
});

it('can be run again without changing anything more', async () => {
    const { nextRound } = await setup();
    await recalculateQualification(prisma, { apply: true });

    const [plan] = await recalculateQualification(prisma, { apply: true });

    expect(plan).toMatchObject({
        updates: [],
        gained: [],
        lost: [],
        toEnter: [],
    });
    expect(await enteredFor(nextRound)).toHaveLength(3);
});

it("doesn't enter anyone for a next round that has already opened", async () => {
    const { ayanda, nextRound } = await setup({ nextState: 'open' });

    const [plan] = await recalculateQualification(prisma, { apply: true });

    expect((await resultOf(ayanda)).qualified).toBe(true);
    expect(await enteredFor(nextRound)).toEqual([]);
    expect(describePlan(plan)).toContain(
        'is already open: nobody entered automatically'
    );
});

it("lists, but doesn't withdraw, students who no longer qualify", async () => {
    const { round, thabo, nextRound, educator } = await setup();
    // Saved as qualified under the old rule (3 points against a threshold of 3)
    await prisma.rounds.update({
        where: { id: round.id },
        data: { qualifying_threshold: 3 },
    });
    await prisma.results.updateMany({
        where: { round_id: round.id },
        data: { qualified: true },
    });
    await f.registerEntrant({
        entrant: thabo.entrant,
        round: nextRound,
        educator,
    });
    await prisma.rounds.update({
        where: { id: round.id },
        data: { qualifying_threshold: 60 },
    });

    const [plan] = await recalculateQualification(prisma, { apply: true });

    expect(plan.lost).toEqual([thabo.entrant.id]);
    expect((await resultOf(thabo)).qualified).toBe(false);
    expect(await enteredFor(nextRound)).toEqual([thabo.entrant.id]);
});

it('leaves rounds without a threshold, or not yet released, alone', async () => {
    const { round, ayanda } = await setup();
    await prisma.rounds.update({
        where: { id: round.id },
        data: { qualifying_threshold: null },
    });
    expect(await recalculateQualification(prisma, { apply: true })).toEqual([]);

    await prisma.rounds.update({
        where: { id: round.id },
        data: { qualifying_threshold: 60, state: 'marking' },
    });
    expect(await recalculateQualification(prisma, { apply: true })).toEqual([]);
    expect((await resultOf(ayanda)).qualified).toBe(false);
});
