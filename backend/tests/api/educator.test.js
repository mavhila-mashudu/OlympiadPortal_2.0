// The educator portal: round views under /me, entrant registration with
// round progression under /rounds and /olympiads, results under /me, and
// past papers still under /educator. Every endpoint is scoped to the
// educator's own school.
const prisma = require('../../src/config/database').default;
const f = require('../integration/helpers/factories');
const { as, expectError, expectOk } = require('./helpers/api');

const MISSING = '00000000-0000-4000-8000-000000000000';

// An olympiad with Round 1 (results released: Ayanda qualified, Ben didn't)
// and Round 2 (upcoming), and a school registered for it.
const setup = async () => {
    const { organiser, olympiad, school, educatorUser, educator } =
        await f.createOlympiadWithSchool();
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
    for (const entrant of [ayanda, ben])
        await f.registerEntrant({ entrant, round: round1, educator });
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
            total_points: '30.5',
            rank: 2,
            qualified: false,
        },
    });

    const outsider = await f.createEducator(); // a school not registered for this olympiad
    return {
        organiser,
        olympiad,
        school,
        educator,
        round1,
        round2,
        ayanda,
        ben,
        educatorApi: as(educatorUser),
        outsiderApi: as(outsider.user),
        outsiderSchool: outsider.school,
    };
};

describe('GET /me/rounds', () => {
    it('lists rounds from every olympiad the school is in, with status and counts', async () => {
        const { round1, round2, olympiad, school, educatorApi } = await setup();
        const elsewhere = await f.createOlympiad({ name: 'Science Olympiad' });
        await f.registerSchool(school, elsewhere);
        const science = await f.createRound({
            olympiad: elsewhere,
            state: 'open',
            opens_at: f.hoursFromNow(-1),
            closes_at: f.hoursFromNow(1),
        });
        await f.createPaper({ round: science, file_url: 'rounds/s/paper.pdf' });
        await f.createRound({ olympiad: await f.createOlympiad() }); // not the school's

        const data = expectOk(await educatorApi.get('/me/rounds'));

        expect(data.school).toEqual({ id: school.id, name: school.name });
        expect(
            data.rounds.map((r) => [
                r.id,
                r.status,
                r.has_paper,
                r.entrant_count,
            ])
        ).toEqual([
            [round1.id, 'closed', false, 2],
            [science.id, 'open', true, 0],
            [round2.id, 'upcoming', false, 0],
        ]);
        expect(data.rounds[0]).toMatchObject({
            olympiad_id: olympiad.id,
            olympiad_name: olympiad.name,
            timezone: 'Africa/Johannesburg',
            state: 'results_released',
            submission_count: 0,
        });
    });

    it('responds 403 for an educator without active school membership', async () => {
        expectError(
            await as(await f.createUser('educator')).get('/me/rounds'),
            403,
            'School membership is awaiting approval'
        );
    });
});

