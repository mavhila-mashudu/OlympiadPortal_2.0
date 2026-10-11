// Building and verifying an exam: questions, the exam-status workflow
// (draft → ready → live) and signed links to the paper and memo.
const prisma = require('../../src/config/database').default;
const f = require('../integration/helpers/factories');
const { supabase } = require('../integration/helpers/externalMocks');
const { as, expectError, expectOk } = require('./helpers/api');

const MISSING = '00000000-0000-4000-8000-000000000000';

// An organiser's round in a school's olympiad, with that school's coordinator
const setup = async (roundOverrides = {}) => {
    const world = await f.createOlympiadWithSchool();
    const round = await f.createRound({
        olympiad: world.olympiad,
        ...roundOverrides,
    });
    const outsider = await f.createEducator(); // school not registered for the olympiad
    return {
        ...world,
        round,
        organiserApi: as(world.organiser),
        educatorApi: as(world.educatorUser),
        outsiderApi: as(outsider.user),
        otherOrganiserApi: as(await f.createOrganiser()),
    };
};

const mcq = (overrides = {}) => ({
    type: 'mcq',
    prompt: 'Which of these are prime?',
    options: ['2', '4', '5', '9'],
    correct_option: '0,2',
    negative_pct: 25,
    max_points: 4,
    ...overrides,
});

describe('POST /rounds/:roundId/questions', () => {
    it("adds a question, creating the round's paper on first use", async () => {
        const { round, organiserApi } = await setup();

        const { question } = expectOk(
            await organiserApi
                .post(`/rounds/${round.id}/questions`)
                .send(mcq()),
            201
        );

        const paper = await prisma.papers.findFirst({
            where: { round_id: round.id },
        });
        expect(paper.title).toBe(round.name);
        expect(question).toMatchObject({
            paper_id: paper.id,
            type: 'mcq',
            prompt: 'Which of these are prime?',
            options: ['2', '4', '5', '9'],
            correct_option: '0,2',
            negative_pct: '25',
            max_points: '4',
        });
    });

    it('lets an educator of a registered school digitise the paper, with default points', async () => {
        const { round, educatorApi } = await setup();
        const res = await educatorApi
            .post(`/rounds/${round.id}/questions`)
            .send({ type: 'essay', prompt: 'Explain photosynthesis' });
        expect(expectOk(res, 201).question).toMatchObject({
            type: 'essay',
            max_points: '1',
            negative_pct: '0',
            correct_option: null,
        });
    });

    // The question form sends every field on every question type, using null
    // for the ones that don't apply — an empty value is not a validation error
    it.each([
        [
            'multiple choice',
            {
                type: 'mcq',
                prompt: 'Which are prime?',
                options: ['2', '4', '5'],
                correct_option: '0,2',
                correct_answer: null,
                negative_pct: 0,
                max_points: 2,
            },
            { correct_answer: null, correct_option: '0,2', max_points: '2' },
        ],
        [
            'short answer',
            {
                type: 'short_answer',
                prompt: 'Capital city?',
                options: null,
                correct_option: null,
                correct_answer: 'Pretoria',
                negative_pct: 0,
                max_points: 2,
            },
            { options: null, correct_option: null, correct_answer: 'Pretoria' },
        ],
        [
            'essay',
            {
                type: 'essay',
                prompt: 'Explain photosynthesis',
                options: null,
                correct_option: null,
                correct_answer: null,
                negative_pct: 0,
                max_points: 10,
            },
            {
                options: null,
                correct_option: null,
                correct_answer: null,
                max_points: '10',
            },
        ],
    ])(
        'saves a %s question sent the way the form sends it',
        async (_label, body, expected) => {
            const { round, educatorApi } = await setup();
            const res = await educatorApi
                .post(`/rounds/${round.id}/questions`)
                .send(body);
            expect(expectOk(res, 201).question).toMatchObject(expected);
        }
    );

    it('corrects an answer key sent with the unused field as null', async () => {
        const { round, organiserApi } = await setup({ exam_status: 'ready' });
        const { questions } = await f.createPaper({
            round,
            questions: [mcq()],
        });

        const res = await organiserApi
            .patch(`/rounds/${round.id}/questions/${questions[0].id}`)
            .send({ correct_option: '1', correct_answer: null });

        expect(expectOk(res).question).toMatchObject({
            correct_option: '1',
            correct_answer: null,
        });
    });

    it.each([
        [{ type: undefined }, 'Question type is required'],
        [
            { type: 'matching' },
            'type must be one of: mcq, true_false, short_answer, essay',
        ],
        [{ prompt: '   ' }, 'Prompt is required'],
        [
            { correct_option: '0,b' },
            'correct_option must be option indexes separated by commas (e.g. 0,2)',
        ],
        [
            { correct_option: '1,1' },
            'correct_option must not repeat an option index',
        ],
        [
            { negative_pct: 101 },
            'negative_pct must be a percentage between 0 and 100',
        ],
        [{ max_points: 0 }, 'max_points must be a number greater than 0'],
        [{ options: '2,4,5' }, 'options must be an array'],
        [{ correct_answer: 42 }, 'correct_answer must be text'],
    ])('responds 422 for %o', async (overrides, message) => {
        const { round, organiserApi } = await setup();
        expectError(
            await organiserApi
                .post(`/rounds/${round.id}/questions`)
                .send(mcq(overrides)),
            422,
            message
        );
        expect(await prisma.questions.count()).toBe(0);
    });

    it("responds 422 for a round id that isn't a UUID", async () => {
        const { organiserApi } = await setup();
        expectError(
            await organiserApi.post('/rounds/round-1/questions').send(mcq()),
            422,
            'roundId must be a valid UUID'
        );
    });

    it('responds 400 once the exam has left draft', async () => {
        const { round, organiserApi } = await setup({ exam_status: 'ready' });
        expectError(
            await organiserApi
                .post(`/rounds/${round.id}/questions`)
                .send(mcq()),
            400,
            'Questions can only be added while the exam is in draft status'
        );
    });

    it('refuses organisers and schools outside the olympiad', async () => {
        const { round, otherOrganiserApi, outsiderApi, organiserApi } =
            await setup();
        expectError(
            await otherOrganiserApi
                .post(`/rounds/${round.id}/questions`)
                .send(mcq()),
            403,
            'Not your round'
        );
        expectError(
            await outsiderApi.post(`/rounds/${round.id}/questions`).send(mcq()),
            403,
            'Your school is not registered for this olympiad'
        );
        expectError(
            await organiserApi.post(`/rounds/${MISSING}/questions`).send(mcq()),
            404,
            'Round not found'
        );
        expect(await prisma.questions.count()).toBe(0);
    });
});

