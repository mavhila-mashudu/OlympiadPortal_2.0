// Olympiad and round management against the real database: ownership,
// counts, schedule rules, lifecycle transitions and deletion.
const prisma = require('../../src/config/database').default;
const olympiadService = require('../../src/services/olympiadService');
const roundService = require('../../src/services/roundService');
const f = require('./helpers/factories');

beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('olympiads', () => {
    it('creates an olympiad with the default timezone, or a chosen one', async () => {
        const organiser = await f.createOrganiser();

        const plain = await olympiadService.createOlympiad({
            name: 'Maths',
            organiserId: organiser.id,
        });
        const custom = await olympiadService.createOlympiad({
            name: 'Science',
            timezone: 'Europe/London',
            organiserId: organiser.id,
        });

        expect(
            await prisma.olympiads.findUnique({ where: { id: plain.id } })
        ).toMatchObject({
            name: 'Maths',
            organiser_id: organiser.id,
            timezone: 'Africa/Johannesburg',
        });
        expect(custom.timezone).toBe('Europe/London');
    });

    it("lists only the organiser's own olympiads, newest first, with round and school counts", async () => {
        const organiser = await f.createOrganiser();
        const older = await f.createOlympiad({
            organiser,
            created_at: new Date('2026-01-01'),
        });
        const newer = await f.createOlympiad({
            organiser,
            created_at: new Date('2026-05-01'),
        });
        await f.createOlympiad(); // someone else's
        await f.createRound({ olympiad: older });
        await f.createRound({ olympiad: older });
        await f.registerSchool(await f.createSchool(), older);

        const list = await olympiadService.listOlympiads(organiser.id);

        expect(list.map((o) => o.id)).toEqual([newer.id, older.id]);
        expect(list[1]._count).toEqual({ rounds: 2, school_registrations: 1 });
        expect(list[0]._count).toEqual({ rounds: 0, school_registrations: 0 });
    });

    it('returns an olympiad with its rounds in opening order', async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });
        const later = await f.createRound({
            olympiad,
            opens_at: f.hoursFromNow(48),
            closes_at: f.hoursFromNow(50),
        });
        const sooner = await f.createRound({
            olympiad,
            opens_at: f.hoursFromNow(1),
            closes_at: f.hoursFromNow(2),
        });

        const found = await olympiadService.getOlympiad(
            olympiad.id,
            organiser.id
        );
        expect(found.rounds.map((r) => r.id)).toEqual([sooner.id, later.id]);
    });

    it("hides another organiser's olympiad", async () => {
        const olympiad = await f.createOlympiad();
        const intruder = await f.createOrganiser();
        await expect(
            olympiadService.getOlympiad(olympiad.id, intruder.id)
        ).rejects.toMatchObject({ statusCode: 403 });
    });
});