describe('GET /me/rounds/:roundId', () => {
    it("describes the round for the educator's school", async () => {
        const { round1, school, educatorApi } = await setup();
        await f.createPaper({
            round: round1,
            title: 'Round 1 paper',
            file_url: 'p.pdf',
            memo_file_url: 'm.pdf',
        });

        const { round } = expectOk(
            await educatorApi.get(`/me/rounds/${round1.id}`)
        );

        expect(round).toMatchObject({
            id: round1.id,
            status: 'closed',
            paper: { title: 'Round 1 paper', has_paper: true, has_memo: true },
            submissions: [],
            results_available: true,
            school: { id: school.id, name: school.name },
            // The page shows round times in the olympiad's timezone
            timezone: 'Africa/Johannesburg',
        });
        // Storage paths stay on the server
        expect(JSON.stringify(round)).not.toContain('p.pdf');
    });

    it('lists every submission from the school so the rest can still be submitted', async () => {
        const { olympiad, school, educator, ayanda, ben, educatorApi } =
            await setup();
        const open = await f.createRound({
            olympiad,
            state: 'open',
            opens_at: f.hoursFromNow(-1),
            closes_at: f.hoursFromNow(1),
        });
        for (const entrant of [ayanda, ben])
            await f.registerEntrant({ entrant, round: open, educator });
        // A colleague at the same school captures Ayanda's answers
        const colleague = await f.createEducator({
            school,
            membershipRole: 'educator',
        });
        expectOk(
            await as(colleague.user)
                .post(`/rounds/${open.id}/submissions`)
                .send({ entrant_id: ayanda.id, answers: [] }),
            201
        );

        const { round } = expectOk(
            await educatorApi.get(`/me/rounds/${open.id}`)
        );

        expect(round.submissions).toEqual([
            {
                id: expect.any(String),
                entrant: { id: ayanda.id, full_name: 'Ayanda Khumalo' },
                received_at: expect.any(String),
                status: 'received',
                route: 'offline',
            },
        ]);
        // ...and the educator can still submit for Ben
        expectOk(
            await educatorApi
                .post(`/rounds/${open.id}/submissions`)
                .send({ entrant_id: ben.id, answers: [] }),
            201
        );
        expect(
            expectOk(await educatorApi.get(`/me/rounds/${open.id}`)).round
                .submissions
        ).toHaveLength(2);
    });

    it('responds 403 to a school outside the olympiad and 404 for an unknown round', async () => {
        const { round1, outsiderApi, educatorApi } = await setup();
        expectError(
            await outsiderApi.get(`/me/rounds/${round1.id}`),
            403,
            'Your school is not registered for this olympiad'
        );
        expectError(
            await educatorApi.get(`/me/rounds/${MISSING}`),
            404,
            'Round not found'
        );
    });
});

describe('POST /rounds/:roundId/entrants', () => {
    it('registers new and existing learners, updating existing records instead of duplicating them', async () => {
        const { ayanda, educatorApi, school } = await setup();
        // A first round in another olympiad has no progression rule
        const other = await f.createOlympiad();
        await f.registerSchool(school, other);
        const first = await f.createRound({ olympiad: other });

        const res = await educatorApi
            .post(`/rounds/${first.id}/entrants`)
            .send({
                entrants: [
                    {
                        full_name: 'Ayanda K. Khumalo',
                        external_ref: 'STU-1',
                        grade: 11,
                    },
                    { full_name: 'Chris New', grade: '9' },
                ],
            });

        const { entrants } = expectOk(res, 201);
        expect(
            entrants.map((e) => [e.full_name, e.grade, e.external_ref])
        ).toEqual([
            ['Ayanda K. Khumalo', '11', 'STU-1'],
            ['Chris New', '9', null],
        ]);
        expect(entrants[0].id).toBe(ayanda.id);
        expect(
            await prisma.entrant_registrations.count({
                where: { round_id: first.id },
            })
        ).toBe(2);
    });

    it('responds 400 once the round has closed', async () => {
        const { round1, educatorApi } = await setup();
        const res = await educatorApi
            .post(`/rounds/${round1.id}/entrants`)
            .send({ entrants: [{ full_name: 'Late Learner' }] });
        expectError(
            res,
            400,
            "Entrants can't be registered once a round has closed"
        );
        expect(
            await prisma.entrants.count({
                where: { full_name: 'Late Learner' },
            })
        ).toBe(0);
    });

    it('only lets learners who qualified in the released previous round into the next', async () => {
        const { round2, educatorApi } = await setup();
        const url = `/rounds/${round2.id}/entrants`;

        expectOk(
            await educatorApi.post(url).send({
                entrants: [
                    { full_name: 'Ayanda Khumalo', external_ref: 'STU-1' },
                ],
            }),
            201
        );

        const res = await educatorApi.post(url).send({
            entrants: [{ full_name: 'Ben Smith', external_ref: 'STU-2' }],
        });
        expectError(
            res,
            400,
            'Ben Smith did not qualify in the previous round ("Round 1") and cannot be registered for this round.'
        );
        expect(
            await prisma.entrant_registrations.count({
                where: { round_id: round2.id },
            })
        ).toBe(1);
    });

    it('registers nobody when one learner in the batch is refused', async () => {
        const { round2, educatorApi } = await setup();
        const res = await educatorApi
            .post(`/rounds/${round2.id}/entrants`)
            .send({
                entrants: [
                    { full_name: 'Ayanda Khumalo', external_ref: 'STU-1' },
                    { full_name: 'Ben Smith', external_ref: 'STU-2' },
                ],
            });
        expect(res.status).toBe(400);
        expect(
            await prisma.entrant_registrations.count({
                where: { round_id: round2.id },
            })
        ).toBe(0);
    });

    it.each([
        [{}, 'entrants array with at least one entry is required'],
        [
            { entrants: [] },
            'entrants array with at least one entry is required',
        ],
        [{ entrants: [{ grade: '10' }] }, 'full_name is required'],
        [{ entrants: [{ full_name: '   ' }] }, 'full_name is required'],
        [
            { entrants: [{ full_name: 'A', external_ref: 7 }] },
            'external_ref must be text',
        ],
    ])('responds 422 for %o', async (body, message) => {
        const { round2, educatorApi } = await setup();
        expectError(
            await educatorApi
                .post(`/rounds/${round2.id}/entrants`)
                .send(body),
            422,
            message
        );
    });

    it('responds 403 to a school outside the olympiad and 404 for an unknown round', async () => {
        const { round2, outsiderApi, educatorApi } = await setup();
        const body = { entrants: [{ full_name: 'Someone' }] };
        expectError(
            await outsiderApi
                .post(`/rounds/${round2.id}/entrants`)
                .send(body),
            403,
            'Your school is not registered for this olympiad'
        );
        expectError(
            await educatorApi
                .post(`/rounds/${MISSING}/entrants`)
                .send(body),
            404,
            'Round not found'
        );
    });
});