describe('GET /rounds/:roundId/questions', () => {
    it("lists the paper's questions in the order they were added, answers included", async () => {
        const { round, educatorApi } = await setup();
        const { questions } = await f.createPaper({
            round,
            questions: [
                {
                    type: 'short_answer',
                    correct_answer: 'Pretoria',
                    created_at: new Date('2026-01-01T10:00:00Z'),
                },
                { type: 'essay', created_at: new Date('2026-01-01T09:00:00Z') },
            ],
        });

        const data = expectOk(
            await educatorApi.get(`/rounds/${round.id}/questions`)
        );

        expect(data.questions.map((q) => q.id)).toEqual([
            questions[1].id,
            questions[0].id,
        ]);
        expect(data.questions[1].correct_answer).toBe('Pretoria');
    });

    it('returns an empty list for a round without a paper', async () => {
        const { round, organiserApi } = await setup();
        expect(
            expectOk(await organiserApi.get(`/rounds/${round.id}/questions`))
        ).toEqual({ questions: [] });
    });

    it('hides the questions (and answer key) from anyone outside the olympiad', async () => {
        const { round, otherOrganiserApi, outsiderApi } = await setup();
        await f.createPaper({
            round,
            questions: [{ type: 'mcq', correct_option: '1' }],
        });
        expectError(
            await otherOrganiserApi.get(`/rounds/${round.id}/questions`),
            403,
            'Not your round'
        );
        expectError(
            await outsiderApi.get(`/rounds/${round.id}/questions`),
            403,
            'Your school is not registered for this olympiad'
        );
    });
});

