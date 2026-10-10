// What educators and students see and do across rounds: entrant registration
// with round progression, results, past papers, and the student dashboard.
jest.mock(
    '../../src/config/supabase',
    () => require('./helpers/externalMocks').supabase
);

const prisma = require('../../src/config/database').default;
const educatorService = require('../../src/services/educatorService');
const studentRoundService = require('../../src/services/studentRoundService');
const { supabase, resetExternalMocks } = require('./helpers/externalMocks');
const f = require('./helpers/factories');

beforeEach(resetExternalMocks);

// An olympiad with two rounds. Round 1 has released results in which Ayanda
// qualified and Ben didn't. Round 2 is upcoming.
const setupTwoRounds = async () => {
    const world = await f.createOlympiadWithSchool();
    const { olympiad, school, educator } = world;
    const round1 = await f.createRound({
        olympiad,
        name: 'Round 1',
        state: 'results_released',
        opens_at: f.hoursFromNow(-72),
        closes_at: f.hoursFromNow(-70),
        qualifying_threshold: '50',
    });
    const round2 = await f.createRound({
        olympiad,
        name: 'Round 2',
        opens_at: f.hoursFromNow(24),
        closes_at: f.hoursFromNow(26),
    });
    const ayanda = await f.createEntrant({
        school,
        full_name: 'Ayanda Khumalo',
        external_ref: 'STU-1',
        grade: '10',
    });
    const ben = await f.createEntrant({
        school,
        full_name: 'Ben Smith',
        external_ref: 'STU-2',
        grade: '11',
    });
    for (const e of [ayanda, ben])
        await f.registerEntrant({ entrant: e, round: round1, educator });
    await prisma.results.create({
        data: {
            round_id: round1.id,
            entrant_id: ayanda.id,
            total_points: 80,
            rank: 1,
            qualified: true,
        },
    });
    await prisma.results.create({
        data: {
            round_id: round1.id,
            entrant_id: ben.id,
            total_points: 30,
            rank: 2,
            qualified: false,
        },
    });
    return { ...world, round1, round2, ayanda, ben };
};