describe('GET /rounds/:roundId/entrants', () => {
    it("lists only the school's learners registered for the round", async () => {
        const { round1, olympiad, educator, ayanda, ben, educatorApi } =
            await setup();
        const otherSchool = await f.createSchool();
        await f.registerSchool(otherSchool, olympiad);
        await f.registerEntrant({
            entrant: await f.createEntrant({ school: otherSchool }),
            round: round1,
            educator,
        });

        const { entrants } = expectOk(
            await educatorApi.get(`/rounds/${round1.id}/entrants`)
        );

        expect(entrants.map((e) => e.id).sort()).toEqual(
            [ayanda.id, ben.id].sort()
        );
        expect(entrants[0]).toEqual({
            id: expect.any(String),
            full_name: expect.any(String),
            grade: expect.any(String),
            external_ref: expect.any(String),
            registered_at: expect.any(String),
        });
    });

    it("returns an empty list for a round with none of the school's learners", async () => {
        const { round2, educatorApi } = await setup();
        expect(
            expectOk(
                await educatorApi.get(`/rounds/${round2.id}/entrants`)
            )
        ).toEqual({ entrants: [] });
    });

    it('responds 403 to a school outside the olympiad and 404 for an unknown round', async () => {
        const { round1, outsiderApi, educatorApi } = await setup();
        expectError(
            await outsiderApi.get(`/rounds/${round1.id}/entrants`),
            403,
            'Your school is not registered for this olympiad'
        );
        expectError(
            await educatorApi.get(`/rounds/${MISSING}/entrants`),
            404,
            'Round not found'
        );
    });
});

describe('GET /rounds/:roundId/progression', () => {
    it('reports the qualification rule and who qualified', async () => {
        const { round1, round2, ayanda, educatorApi } = await setup();

        expect(
            expectOk(
                await educatorApi.get(
                    `/rounds/${round2.id}/progression`
                )
            )
        ).toEqual({
            requiresQualification: true,
            previousRound: {
                id: round1.id,
                name: 'Round 1',
                qualifyingThreshold: 50,
            },
            qualifiedEntrantIds: [ayanda.id],
        });
        expect(
            expectOk(
                await educatorApi.get(
                    `/rounds/${round1.id}/progression`
                )
            )
        ).toEqual({
            requiresQualification: false,
            previousRound: null,
            qualifiedEntrantIds: [],
        });
    });

    it('responds 403 to a school outside the olympiad and 404 for an unknown round', async () => {
        const { round2, outsiderApi, educatorApi } = await setup();
        expectError(
            await outsiderApi.get(`/rounds/${round2.id}/progression`),
            403,
            'Your school is not registered for this olympiad'
        );
        expectError(
            await educatorApi.get(`/rounds/${MISSING}/progression`),
            404,
            'Round not found'
        );
    });
});