describe('PATCH /rounds/:roundId/questions/:questionId', () => {
    const withQuestion = async (roundOverrides) => {
        const world = await setup(roundOverrides);
        const { questions } = await f.createPaper({
            round: world.round,
            questions: [mcq()],
        });
        return {
            ...world,
            question: questions[0],
            url: `/rounds/${world.round.id}/questions/${questions[0].id}`,
        };
    };

    it('updates only the fields sent', async () => {
        const { url, educatorApi } = await withQuestion();
        const { question } = expectOk(
            await educatorApi
                .patch(url)
                .send({ prompt: 'Pick every prime', max_points: 6 })
        );
        expect(question).toMatchObject({
            prompt: 'Pick every prime',
            max_points: '6',
            correct_option: '0,2',
            options: ['2', '4', '5', '9'],
        });
    });

    it('lets the organiser correct the answer key while the exam awaits verification', async () => {
        const { url, organiserApi, educatorApi } = await withQuestion({
            exam_status: 'ready',
        });
        expectError(
            await educatorApi.patch(url).send({ correct_option: '0' }),
            400,
            'Questions can only be edited while the exam is in draft status'
        );
        expect(
            expectOk(
                await organiserApi.patch(url).send({ correct_option: '0' })
            ).question.correct_option
        ).toBe('0');
    });

    it('responds 400 once the exam is live', async () => {
        const { url, organiserApi } = await withQuestion({
            exam_status: 'live',
        });
        expectError(
            await organiserApi.patch(url).send({ correct_option: '0' }),
            400,
            'Questions are locked once the exam is live'
        );
    });

    it("responds 404 for a question that isn't on the round in the URL", async () => {
        const { question, olympiad, organiserApi } = await withQuestion();
        const otherRound = await f.createRound({ olympiad });
        const res = await organiserApi
            .patch(`/rounds/${otherRound.id}/questions/${question.id}`)
            .send({ prompt: 'Moved?' });
        expectError(res, 404, 'Question not found');
        expect(
            (await prisma.questions.findUnique({ where: { id: question.id } }))
                .prompt
        ).toBe('Which of these are prime?');
    });

    it('responds 404 for an unknown question and 422 for invalid fields', async () => {
        const { round, url, organiserApi } = await withQuestion();
        expectError(
            await organiserApi
                .patch(`/rounds/${round.id}/questions/${MISSING}`)
                .send({ prompt: 'x' }),
            404,
            'Question not found'
        );
        expectError(
            await organiserApi.patch(url).send({ correct_option: 'a' }),
            422,
            'correct_option must be option indexes separated by commas (e.g. 0,2)'
        );
        expectError(
            await organiserApi
                .patch(`/rounds/${round.id}/questions/q-1`)
                .send({ prompt: 'x' }),
            422,
            'Question id must be a valid UUID'
        );
    });

    it('refuses organisers and schools outside the olympiad', async () => {
        const { url, otherOrganiserApi, outsiderApi } = await withQuestion();
        expectError(
            await otherOrganiserApi.patch(url).send({ prompt: 'x' }),
            403,
            'Not your question'
        );
        expectError(
            await outsiderApi.patch(url).send({ prompt: 'x' }),
            403,
            'Your school is not registered for this olympiad'
        );
    });
});

describe('DELETE /rounds/:roundId/questions/:questionId', () => {
    it('deletes a question from a draft exam', async () => {
        const { round, organiserApi } = await setup();
        const { questions } = await f.createPaper({
            round,
            questions: [mcq()],
        });

        expect(
            expectOk(
                await organiserApi.delete(
                    `/rounds/${round.id}/questions/${questions[0].id}`
                )
            )
        ).toEqual({ message: 'Question deleted' });
        expect(await prisma.questions.count()).toBe(0);
    });

    it('responds 400 once the exam has left draft', async () => {
        const { round, organiserApi } = await setup({ exam_status: 'live' });
        const { questions } = await f.createPaper({
            round,
            questions: [mcq()],
        });
        expectError(
            await organiserApi.delete(
                `/rounds/${round.id}/questions/${questions[0].id}`
            ),
            400,
            'Questions can only be deleted while the exam is in draft status'
        );
    });

    it('responds 409 for a question that already has answers, keeping it', async () => {
        const { round, school, educator, organiserApi } = await setup({
            state: 'open',
        });
        const { questions } = await f.createPaper({
            round,
            questions: [mcq()],
        });
        const entrant = await f.createEntrant({ school });
        await prisma.submissions.create({
            data: {
                round_id: round.id,
                entrant_id: entrant.id,
                submitted_by: educator.id,
                idempotency_key: 'k',
                round_close_snapshot: round.closes_at,
                answers: {
                    create: [
                        { question_id: questions[0].id, answer_value: '0' },
                    ],
                },
            },
        });

        const res = await organiserApi.delete(
            `/rounds/${round.id}/questions/${questions[0].id}`
        );
        expectError(
            res,
            409,
            'This record is still referenced by other records'
        );
        expect(await prisma.questions.count()).toBe(1);
    });

    it('responds 404 for a question from another round and refuses outsiders', async () => {
        const { round, olympiad, organiserApi, outsiderApi } = await setup();
        const { questions } = await f.createPaper({
            round,
            questions: [mcq()],
        });
        const otherRound = await f.createRound({ olympiad });

        expectError(
            await organiserApi.delete(
                `/rounds/${otherRound.id}/questions/${questions[0].id}`
            ),
            404,
            'Question not found'
        );
        expectError(
            await outsiderApi.delete(
                `/rounds/${round.id}/questions/${questions[0].id}`
            ),
            403,
            'Your school is not registered for this olympiad'
        );
        expect(await prisma.questions.count()).toBe(1);
    });
});