describe('creating and listing rounds', () => {
    it('saves a new round as scheduled with its threshold', async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });

        const { round, warnings } = await roundService.createRound({
            olympiadId: olympiad.id,
            organiserId: organiser.id,
            name: 'Round 1',
            notes: 'Calculators allowed',
            opensAt: '2026-10-01T08:00:00Z',
            closesAt: '2026-10-01T10:00:00Z',
            qualifyingThreshold: '55',
        });

        const stored = await prisma.rounds.findUnique({
            where: { id: round.id },
        });
        expect(stored).toMatchObject({
            name: 'Round 1',
            notes: 'Calculators allowed',
            state: 'scheduled',
            exam_status: 'draft',
            opens_at: new Date('2026-10-01T08:00:00Z'),
            closes_at: new Date('2026-10-01T10:00:00Z'),
        });
        expect(String(stored.qualifying_threshold)).toBe('55');
        expect(warnings).toEqual([]);
    });

    it('saves nothing when the schedule is invalid', async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });

        await expect(
            roundService.createRound({
                olympiadId: olympiad.id,
                organiserId: organiser.id,
                name: 'Backwards',
                opensAt: '2026-10-01T10:00:00Z',
                closesAt: '2026-10-01T08:00:00Z',
            })
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(await prisma.rounds.count()).toBe(0);
    });

    it("won't create a round in someone else's olympiad", async () => {
        const olympiad = await f.createOlympiad();
        const intruder = await f.createOrganiser();
        await expect(
            roundService.createRound({
                olympiadId: olympiad.id,
                organiserId: intruder.id,
                name: 'Sneaky',
                opensAt: '2026-10-01T08:00:00Z',
                closesAt: '2026-10-01T10:00:00Z',
            })
        ).rejects.toMatchObject({ statusCode: 403 });
        expect(await prisma.rounds.count()).toBe(0);
    });

    it('lists rounds with how many entrants and submissions each has', async () => {
        const { organiser, olympiad, school, educator } =
            await f.createOlympiadWithSchool();
        const round = await f.createRound({ olympiad, state: 'open' });
        const [a, b] = [
            await f.createEntrant({ school }),
            await f.createEntrant({ school }),
        ];
        await f.registerEntrant({ entrant: a, round, educator });
        await f.registerEntrant({ entrant: b, round, educator });
        await prisma.submissions.create({
            data: {
                round_id: round.id,
                entrant_id: a.id,
                idempotency_key: 'k1',
                round_close_snapshot: round.closes_at,
            },
        });

        const [listed] = await roundService.listRounds(
            olympiad.id,
            organiser.id
        );
        expect(listed._count).toEqual({
            submissions: 1,
            entrant_registrations: 2,
        });
    });
});

describe('updating rounds', () => {
    it('saves a new name, schedule and threshold', async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });
        const round = await f.createRound({
            olympiad,
            qualifying_threshold: '40',
        });

        await roundService.updateRound(round.id, organiser.id, {
            name: 'Renamed',
            opensAt: '2026-11-01T08:00:00Z',
            closesAt: '2026-11-01T11:00:00Z',
            qualifyingThreshold: '',
        });

        expect(
            await prisma.rounds.findUnique({ where: { id: round.id } })
        ).toMatchObject({
            name: 'Renamed',
            opens_at: new Date('2026-11-01T08:00:00Z'),
            closes_at: new Date('2026-11-01T11:00:00Z'),
            qualifying_threshold: null,
        });
    });

    it('checks a new close time against the stored open time', async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });
        const round = await f.createRound({ olympiad });

        await expect(
            roundService.updateRound(round.id, organiser.id, {
                closesAt: new Date(round.opens_at.getTime() - 1000),
            })
        ).rejects.toMatchObject({
            message: 'closes_at must be after opens_at',
        });
        expect(
            (await prisma.rounds.findUnique({ where: { id: round.id } }))
                .closes_at
        ).toEqual(round.closes_at);
    });

    it('refuses to change a round that is already open', async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });
        const round = await f.createRound({
            olympiad,
            state: 'open',
            name: 'Live',
        });

        await expect(
            roundService.updateRound(round.id, organiser.id, {
                name: 'Changed',
            })
        ).rejects.toMatchObject({
            statusCode: 400,
        });
        expect(
            (await prisma.rounds.findUnique({ where: { id: round.id } })).name
        ).toBe('Live');
    });
});