describe('olympiad-level entrants', () => {
    describe('POST /olympiads/:olympiadId/entrants', () => {
        it("registers each learner for every open round they're eligible for", async () => {
            const { olympiad, educatorApi } = await setup();
            const round3 = await f.createRound({
                olympiad,
                name: 'Round 3',
                opens_at: f.hoursFromNow(100),
                closes_at: f.hoursFromNow(102),
            });

            const res = await educatorApi
                .post(`/olympiads/${olympiad.id}/entrants`)
                .send({
                    entrants: [
                        { full_name: 'Ayanda Khumalo', external_ref: 'STU-1' },
                        { full_name: 'Ben Smith', external_ref: 'STU-2' },
                        { full_name: 'Chris New', grade: 8 },
                    ],
                });

            // Round 1 has closed. Round 2 needs a pass in Round 1. Round 3 follows
            // Round 2, which has no results yet, so everyone is registered for it.
            const { entrants } = expectOk(res, 201);
            const roundsOf = (name) =>
                entrants
                    .find((e) => e.full_name === name)
                    .rounds.map((r) => r.name);
            expect(roundsOf('Ayanda Khumalo')).toEqual(['Round 2', 'Round 3']);
            expect(roundsOf('Ben Smith')).toEqual(['Round 3']);
            expect(roundsOf('Chris New')).toEqual(['Round 3']);
            expect(
                await prisma.entrant_registrations.count({
                    where: { round_id: round3.id },
                })
            ).toBe(3);
            expect(
                entrants.find((e) => e.full_name === 'Chris New')
            ).toMatchObject({
                grade: '8',
                external_ref: null,
            });
        });

        it('responds 400 when every round has closed', async () => {
            const { school, educatorApi } = await setup();
            const finished = await f.createOlympiad();
            await f.registerSchool(school, finished);
            await f.createRound({
                olympiad: finished,
                state: 'results_released',
            });
            const res = await educatorApi
                .post(`/olympiads/${finished.id}/entrants`)
                .send({ entrants: [{ full_name: 'A' }] });
            expectError(
                res,
                400,
                'Every round in this olympiad has closed, so no one can be registered'
            );
        });

        it('responds 400 for an olympiad with no rounds', async () => {
            const { school, educatorApi } = await setup();
            const empty = await f.createOlympiad();
            await f.registerSchool(school, empty);
            expectError(
                await educatorApi
                    .post(`/olympiads/${empty.id}/entrants`)
                    .send({ entrants: [{ full_name: 'A' }] }),
                400,
                'No rounds found for this olympiad'
            );
        });

        it('responds 422 for an invalid body or olympiad id', async () => {
            const { olympiad, educatorApi } = await setup();
            expectError(
                await educatorApi
                    .post(`/olympiads/${olympiad.id}/entrants`)
                    .send({ entrants: [] }),
                422,
                'entrants array with at least one entry is required'
            );
            expectError(
                await educatorApi
                    .post('/olympiads/olympiad-1/entrants')
                    .send({ entrants: [{ full_name: 'A' }] }),
                422,
                'olympiadId must be a valid UUID'
            );
        });

        it('responds 403 to a school outside the olympiad and 404 for an unknown olympiad', async () => {
            const { olympiad, outsiderApi, educatorApi } = await setup();
            const body = { entrants: [{ full_name: 'A' }] };
            expectError(
                await outsiderApi
                    .post(`/olympiads/${olympiad.id}/entrants`)
                    .send(body),
                403,
                'Your school is not registered for this olympiad'
            );
            expectError(
                await educatorApi
                    .post(`/olympiads/${MISSING}/entrants`)
                    .send(body),
                404,
                'Olympiad not found'
            );
        });
    });

    describe('GET /olympiads/:olympiadId/entrants', () => {
        it("lists the school's learners with the rounds each is registered for", async () => {
            const { olympiad, round2, educator, ayanda, ben, educatorApi } =
                await setup();
            await f.registerEntrant({
                entrant: ayanda,
                round: round2,
                educator,
            });

            const { entrants } = expectOk(
                await educatorApi.get(
                    `/olympiads/${olympiad.id}/entrants`
                )
            );

            const byName = Object.fromEntries(
                entrants.map((e) => [
                    e.full_name,
                    e.rounds.map((r) => r.name).sort(),
                ])
            );
            expect(byName).toEqual({
                'Ayanda Khumalo': ['Round 1', 'Round 2'],
                'Ben Smith': ['Round 1'],
            });
            expect(entrants.find((e) => e.id === ben.id)).toMatchObject({
                grade: '11',
                external_ref: 'STU-2',
            });
        });

        it('responds 403 to a school outside the olympiad and 404 for an unknown olympiad', async () => {
            const { olympiad, outsiderApi, educatorApi } = await setup();
            expectError(
                await outsiderApi.get(
                    `/olympiads/${olympiad.id}/entrants`
                ),
                403,
                'Your school is not registered for this olympiad'
            );
            expectError(
                await educatorApi.get(
                    `/olympiads/${MISSING}/entrants`
                ),
                404,
                'Olympiad not found'
            );
        });
    });

    describe('GET /olympiads/:olympiadId/progression', () => {
        it('reports per-round qualification rules', async () => {
            const { olympiad, round1, round2, ayanda, educatorApi } =
                await setup();

            expect(
                expectOk(
                    await educatorApi.get(
                        `/olympiads/${olympiad.id}/progression`
                    )
                )
            ).toEqual({
                rounds: [
                    {
                        roundId: round1.id,
                        roundName: 'Round 1',
                        requiresQualification: false,
                        previousRound: null,
                        state: 'results_released',
                    },
                    {
                        roundId: round2.id,
                        roundName: 'Round 2',
                        requiresQualification: true,
                        previousRound: {
                            id: round1.id,
                            name: 'Round 1',
                            qualifyingThreshold: 50,
                        },
                        qualifiedEntrantIds: [ayanda.id],
                        state: 'scheduled',
                    },
                ],
            });
        });

        it('responds 403 to a school outside the olympiad and 404 for an unknown olympiad', async () => {
            const { olympiad, outsiderApi, educatorApi } = await setup();
            expectError(
                await outsiderApi.get(
                    `/olympiads/${olympiad.id}/progression`
                ),
                403,
                'Your school is not registered for this olympiad'
            );
            expectError(
                await educatorApi.get(
                    `/olympiads/${MISSING}/progression`
                ),
                404,
                'Olympiad not found'
            );
        });
    });
});