// The organiser's question bank: every question on their other rounds' papers
describe('GET /rounds/:roundId/question-bank', () => {
    it("lists the organiser's questions from other rounds, with the round each came from", async () => {
        const { olympiad, organiser, round, organiserApi } = await setup();
        const earlier = await f.createRound({ olympiad });
        const {
            questions: [banked],
        } = await f.createPaper({ round: earlier, questions: [mcq()] });
        await f.createPaper({
            round,
            questions: [mcq({ prompt: 'Already on this paper' })],
        });
        // Another organiser's questions never appear
        const stranger = await f.createRound({
            olympiad: await f.createOlympiad(),
        });
        await f.createPaper({ round: stranger, questions: [mcq()] });
        // The bank spans all of the organiser's olympiads, not just this one
        const otherOlympiad = await f.createOlympiad({ organiser });
        const {
            questions: [fromOtherOlympiad],
        } = await f.createPaper({
            round: await f.createRound({ olympiad: otherOlympiad }),
            questions: [mcq()],
        });

        const { questions } = expectOk(
            await organiserApi.get(`/rounds/${round.id}/question-bank`)
        );
        expect(questions.map((q) => q.id).sort()).toEqual(
            [banked.id, fromOtherOlympiad.id].sort()
        );
        expect(questions.find((q) => q.id === banked.id).source_round).toEqual({
            id: earlier.id,
            name: earlier.name,
        });
    });

    it("is for the round's organiser only", async () => {
        const { round, otherOrganiserApi, organiserApi } = await setup();
        expectError(
            await otherOrganiserApi.get(`/rounds/${round.id}/question-bank`),
            403,
            'Not your round'
        );
        expectError(
            await organiserApi.get(`/rounds/${MISSING}/question-bank`),
            404,
            'Round not found'
        );
    });
});

describe('POST /rounds/:roundId/question-bank/import', () => {
    const withBank = async (roundOverrides) => {
        const world = await setup(roundOverrides);
        const earlier = await f.createRound({ olympiad: world.olympiad });
        const { questions } = await f.createPaper({
            round: earlier,
            questions: [
                mcq(),
                {
                    type: 'short_answer',
                    prompt: 'Capital of South Africa?',
                    correct_answer: 'Pretoria',
                },
            ],
        });
        return {
            ...world,
            bank: questions,
            url: `/rounds/${world.round.id}/question-bank/import`,
        };
    };

    it("copies the chosen questions onto this round's paper, leaving the originals untouched", async () => {
        const { round, bank, url, organiserApi } = await withBank();

        const { questions } = expectOk(
            await organiserApi
                .post(url)
                .send({ question_ids: bank.map((q) => q.id) }),
            201
        );
        expect(questions).toHaveLength(2);
        expect(questions.map((q) => q.id)).not.toEqual(
            expect.arrayContaining([bank[0].id])
        );

        const onPaper = await prisma.questions.findMany({
            where: { papers: { round_id: round.id } },
        });
        expect(onPaper.map((q) => q.prompt).sort()).toEqual(
            bank.map((q) => q.prompt).sort()
        );
        expect(onPaper.find((q) => q.type === 'mcq')).toMatchObject({
            correct_option: '0,2',
            options: ['2', '4', '5', '9'],
        });
        // 2 originals + 2 copies
        expect(await prisma.questions.count()).toBe(4);
    });

    it('imports a question sent twice only once', async () => {
        const { bank, url, organiserApi } = await withBank();
        const { questions } = expectOk(
            await organiserApi
                .post(url)
                .send({ question_ids: [bank[0].id, bank[0].id] }),
            201
        );
        expect(questions).toHaveLength(1);
    });

    it('only imports into a draft exam', async () => {
        const { bank, url, organiserApi } = await withBank({
            exam_status: 'ready',
        });
        expectError(
            await organiserApi.post(url).send({ question_ids: [bank[0].id] }),
            400,
            'Questions can only be imported while the exam is in draft status'
        );
        expect(await prisma.questions.count()).toBe(2);
    });

    it("refuses another organiser's questions, and imports nothing if any id is unknown", async () => {
        const { bank, url, organiserApi } = await withBank();
        const {
            questions: [foreign],
        } = await f.createPaper({
            round: await f.createRound({ olympiad: await f.createOlympiad() }),
            questions: [mcq()],
        });

        expectError(
            await organiserApi
                .post(url)
                .send({ question_ids: [bank[0].id, foreign.id] }),
            404,
            'One or more bank questions were not found'
        );
        expectError(
            await organiserApi.post(url).send({ question_ids: [MISSING] }),
            404,
            'One or more bank questions were not found'
        );
        expect(await prisma.questions.count()).toBe(3);
    });

    it('needs at least one valid question id', async () => {
        const { url, organiserApi } = await withBank();
        expectError(
            await organiserApi.post(url).send({ question_ids: [] }),
            422,
            'At least one question is required'
        );
        expectError(
            await organiserApi.post(url).send({ question_ids: ['q-1'] }),
            422,
            'Question ids must be valid UUIDs'
        );
    });

    it("is for the round's organiser only", async () => {
        const { bank, round, otherOrganiserApi } = await withBank();
        expectError(
            await otherOrganiserApi
                .post(`/rounds/${round.id}/question-bank/import`)
                .send({ question_ids: [bank[0].id] }),
            403,
            'Not your round'
        );
    });
});