describe('educator: registering entrants', () => {
    it('creates new learners and registers them for a first round', async () => {
        const { olympiad, educatorUser, school } =
            await f.createOlympiadWithSchool();
        const round = await f.createRound({ olympiad });

        const registered = await educatorService.registerEntrants(
            round.id,
            educatorUser.id,
            [
                {
                    full_name: 'Ayanda Khumalo',
                    grade: 10,
                    external_ref: 'STU-1',
                },
                { full_name: 'Ben Smith' },
            ]
        );

        expect(registered.map((e) => e.full_name)).toEqual([
            'Ayanda Khumalo',
            'Ben Smith',
        ]);
        expect(
            await prisma.entrants.findMany({
                where: { school_id: school.id },
                orderBy: { full_name: 'asc' },
            })
        ).toMatchObject([
            { full_name: 'Ayanda Khumalo', grade: '10', external_ref: 'STU-1' },
            { full_name: 'Ben Smith', grade: null, external_ref: null },
        ]);
        expect(
            await prisma.entrant_registrations.count({
                where: { round_id: round.id },
            })
        ).toBe(2);
    });

    it('updates existing learners instead of duplicating them when re-registered', async () => {
        const { olympiad, educatorUser } = await f.createOlympiadWithSchool();
        const round = await f.createRound({ olympiad });
        await educatorService.registerEntrants(round.id, educatorUser.id, [
            { full_name: 'Ayanda K', external_ref: 'STU-1', grade: 9 },
        ]);

        await educatorService.registerEntrants(round.id, educatorUser.id, [
            { full_name: 'Ayanda Khumalo', external_ref: 'STU-1', grade: 10 },
        ]);

        expect(await prisma.entrants.findMany()).toMatchObject([
            { full_name: 'Ayanda Khumalo', grade: '10' },
        ]);
        expect(await prisma.entrant_registrations.count()).toBe(1);
        expect(
            (await educatorService.listEntrants(round.id, educatorUser.id)).map(
                (e) => e.full_name
            )
        ).toEqual(['Ayanda Khumalo']);
    });

    it('only lets learners who qualified in the released previous round into the next one', async () => {
        const { round2, educatorUser } = await setupTwoRounds();

        await expect(
            educatorService.registerEntrants(round2.id, educatorUser.id, [
                { full_name: 'Ayanda Khumalo', external_ref: 'STU-1' },
                { full_name: 'Ben Smith', external_ref: 'STU-2' },
            ])
        ).rejects.toMatchObject({
            statusCode: 400,
            message: expect.stringContaining('Ben Smith did not qualify'),
        });
        // All-or-nothing: Ayanda wasn't registered either
        expect(
            await prisma.entrant_registrations.count({
                where: { round_id: round2.id },
            })
        ).toBe(0);

        await educatorService.registerEntrants(round2.id, educatorUser.id, [
            { full_name: 'Ayanda Khumalo', external_ref: 'STU-1' },
        ]);
        expect(
            await prisma.entrant_registrations.count({
                where: { round_id: round2.id },
            })
        ).toBe(1);
    });

    it('reports progression rules for the page to display', async () => {
        const { round2, round1, educatorUser, ayanda, olympiad } =
            await setupTwoRounds();

        await expect(
            educatorService.getProgressionInfo(round2.id, educatorUser.id)
        ).resolves.toEqual({
            requiresQualification: true,
            previousRound: {
                id: round1.id,
                name: 'Round 1',
                qualifyingThreshold: 50,
            },
            qualifiedEntrantIds: [ayanda.id],
        });

        const { rounds } = await educatorService.getOlympiadProgressionInfo(
            olympiad.id,
            educatorUser.id
        );
        expect(
            rounds.map((r) => [r.roundName, r.requiresQualification])
        ).toEqual([
            ['Round 1', false],
            ['Round 2', true],
        ]);
    });

    it("registers learners for every open round they're eligible for across an olympiad", async () => {
        const { olympiad, educatorUser } = await setupTwoRounds();

        const registered = await educatorService.registerEntrantsForOlympiad(
            olympiad.id,
            educatorUser.id,
            [
                { full_name: 'Ayanda Khumalo', external_ref: 'STU-1' },
                { full_name: 'Ben Smith', external_ref: 'STU-2' },
                { full_name: 'New Learner' },
            ]
        );

        // Round 1 has closed; Round 2 needs a pass in Round 1
        const roundsFor = (name) =>
            registered
                .find((e) => e.full_name === name)
                .rounds.map((r) => r.name);
        expect(roundsFor('Ayanda Khumalo')).toEqual(['Round 2']);
        expect(roundsFor('Ben Smith')).toEqual([]);
        expect(roundsFor('New Learner')).toEqual([]);

        const listed = await educatorService.listOlympiadEntrants(
            olympiad.id,
            educatorUser.id
        );
        expect(
            listed
                .find((e) => e.full_name === 'Ayanda Khumalo')
                .rounds.map((r) => r.name)
        ).toEqual(['Round 1', 'Round 2']);
    });

    it("refuses when the school isn't registered for the olympiad", async () => {
        const olympiad = await f.createOlympiad();
        const round = await f.createRound({ olympiad });
        const outsider = await f.createEducator();
        await expect(
            educatorService.registerEntrants(round.id, outsider.user.id, [
                { full_name: 'X' },
            ])
        ).rejects.toMatchObject({ statusCode: 403 });
        expect(await prisma.entrants.count()).toBe(0);
    });
});