describe('deleting rounds', () => {
    it('deletes an empty scheduled round', async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });
        const round = await f.createRound({ olympiad });

        await roundService.deleteRound(round.id, organiser.id);
        expect(await prisma.rounds.count()).toBe(0);
    });

    it('deletes a scheduled round that already has a paper and questions', async () => {
        // Regression: papers reference rounds with ON DELETE RESTRICT, so this
        // used to fail with a database error (a 500 for the organiser).
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });
        const round = await f.createRound({ olympiad });
        await f.createPaper({
            round,
            file_url: 'rounds/r/paper.pdf',
            questions: [{ type: 'essay' }, { type: 'essay' }],
        });

        await roundService.deleteRound(round.id, organiser.id);

        expect(await prisma.rounds.count()).toBe(0);
        expect(await prisma.papers.count()).toBe(0);
        expect(await prisma.questions.count()).toBe(0);
    });

    it('deletes a scheduled round that already has registered entrants, keeping the entrants', async () => {
        const { organiser, olympiad, school, educator } =
            await f.createOlympiadWithSchool();
        const round = await f.createRound({ olympiad });
        const entrant = await f.createEntrant({ school });
        await f.registerEntrant({ entrant, round, educator });

        await roundService.deleteRound(round.id, organiser.id);

        expect(await prisma.rounds.count()).toBe(0);
        expect(await prisma.entrant_registrations.count()).toBe(0);
        expect(await prisma.entrants.count()).toBe(1);
    });

    it('refuses to delete a round that has opened, and removes nothing', async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });
        const round = await f.createRound({ olympiad, state: 'open' });
        await f.createPaper({ round, questions: [{ type: 'essay' }] });

        await expect(
            roundService.deleteRound(round.id, organiser.id)
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(await prisma.rounds.count()).toBe(1);
        expect(await prisma.papers.count()).toBe(1);
    });

    it("won't delete another organiser's round", async () => {
        const round = await f.createRound({
            olympiad: await f.createOlympiad(),
        });
        const intruder = await f.createOrganiser();
        await expect(
            roundService.deleteRound(round.id, intruder.id)
        ).rejects.toMatchObject({ statusCode: 403 });
        expect(await prisma.rounds.count()).toBe(1);
    });
});

describe('round lifecycle', () => {
    it('walks a round from scheduled to results released, archiving its papers at the end', async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });
        const round = await f.createRound({ olympiad });
        const { paper } = await f.createPaper({ round });
        const school = await f.createSchool();
        const entrant = await f.createEntrant({ school });
        await prisma.results.create({
            data: {
                round_id: round.id,
                entrant_id: entrant.id,
                total_points: 0,
            },
        });

        for (const state of ['open', 'closed', 'marking', 'results_released']) {
            await roundService.setRoundState(round.id, organiser.id, state);
            expect(
                (await prisma.rounds.findUnique({ where: { id: round.id } }))
                    .state
            ).toBe(state);
        }

        expect(
            await prisma.papers.findUnique({ where: { id: paper.id } })
        ).toMatchObject({
            is_archived: true,
            released_at: expect.any(Date),
        });
    });

    it('rejects skipping a step and leaves the state alone', async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });
        const round = await f.createRound({ olympiad });

        await expect(
            roundService.setRoundState(round.id, organiser.id, 'closed')
        ).rejects.toMatchObject({
            statusCode: 400,
        });
        expect(
            (await prisma.rounds.findUnique({ where: { id: round.id } })).state
        ).toBe('scheduled');
    });

    it('auto-marks received submissions when the organiser closes the round', async () => {
        const { organiser, olympiad, school } =
            await f.createOlympiadWithSchool();
        const round = await f.createRound({ olympiad, state: 'open' });
        const { questions } = await f.createPaper({
            round,
            questions: [
                {
                    type: 'mcq',
                    options: ['a', 'b'],
                    correct_option: '1',
                    max_points: 2,
                },
            ],
        });
        const entrant = await f.createEntrant({ school });
        await prisma.submissions.create({
            data: {
                round_id: round.id,
                entrant_id: entrant.id,
                idempotency_key: 'k',
                round_close_snapshot: round.closes_at,
                answers: {
                    create: [
                        { question_id: questions[0].id, answer_value: '1' },
                    ],
                },
            },
        });

        await roundService.setRoundState(round.id, organiser.id, 'closed');

        expect(await prisma.submissions.findFirst()).toMatchObject({
            status: 'automarked',
        });
        const result = await prisma.results.findFirst({
            where: { entrant_id: entrant.id },
        });
        expect(String(result.total_points)).toBe('2');
    });
});