// A question and the copies imported from it are one question in the bank:
// listed once, never on one paper twice, and judged on all its answers
describe('question families in the bank', () => {
    const importInto = (api, round, ids) =>
        api
            .post(`/rounds/${round.id}/question-bank/import`)
            .send({ question_ids: ids });

    // A question first set in round A and already copied into round B
    const withCopy = async () => {
        const world = await setup();
        const roundA = await f.createRound({ olympiad: world.olympiad });
        const roundB = await f.createRound({ olympiad: world.olympiad });
        const {
            questions: [original],
        } = await f.createPaper({ round: roundA, questions: [mcq()] });
        const {
            questions: [copy],
        } = expectOk(
            await importInto(world.organiserApi, roundB, [original.id]),
            201
        );
        return { ...world, roundA, roundB, original, copy };
    };

    it('lists a question once, as the original, with every round it was used in', async () => {
        const { round, roundA, roundB, original, copy, organiserApi } =
            await withCopy();
        expect(copy.source_question_id).toBe(original.id);

        const { questions } = expectOk(
            await organiserApi.get(`/rounds/${round.id}/question-bank`)
        );
        expect(questions).toHaveLength(1);
        expect(questions[0]).toMatchObject({
            id: original.id,
            source_round: { id: roundA.id, name: roundA.name },
        });
        expect(questions[0].used_in.map((r) => r.id).sort()).toEqual(
            [roundA.id, roundB.id].sort()
        );
    });

    it("drops a question from this round's bank once it is on the paper", async () => {
        const { round, original, organiserApi } = await withCopy();
        expectOk(await importInto(organiserApi, round, [original.id]), 201);

        expect(
            expectOk(
                await organiserApi.get(`/rounds/${round.id}/question-bank`)
            ).questions
        ).toEqual([]);
    });

    it('refuses to put a question on a paper twice, whichever version is chosen', async () => {
        const { round, original, copy, organiserApi } = await withCopy();
        const message =
            'One or more of these questions is already on this paper';
        expectOk(await importInto(organiserApi, round, [copy.id]), 201);

        expectError(
            await importInto(organiserApi, round, [original.id]),
            409,
            message
        );
        expectError(
            await importInto(organiserApi, round, [copy.id]),
            409,
            message
        );
        const onPaper = await prisma.questions.findMany({
            where: { papers: { round_id: round.id } },
        });
        // Imported from the copy, it still records the original
        expect(onPaper.map((q) => q.source_question_id)).toEqual([original.id]);
    });

    it('imports one copy when several versions of a question are chosen together', async () => {
        const { round, original, copy, organiserApi } = await withCopy();
        const { questions } = expectOk(
            await importInto(organiserApi, round, [original.id, copy.id]),
            201
        );
        expect(questions).toHaveLength(1);
    });

    it('lets only one of two imports at the same moment through', async () => {
        const { round, original, organiserApi } = await withCopy();
        const responses = await Promise.all([
            importInto(organiserApi, round, [original.id]),
            importInto(organiserApi, round, [original.id]),
        ]);

        expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
        expect(
            await prisma.questions.count({
                where: { papers: { round_id: round.id } },
            })
        ).toBe(1);
    });

    it('keeps the copies when the original is deleted', async () => {
        const { original, copy } = await withCopy();
        await prisma.questions.delete({ where: { id: original.id } });
        expect(
            await prisma.questions.findUnique({ where: { id: copy.id } })
        ).toMatchObject({ source_question_id: null });
    });
});