describe('educator: rounds, results and papers', () => {
    it('lists rounds from every registered olympiad in opening order, without duplicates', async () => {
        const { round1, round2, educatorUser, school, educator } =
            await setupTwoRounds();
        const secondOlympiad = await f.createOlympiad({ name: 'Science' });
        await f.registerSchool(school, secondOlympiad);
        const middle = await f.createRound({
            olympiad: secondOlympiad,
            opens_at: f.hoursFromNow(1),
            closes_at: f.hoursFromNow(3),
        });
        await f.createPaper({ round: middle, file_url: 'rounds/m/paper.pdf' });
        await f.createRound({ olympiad: await f.createOlympiad() }); // not registered

        const { rounds, school: schoolInfo } =
            await educatorService.listEducatorRounds(educatorUser.id);

        expect(rounds.map((r) => r.id)).toEqual([
            round1.id,
            middle.id,
            round2.id,
        ]);
        expect(rounds[0]).toMatchObject({ status: 'closed', entrant_count: 2 });
        expect(rounds[1]).toMatchObject({
            olympiad_name: 'Science',
            has_paper: true,
            status: 'upcoming',
        });
        expect(schoolInfo).toEqual({ id: school.id, name: school.name });
        expect(educator).toBeDefined();
    });

    it("shows results only for the educator's own school once released", async () => {
        const { round1, round2, olympiad, educatorUser } =
            await setupTwoRounds();
        const rival = await f.createSchool();
        await f.registerSchool(rival, olympiad);
        const rivalLearner = await f.createEntrant({ school: rival });
        await prisma.results.create({
            data: {
                round_id: round1.id,
                entrant_id: rivalLearner.id,
                total_points: 99,
                rank: 1,
            },
        });

        const { results } = await educatorService.getResults(
            round1.id,
            educatorUser.id
        );
        expect(
            results.map((r) => [
                r.entrant.full_name,
                String(r.total_points),
                r.qualified,
            ])
        ).toEqual([
            ['Ayanda Khumalo', '80', true],
            ['Ben Smith', '30', false],
        ]);

        await expect(
            educatorService.getResults(round2.id, educatorUser.id)
        ).rejects.toMatchObject({ statusCode: 400 });
        const all = await educatorService.listAllResults(educatorUser.id);
        expect(all.map((r) => r.id)).toEqual([round1.id]);
        expect(all[0].results).toHaveLength(2);
    });

    it('offers past papers from earlier closed rounds and signs download links once a round opens', async () => {
        const { round1, round2, educatorUser } = await setupTwoRounds();
        await f.createPaper({
            round: round1,
            title: 'Round 1 paper',
            file_url: 'rounds/r1/paper.pdf',
            memo_file_url: 'rounds/r1/memo.pdf',
        });
        await f.createPaper({ round: round2, file_url: 'rounds/r2/paper.pdf' });

        expect(
            await educatorService.listPastPapers(round2.id, educatorUser.id)
        ).toEqual([
            expect.objectContaining({
                round_id: round1.id,
                title: 'Round 1 paper',
                has_paper: true,
                has_memo: true,
            }),
        ]);

        await expect(
            educatorService.getPaperDownloadUrl(
                round2.id,
                educatorUser.id,
                'paper'
            )
        ).rejects.toMatchObject({
            message: 'Paper is not available yet — the round has not opened',
        });
        await expect(
            educatorService.getPaperDownloadUrl(
                round1.id,
                educatorUser.id,
                'paper'
            )
        ).resolves.toBe('https://storage.test/rounds/r1/paper.pdf?expires=60');
        await expect(
            educatorService.getPaperDownloadUrl(
                round1.id,
                educatorUser.id,
                'memo'
            )
        ).rejects.toMatchObject({
            statusCode: 403,
        });
        expect(supabase.storage.from).toHaveBeenCalledWith('papers');
    });

    it("describes a round with every submission from the educator's school", async () => {
        const { olympiad, school, educatorUser, educator } =
            await f.createOlympiadWithSchool();
        const round = await f.createRound({ olympiad, state: 'marking' });
        await f.createPaper({ round, title: 'Paper', file_url: 'p.pdf' });
        const entrant = await f.createEntrant({ school, full_name: 'Ayanda' });
        const stranger = await f.createEntrant({
            school: await f.createSchool(),
        });
        await prisma.submissions.create({
            data: {
                round_id: round.id,
                entrant_id: stranger.id,
                idempotency_key: 'other',
                round_close_snapshot: round.closes_at,
            },
        });
        await prisma.submissions.create({
            data: {
                round_id: round.id,
                entrant_id: entrant.id,
                submitted_by: educator.id,
                idempotency_key: 'k',
                round_close_snapshot: round.closes_at,
            },
        });

        await expect(
            educatorService.getEducatorRoundDetail(round.id, educatorUser.id)
        ).resolves.toMatchObject({
            status: 'closed',
            paper: { title: 'Paper', has_paper: true, has_memo: false },
            submissions: [
                {
                    id: expect.any(String),
                    entrant: { id: entrant.id, full_name: 'Ayanda' },
                    route: 'offline',
                    status: 'received',
                    received_at: expect.any(Date),
                },
            ],
            results_available: false,
        });
    });
});