describe('GET /me/rounds/:roundId/results', () => {
    it("returns released results for the school's learners, in rank order", async () => {
        const { round1, olympiad, ayanda, ben, educatorApi } = await setup();
        const otherSchool = await f.createSchool();
        await f.registerSchool(otherSchool, olympiad);
        const stranger = await f.createEntrant({ school: otherSchool });
        await prisma.results.create({
            data: {
                round_id: round1.id,
                entrant_id: stranger.id,
                total_points: 99,
                rank: 1,
                qualified: true,
            },
        });

        const data = expectOk(
            await educatorApi.get(`/me/rounds/${round1.id}/results`)
        );

        expect(data.round).toEqual({
            id: round1.id,
            name: 'Round 1',
            state: 'results_released',
            closes_at: round1.closes_at.toISOString(),
        });
        expect(
            data.results.map((r) => [
                r.entrant.id,
                r.rank,
                r.total_points,
                r.qualified,
            ])
        ).toEqual([
            [ayanda.id, 1, '80', true],
            [ben.id, 2, '30.5', false],
        ]);
    });

    it('responds 400 before results are released', async () => {
        const { round2, educatorApi } = await setup();
        expectError(
            await educatorApi.get(`/me/rounds/${round2.id}/results`),
            400,
            'Results are not yet available — round is "scheduled"'
        );
    });

    it('responds 404 for an unknown round', async () => {
        const { educatorApi } = await setup();
        expectError(
            await educatorApi.get(`/me/rounds/${MISSING}/results`),
            404,
            'Round not found'
        );
    });
});