// A8: a question's difficulty is 1 − average score ÷ max points, over its
// marked answers
describe('question difficulty', () => {
    // One answer per learner at the given points; null leaves it unmarked
    const answer = async (question, round, pointsList) => {
        const school = await f.createSchool();
        for (const points of pointsList) {
            const entrant = await f.createEntrant({ school });
            const submission = await prisma.submissions.create({
                data: {
                    round_id: round.id,
                    entrant_id: entrant.id,
                    route: 'online',
                    status: 'marked',
                    idempotency_key: `k-${entrant.id}`,
                    round_close_snapshot: round.closes_at,
                },
            });
            await prisma.answers.create({
                data: {
                    submission_id: submission.id,
                    question_id: question.id,
                    answer_value: '…',
                    points_awarded: points,
                    marked_at: points === null ? null : new Date(),
                },
            });
        }
    };

    it('shows the organiser how hard each question proved in the round, from its marked answers', async () => {
        const { round, organiserApi, educatorApi } = await setup();
        const {
            questions: [prime, essay],
        } = await f.createPaper({
            round,
            questions: [mcq(), { type: 'essay', max_points: 10 }],
        });
        // Half the marks on average; the unmarked answer doesn't count
        await answer(prime, round, [4, 4, 0, 0, 2, null]);
        await answer(essay, round, [10, 8, 9]);

        const { questions } = expectOk(
            await organiserApi.get(`/rounds/${round.id}/questions`)
        );
        expect(questions.map((q) => q.difficulty)).toEqual([
            { value: 0.5, band: 'medium', answered: 5 },
            { value: null, band: null, answered: 3 },
        ]);

        // Educators digitising the paper don't get it
        const forEducator = expectOk(
            await educatorApi.get(`/rounds/${round.id}/questions`)
        ).questions;
        expect(forEducator[0]).not.toHaveProperty('difficulty');
    });

    it('judges a bank question on its answers in every round it was used in', async () => {
        const world = await setup();
        const roundA = await f.createRound({ olympiad: world.olympiad });
        const roundB = await f.createRound({ olympiad: world.olympiad });
        const {
            questions: [original],
        } = await f.createPaper({ round: roundA, questions: [mcq()] });
        const {
            questions: [copy],
        } = expectOk(
            await world.organiserApi
                .post(`/rounds/${roundB.id}/question-bank/import`)
                .send({ question_ids: [original.id] }),
            201
        );
        // Full marks in round A, none in round B
        await answer(original, roundA, [4, 4, 4]);
        await answer(copy, roundB, [0, 0, 0]);

        const { questions } = expectOk(
            await world.organiserApi.get(
                `/rounds/${world.round.id}/question-bank`
            )
        );
        expect(questions[0].difficulty).toEqual({
            value: 0.5,
            band: 'medium',
            answered: 6,
        });
    });
});

describe('GET /rounds/:roundId/exam-status', () => {
    it('summarises the exam and who approved it', async () => {
        const { round, organiser, organiserApi } = await setup({
            exam_status: 'live',
            approved_at: new Date('2026-09-01T10:00:00Z'),
        });
        await prisma.rounds.update({
            where: { id: round.id },
            data: { approved_by: organiser.id },
        });
        const { paper } = await f.createPaper({
            round,
            questions: [{ type: 'mcq' }, { type: 'mcq' }, { type: 'essay' }],
        });

        expect(
            expectOk(await organiserApi.get(`/rounds/${round.id}/exam-status`))
        ).toEqual({
            exam_status: 'live',
            state: 'scheduled',
            question_count: 3,
            questions_by_type: { mcq: 2, essay: 1 },
            paper_id: paper.id,
            approved_by: organiser.id,
            approved_at: '2026-09-01T10:00:00.000Z',
            approved_by_name: organiser.full_name,
        });
    });

    it('reports an empty draft for a round without a paper', async () => {
        const { round, organiserApi } = await setup();
        expect(
            expectOk(await organiserApi.get(`/rounds/${round.id}/exam-status`))
        ).toMatchObject({
            exam_status: 'draft',
            question_count: 0,
            questions_by_type: {},
            paper_id: null,
            approved_by_name: null,
        });
    });

    it('is readable by an educator of a school in the olympiad', async () => {
        const { round, educatorApi } = await setup();
        await f.createPaper({
            round,
            questions: [mcq(), mcq({ type: 'essay' })],
        });
        expect(
            expectOk(await educatorApi.get(`/rounds/${round.id}/exam-status`))
        ).toMatchObject({
            exam_status: 'draft',
            question_count: 2,
            questions_by_type: { mcq: 1, essay: 1 },
        });
    });

    it('responds 403 to another organiser and 404 for an unknown round', async () => {
        const { round, otherOrganiserApi, organiserApi, outsiderApi } =
            await setup();
        expectError(
            await outsiderApi.get(`/rounds/${round.id}/exam-status`),
            403,
            'Your school is not registered for this olympiad'
        );
        expectError(
            await otherOrganiserApi.get(`/rounds/${round.id}/exam-status`),
            403,
            'Not your round'
        );
        expectError(
            await organiserApi.get(`/rounds/${MISSING}/exam-status`),
            404,
            'Round not found'
        );
    });
});