describe('student dashboard and results', () => {
    it("summarises the student's rounds, scores and certificates", async () => {
        const { round1, round2, school, educator, ayanda } =
            await setupTwoRounds();
        await f.createPaper({
            round: round1,
            file_url: 'rounds/r1/paper-123-maths.pdf',
            questions: [{ type: 'essay', max_points: 100 }],
        });
        await f.registerEntrant({ entrant: ayanda, round: round2, educator });

        const { rounds, stats } = await studentRoundService.getRegisteredRounds(
            ayanda.id
        );

        expect(stats).toEqual({
            roundsEntered: 2,
            resultsAvailable: 1,
            certificatesEarned: 1,
        });
        expect(rounds.map((r) => [r.title, r.status])).toEqual([
            ['Round 1', 'closed'],
            ['Round 2', 'upcoming'],
        ]);
        expect(rounds[0]).toMatchObject({
            paperFile: 'paper-123-maths.pdf',
            result: {
                score: '80 / 100',
                percentage: '80%',
                rankInSchool: 1,
                hasCertificate: true,
            },
        });
        expect(rounds[1].result).toBeNull();
        expect(school).toBeDefined();
    });

    it('shows round detail only for rounds the student is registered for', async () => {
        const { round1, round2, ayanda } = await setupTwoRounds();

        await expect(
            studentRoundService.getStudentRoundDetail(round1.id, ayanda.id)
        ).resolves.toMatchObject({
            title: 'Round 1',
            canSitOnline: false,
            paperNote: 'This round has closed.',
        });
        await expect(
            studentRoundService.getStudentRoundDetail(round2.id, ayanda.id)
        ).rejects.toMatchObject({
            statusCode: 404,
        });
    });

    it('signs the paper download for a registered student once the round opens', async () => {
        const { round1, round2, educator, ayanda, ben } =
            await setupTwoRounds();
        await f.createPaper({
            round: round1,
            file_url: 'rounds/r1/paper.pdf',
            memo_file_url: 'rounds/r1/memo.pdf',
        });
        await f.createPaper({ round: round2, file_url: 'rounds/r2/paper.pdf' });
        await f.registerEntrant({ entrant: ayanda, round: round2, educator });

        const detail = await studentRoundService.getStudentRoundDetail(
            round1.id,
            ayanda.id
        );
        expect(detail).toMatchObject({
            hasPaper: true,
            paperFile: 'paper.pdf',
        });
        expect(detail).not.toHaveProperty('paperFileUrl');

        await expect(
            studentRoundService.getStudentPaperUrl(round1.id, ayanda.id)
        ).resolves.toBe('https://storage.test/rounds/r1/paper.pdf?expires=60');
        await expect(
            studentRoundService.getStudentPaperUrl(round2.id, ayanda.id)
        ).rejects.toMatchObject({
            message: 'Paper is not available yet — the round has not opened',
        });
        // Ben never registered for round 2
        await expect(
            studentRoundService.getStudentPaperUrl(round2.id, ben.id)
        ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('lets a registered student sit a round once it is open and live', async () => {
        const { olympiad, school, educator } =
            await f.createOlympiadWithSchool();
        const round = await f.createRound({
            olympiad,
            state: 'open',
            exam_status: 'live',
        });
        const { entrant } = await f.createStudent({ school });
        await f.registerEntrant({ entrant, round, educator });

        await expect(
            studentRoundService.getStudentRoundDetail(round.id, entrant.id)
        ).resolves.toMatchObject({
            status: 'open',
            canSitOnline: true,
            hasSubmitted: false,
        });
    });

    it('lists closed rounds on the results page, keeping unreleased scores hidden', async () => {
        const { olympiad, round1, educator, ayanda } = await setupTwoRounds();
        const marking = await f.createRound({
            olympiad,
            name: 'Round 1b',
            state: 'marking',
            opens_at: f.hoursFromNow(-10),
            closes_at: f.hoursFromNow(-8),
        });
        await f.registerEntrant({ entrant: ayanda, round: marking, educator });
        await prisma.results.create({
            data: {
                round_id: marking.id,
                entrant_id: ayanda.id,
                total_points: 5,
            },
        });

        const { results } = await studentRoundService.getStudentResults(
            ayanda.id
        );

        expect(results.map((r) => [r.round, r.resultStatus, r.score])).toEqual([
            ['Round 1b', 'pending', '—'],
            ['Round 1', 'released', '80 / 0'],
        ]);
        expect(round1).toBeDefined();
    });
});