describe('GET /me/results', () => {
    it("lists every released round with the school's results", async () => {
        const { round1, olympiad, ayanda, educatorApi } = await setup();

        const { rounds } = expectOk(await educatorApi.get('/me/results'));

        expect(rounds).toEqual([
            {
                id: round1.id,
                name: 'Round 1',
                olympiad_name: olympiad.name,
                timezone: 'Africa/Johannesburg',
                closes_at: round1.closes_at.toISOString(),
                results: [
                    expect.objectContaining({
                        rank: 1,
                        entrant: expect.objectContaining({ id: ayanda.id }),
                    }),
                    expect.objectContaining({ rank: 2 }),
                ],
            },
        ]);
    });

    it('returns nothing to a school with no released rounds', async () => {
        const { outsiderApi } = await setup();
        expect(expectOk(await outsiderApi.get('/me/results'))).toEqual({
            rounds: [],
        });
    });
});

describe('GET /rounds/:roundId/papers/archive', () => {
    it('lists papers from earlier closed rounds of the olympiad', async () => {
        const { round1, round2, educatorApi } = await setup();
        await f.createPaper({
            round: round1,
            title: 'Round 1 paper',
            file_url: 'rounds/r1/paper.pdf',
            memo_file_url: 'rounds/r1/memo.pdf',
        });

        expect(
            expectOk(
                await educatorApi.get(
                    `/rounds/${round2.id}/papers/archive`
                )
            )
        ).toEqual({
            papers: [
                {
                    id: expect.any(String),
                    round_id: round1.id,
                    round_name: 'Round 1',
                    title: 'Round 1 paper',
                    closed_at: round1.closes_at.toISOString(),
                    timezone: 'Africa/Johannesburg',
                    has_paper: true,
                    has_memo: true,
                },
            ],
        });
    });

    it('responds 403 to a school outside the olympiad and 404 for an unknown round', async () => {
        const { round2, outsiderApi, educatorApi } = await setup();
        expectError(
            await outsiderApi.get(`/rounds/${round2.id}/papers/archive`),
            403,
            'Your school is not registered for this olympiad'
        );
        expectError(
            await educatorApi.get(`/rounds/${MISSING}/papers/archive`),
            404,
            'Round not found'
        );
    });
});

describe('GET /rounds/:roundId/papers/download', () => {
    it('signs a one-minute download link once the round has opened', async () => {
        const { round1, educatorApi } = await setup();
        await f.createPaper({
            round: round1,
            file_url: 'rounds/r1/paper.pdf',
            memo_file_url: 'rounds/r1/memo.pdf',
        });

        expect(
            expectOk(
                await educatorApi.get(
                    `/rounds/${round1.id}/papers/download`
                )
            )
        ).toEqual({
            url: 'https://storage.test/rounds/r1/paper.pdf?expires=60',
        });
    });

    it('keeps the memo with the organiser', async () => {
        const { round1, educatorApi } = await setup();
        await f.createPaper({
            round: round1,
            file_url: 'p.pdf',
            memo_file_url: 'm.pdf',
        });
        expectError(
            await educatorApi.get(
                `/rounds/${round1.id}/papers/download?type=memo`
            ),
            403,
            'Only the organiser can download the memo'
        );
    });

    it('responds 400 before the round opens', async () => {
        const { round2, educatorApi } = await setup();
        await f.createPaper({ round: round2, file_url: 'p.pdf' });
        expectError(
            await educatorApi.get(
                `/rounds/${round2.id}/papers/download`
            ),
            400,
            'Paper is not available yet — the round has not opened'
        );
    });

    it('responds 404 without an uploaded paper, and refuses schools outside the olympiad', async () => {
        const { round1, outsiderApi, educatorApi } = await setup();
        expectError(
            await educatorApi.get(
                `/rounds/${round1.id}/papers/download`
            ),
            404,
            'No paper uploaded for this round'
        );
        expectError(
            await outsiderApi.get(
                `/rounds/${round1.id}/papers/download`
            ),
            403,
            'Your school is not registered for this olympiad'
        );
    });
});