describe('PATCH /rounds/:roundId/exam-status', () => {
    const status = (api, round, value) =>
        api.patch(`/rounds/${round.id}/exam-status`).send({ status: value });

    it('runs draft → ready → live, recording the approving organiser', async () => {
        const { round, organiser, organiserApi } = await setup();
        await f.createPaper({ round, questions: [mcq()] });

        expect(expectOk(await status(organiserApi, round, 'ready'))).toEqual({
            exam_status: 'ready',
        });
        expect(expectOk(await status(organiserApi, round, 'live'))).toEqual({
            exam_status: 'live',
        });

        expect(
            await prisma.rounds.findUnique({ where: { id: round.id } })
        ).toMatchObject({
            exam_status: 'live',
            approved_by: organiser.id,
            approved_at: expect.any(Date),
        });
    });

    it('sends a ready exam back to draft and clears any approval', async () => {
        const { round, organiser, organiserApi } = await setup({
            exam_status: 'ready',
            approved_at: new Date(),
        });
        await prisma.rounds.update({
            where: { id: round.id },
            data: { approved_by: organiser.id },
        });

        expectOk(await status(organiserApi, round, 'draft'));

        expect(
            await prisma.rounds.findUnique({ where: { id: round.id } })
        ).toMatchObject({
            exam_status: 'draft',
            approved_by: null,
            approved_at: null,
        });
    });

    // The educator digitises the paper and hands it over; only the organiser
    // verifies it or sends it back
    it('lets the educator who built the exam submit it for review', async () => {
        const { round, educatorApi } = await setup();
        await f.createPaper({ round, questions: [mcq()] });

        expect(expectOk(await status(educatorApi, round, 'ready'))).toEqual({
            exam_status: 'ready',
        });
        expect(
            expectOk(await educatorApi.get(`/rounds/${round.id}/exam-status`))
        ).toMatchObject({
            exam_status: 'ready',
            question_count: 1,
        });
    });

    it.each(['live', 'draft'])(
        'refuses to let an educator move an exam to %s',
        async (target) => {
            const { round, educatorApi } = await setup({
                exam_status: 'ready',
            });
            await f.createPaper({ round, questions: [mcq()] });

            expectError(
                await status(educatorApi, round, target),
                403,
                'Only the organiser can approve an exam or send it back for edits'
            );
            expect(
                (await prisma.rounds.findUnique({ where: { id: round.id } }))
                    .exam_status
            ).toBe('ready');
        }
    );

    it('refuses an educator whose school is not in the olympiad', async () => {
        const { round, outsiderApi } = await setup();
        await f.createPaper({ round, questions: [mcq()] });
        expectError(
            await status(outsiderApi, round, 'ready'),
            403,
            'Your school is not registered for this olympiad'
        );
    });

    it('responds 400 when marking an exam without questions as ready', async () => {
        const { round, organiserApi } = await setup();
        expectError(
            await status(organiserApi, round, 'ready'),
            400,
            'Cannot mark as ready — at least one question is required'
        );
    });

    it.each([
        ['draft', 'live'],
        ['live', 'draft'],
        ['live', 'ready'],
    ])('responds 400 for %s → %s', async (from, to) => {
        const { round, organiserApi } = await setup({ exam_status: from });
        await f.createPaper({ round, questions: [mcq()] });
        expectError(
            await status(organiserApi, round, to),
            400,
            `Cannot transition from ${from} to ${to}`
        );
    });

    it.each([undefined, 'published'])(
        'responds 422 for status %p',
        async (value) => {
            const { round, organiserApi } = await setup();
            expectError(
                await status(organiserApi, round, value),
                422,
                'status must be one of: draft, ready, live'
            );
        }
    );

    it('responds 403 to another organiser, leaving the exam unchanged', async () => {
        const { round, otherOrganiserApi } = await setup({
            exam_status: 'ready',
        });
        await f.createPaper({ round, questions: [mcq()] });
        expectError(
            await status(otherOrganiserApi, round, 'live'),
            403,
            'Not your round'
        );
        expect(
            (await prisma.rounds.findUnique({ where: { id: round.id } }))
                .exam_status
        ).toBe('ready');
    });
});

describe('GET /papers/by-round/:roundId', () => {
    const withFiles = async (paperOverrides = {}) => {
        const world = await setup();
        await f.createPaper({
            round: world.round,
            file_url: 'rounds/r/paper.pdf',
            memo_file_url: 'rounds/r/memo.pdf',
            ...paperOverrides,
        });
        return world;
    };

    it('gives the organiser hour-long viewing links to the paper and memo', async () => {
        const { round, organiserApi } = await withFiles();
        expect(
            expectOk(
                await organiserApi.get(
                    `/papers/by-round/${round.id}?type=paper`
                )
            )
        ).toEqual({
            url: 'https://storage.test/rounds/r/paper.pdf?expires=3600',
        });
        expect(
            expectOk(
                await organiserApi.get(`/papers/by-round/${round.id}?type=memo`)
            )
        ).toEqual({
            url: 'https://storage.test/rounds/r/memo.pdf?expires=3600',
        });
        expect(supabase.storage.from).toHaveBeenCalledWith('papers');
    });

    it("gives a registered school's educator the paper but not the memo", async () => {
        const { round, educatorApi } = await withFiles();
        expect(
            expectOk(await educatorApi.get(`/papers/by-round/${round.id}`)).url
        ).toContain('paper.pdf');
        expectError(
            await educatorApi.get(`/papers/by-round/${round.id}?type=memo`),
            403,
            'Only the organiser can view the memo'
        );
    });

    it('treats an unknown type as the paper', async () => {
        const { round, organiserApi } = await withFiles();
        expect(
            expectOk(
                await organiserApi.get(
                    `/papers/by-round/${round.id}?type=answers`
                )
            ).url
        ).toContain('paper.pdf');
    });

    it("responds 404 when there's no paper or no file of that type", async () => {
        const { round, organiserApi } = await setup();
        expectError(
            await organiserApi.get(`/papers/by-round/${round.id}`),
            404,
            'No paper uploaded for this round'
        );
        await f.createPaper({ round, file_url: 'rounds/r/paper.pdf' });
        expectError(
            await organiserApi.get(`/papers/by-round/${round.id}?type=memo`),
            404,
            'No memo uploaded for this round'
        );
    });

    it('refuses organisers and schools outside the olympiad', async () => {
        const { round, otherOrganiserApi, outsiderApi } = await withFiles();
        expectError(
            await otherOrganiserApi.get(`/papers/by-round/${round.id}`),
            403,
            'Not your round'
        );
        expectError(
            await outsiderApi.get(`/papers/by-round/${round.id}`),
            403,
            'Your school is not registered for this olympiad'
        );
        expect(supabase.storage.bucket.createSignedUrl).not.toHaveBeenCalled();
    });

    it("responds 400 when storage can't sign the link", async () => {
        const { round, organiserApi } = await withFiles();
        supabase.storage.bucket.createSignedUrl.mockResolvedValueOnce({
            data: null,
            error: { message: 'Object not found' },
        });
        expectError(
            await organiserApi.get(`/papers/by-round/${round.id}`),
            400,
            'Could not generate view link: Object not found'
        );
    });
});

describe('GET /papers/:paperId/download', () => {
    it('gives the owning organiser a one-minute download link', async () => {
        const { round, organiserApi } = await setup();
        const { paper } = await f.createPaper({
            round,
            file_url: 'rounds/r/paper.pdf',
            memo_file_url: 'rounds/r/memo.pdf',
        });

        expect(
            expectOk(await organiserApi.get(`/papers/${paper.id}/download`))
        ).toEqual({
            url: 'https://storage.test/rounds/r/paper.pdf?expires=60',
        });
        expect(
            expectOk(
                await organiserApi.get(`/papers/${paper.id}/download?type=memo`)
            )
        ).toEqual({ url: 'https://storage.test/rounds/r/memo.pdf?expires=60' });
    });

    it('responds 404 to another organiser, for an unknown paper, and for a missing file', async () => {
        const { round, organiserApi, otherOrganiserApi } = await setup();
        const { paper } = await f.createPaper({
            round,
            file_url: 'rounds/r/paper.pdf',
        });

        expectError(
            await otherOrganiserApi.get(`/papers/${paper.id}/download`),
            404,
            'Paper not found'
        );
        expectError(
            await organiserApi.get(`/papers/${MISSING}/download`),
            404,
            'Paper not found'
        );
        expectError(
            await organiserApi.get(`/papers/${paper.id}/download?type=memo`),
            404,
            'No memo uploaded for this round'
        );
    });
});
