// A student sitting an exam online: load → start → save answers → resume →
// submit, through the real route handlers and database.
jest.mock(
    '../../src/config/supabase',
    () => require('./helpers/externalMocks').supabase
);

const prisma = require('../../src/config/database').default;
const studentExamRouter = require('../../src/routes/studentExam');
const { getRouteHandler, run } = require('../unit/helpers/http');
const f = require('./helpers/factories');
const {
    getRegisteredRounds,
    getStudentRoundDetail,
} = require('../../src/services/studentRoundService');

const getExam = getRouteHandler(studentExamRouter, 'get', '/:roundId/exam');
const startExam = getRouteHandler(
    studentExamRouter,
    'post',
    '/:roundId/exam/start'
);
const saveAnswer = getRouteHandler(
    studentExamRouter,
    'patch',
    '/:roundId/exam/answers/:questionId'
);
const submitExam = getRouteHandler(
    studentExamRouter,
    'post',
    '/:roundId/exam/submit'
);

// A live, open round with three questions and a registered student
const setupSitting = async ({ roundOverrides = {} } = {}) => {
    const { olympiad, school, educator } = await f.createOlympiadWithSchool();
    const round = await f.createRound({
        olympiad,
        state: 'open',
        exam_status: 'live',
        opens_at: f.hoursFromNow(-1),
        closes_at: f.hoursFromNow(1),
        ...roundOverrides,
    });
    const { questions } = await f.createPaper({
        round,
        questions: [
            {
                type: 'mcq',
                prompt: 'Which are prime?',
                options: ['2', '4', '5', '9'],
                correct_option: '0,2',
                max_points: 4,
                negative_pct: 25,
            },
            {
                type: 'short_answer',
                prompt: 'Capital of South Africa?',
                correct_answer: 'Pretoria',
                max_points: 2,
            },
            { type: 'essay', prompt: 'Explain photosynthesis', max_points: 10 },
        ],
    });
    const { user, entrant } = await f.createStudent({ school });
    await f.registerEntrant({ entrant, round, educator });

    const req = (extra = {}) => ({
        params: { roundId: round.id, ...extra.params },
        body: extra.body ?? {},
        user: {
            userId: user.id,
            role: 'student',
            entrant: { id: entrant.id, school_id: school.id },
        },
    });
    const [mcq, short, essay] = questions;
    return { round, entrant, school, educator, req, mcq, short, essay };
};

const data = (res) => res.json.mock.calls[0][0].data;
const errorOf = (next) => next.mock.calls[0]?.[0];

describe('online exam sitting', () => {
    it('runs from loading the exam to a marked submission', async () => {
        const { round, entrant, req, mcq, short, essay } = await setupSitting();

        // Load: the entrant's own variant — question order and option order
        // personally shuffled — with the answers stripped.
        const loaded = await run(getExam, req());
        const exam = data(loaded.res);
        expect(exam.submission).toBeNull();
        expect(exam.total_points).toBe(16);
        for (const q of exam.questions)
            expect(q).not.toHaveProperty('correct_option');
        expect(exam.questions.find((q) => q.id === mcq.id)).toMatchObject({
            multi_select: true,
            negative_pct: 25,
        });

        const assignment = await prisma.exam_assignments.findUnique({
            where: {
                round_id_entrant_id: {
                    round_id: round.id,
                    entrant_id: entrant.id,
                },
            },
        });
        expect(exam.questions.map((q) => q.id)).toEqual(
            assignment.question_order
        );
        const displayedMcq = exam.questions.find((q) => q.id === mcq.id);
        expect(displayedMcq.options).toEqual(
            assignment.option_orders[mcq.id].map(
                (index) => ['2', '4', '5', '9'][index]
            )
        );

        // The student picks the two primes by their displayed position.
        const primePicks = displayedMcq.options
            .map((option, index) =>
                option === '2' || option === '5' ? index : -1
            )
            .filter((index) => index >= 0)
            .join(',');

        // Start: one online submission with an empty answer per question
        const started = await run(startExam, req());
        expect(started.res.status).toHaveBeenCalledWith(201);
        const submission = await prisma.submissions.findFirst({
            include: { answers: true },
        });
        expect(submission).toMatchObject({
            route: 'online',
            status: 'received',
            submitted_by: null,
            idempotency_key: `${round.id}:${entrant.id}:online`,
            round_close_snapshot: round.closes_at,
            exam_assignment_id: assignment.id,
        });
        expect(submission.answers.map((a) => a.answer_value)).toEqual([
            null,
            null,
            null,
        ]);

        // Save answers as the student works
        await run(
            saveAnswer,
            req({
                params: { questionId: mcq.id },
                body: { answer_value: primePicks },
            })
        );
        await run(
            saveAnswer,
            req({
                params: { questionId: short.id },
                body: { answer_value: '  pretoria ' },
            })
        );
        await run(
            saveAnswer,
            req({
                params: { questionId: essay.id },
                body: { answer_value: 'Plants turn light into sugar.' },
            })
        );

        // Refreshing the page resumes with the saved answers, no second submission
        const resumed = await run(startExam, req());
        expect(resumed.res.status).not.toHaveBeenCalled();
        expect(data(resumed.res).submission.answers).toHaveLength(3);
        expect(await prisma.submissions.count()).toBe(1);
        const reloaded = data((await run(getExam, req())).res);
        expect(
            reloaded.submission.answers.find((a) => a.question_id === short.id)
                .answer_value
        ).toBe('  pretoria ');

        // Submit: choice and short answers marked against the variant the
        // entrant sat, essay waits for a human
        const submitted = await run(submitExam, req());
        expect(data(submitted.res)).toEqual({
            message: 'Exam submitted successfully',
            status: 'queued_for_marking',
            total_points: 6, // full 4 for the primes, wherever they were displayed + 2 for the short answer
            is_late: false,
        });

        const answers = await prisma.answers.findMany({
            where: { submission_id: submission.id },
        });
        const byQuestion = Object.fromEntries(
            answers.map((a) => [a.question_id, a])
        );
        expect(byQuestion[mcq.id]).toMatchObject({
            is_correct: true,
            marked_at: expect.any(Date),
        });
        expect(String(byQuestion[mcq.id].points_awarded)).toBe('4');
        expect(byQuestion[short.id]).toMatchObject({ is_correct: true });
        expect(String(byQuestion[short.id].points_awarded)).toBe('2');
        expect(byQuestion[essay.id]).toMatchObject({
            is_correct: null,
            points_awarded: null,
            marked_at: null,
        });

        expect(
            await prisma.submissions.findUnique({
                where: { id: submission.id },
            })
        ).toMatchObject({
            status: 'queued_for_marking',
            is_late: false,
        });
        const result = await prisma.results.findUnique({
            where: {
                round_id_entrant_id: {
                    round_id: round.id,
                    entrant_id: entrant.id,
                },
            },
        });
        expect(String(result.total_points)).toBe('6');

        // No second attempt, no more edits
        expect(errorOf((await run(submitExam, req())).next)).toMatchObject({
            statusCode: 400,
        });
        expect(errorOf((await run(startExam, req())).next)).toMatchObject({
            message: 'This exam has already been submitted',
        });
        const lateEdit = await run(
            saveAnswer,
            req({ params: { questionId: mcq.id }, body: { answer_value: '0,2' } })
        );
        expect(errorOf(lateEdit.next)).toMatchObject({ statusCode: 400 });
        expect(
            (
                await prisma.answers.findUnique({
                    where: { id: byQuestion[mcq.id].id },
                })
            ).answer_value
        ).toBe(primePicks);
    });

    it('issues every entrant their own distinct variant of the paper', async () => {
        const { round, school, educator, req } = await setupSitting();
        const { user: secondUser, entrant: secondEntrant } =
            await f.createStudent({
                school,
            });
        await f.registerEntrant({ entrant: secondEntrant, round, educator });
        const secondReq = {
            ...req(),
            user: {
                userId: secondUser.id,
                role: 'student',
                entrant: { id: secondEntrant.id, school_id: school.id },
            },
        };

        const first = data((await run(getExam, req())).res);
        const second = data((await run(getExam, secondReq)).res);

        // The same paper, personally shuffled for each entrant.
        expect([...second.questions.map((q) => q.id)].sort()).toEqual(
            [...first.questions.map((q) => q.id)].sort()
        );
        const layouts = await prisma.exam_assignments.findMany({
            where: { round_id: round.id },
        });
        expect(layouts).toHaveLength(2);
        expect(new Set(layouts.map((layout) => layout.variant_hash)).size).toBe(
            2
        );
    });

    it('marks an all-objective exam as automarked', async () => {
        const { req, mcq, short, essay } = await setupSitting();
        await prisma.questions.delete({ where: { id: essay.id } });

        const exam = data((await run(getExam, req())).res);
        const picks = exam.questions
            .find((q) => q.id === mcq.id)
            .options.map((option, index) =>
                option === '2' || option === '5' ? index : -1
            )
            .filter((index) => index >= 0)
            .join(',');

        await run(startExam, req());
        await run(
            saveAnswer,
            req({ params: { questionId: mcq.id }, body: { answer_value: picks } })
        );
        await run(
            saveAnswer,
            req({
                params: { questionId: short.id },
                body: { answer_value: 'Durban' },
            })
        );
        const { res } = await run(submitExam, req());

        expect(data(res)).toMatchObject({
            status: 'automarked',
            total_points: 4,
        });
    });

    it('rejects a submission after closing and records why', async () => {
        const { round, req } = await setupSitting();
        await run(startExam, req());

        // The round's deadline passed after the student started (the lifecycle job
        // hasn't closed it yet); the deadline as it stands now decides
        await prisma.rounds.update({
            where: { id: round.id },
            data: { closes_at: f.hoursFromNow(-0.01) },
        });
        const { next } = await run(submitExam, req());

        expect(errorOf(next)).toMatchObject({ statusCode: 400 });
        expect(
            await prisma.submission_deadline_decisions.count({
                where: { round_id: round.id, accepted: false },
            })
        ).toBe(1);
        expect(
            (
                await prisma.submissions.findFirst({
                    where: { round_id: round.id },
                })
            ).status
        ).toBe('received');
    });

    it("keeps a started exam resumable on the student's pages until it is submitted", async () => {
        const { round, entrant, req } = await setupSitting();
        const views = async () => ({
            detail: await getStudentRoundDetail(round.id, entrant.id),
            dashboard: (await getRegisteredRounds(entrant.id)).rounds[0],
        });

        await run(startExam, req());
        const inProgress = await views();
        expect(inProgress.detail).toMatchObject({
            canSitOnline: true,
            hasSubmitted: false,
            submissionStatus: 'received',
        });
        expect(inProgress.dashboard.hasSubmitted).toBe(false);

        await run(submitExam, req());
        const done = await views();
        expect(done.detail).toMatchObject({
            hasSubmitted: true,
            submissionStatus: 'queued_for_marking',
        });
        expect(done.dashboard.hasSubmitted).toBe(true);
    });

    it("keeps a student out of a round they aren't registered for", async () => {
        const { round, req } = await setupSitting();
        const outsider = await f.createStudent({
            school: await f.createSchool(),
        });
        const outsiderReq = {
            ...req(),
            user: {
                userId: outsider.user.id,
                role: 'student',
                entrant: { id: outsider.entrant.id },
            },
        };

        expect(errorOf((await run(startExam, outsiderReq)).next)).toMatchObject(
            {
                statusCode: 403,
            }
        );
        expect(
            await prisma.submissions.count({ where: { round_id: round.id } })
        ).toBe(0);
    });

    it.each([
        [
            "the exam isn't live yet",
            { exam_status: 'ready' },
            'This exam is not available for sitting',
        ],
        [
            'the round has closed',
            { state: 'closed' },
            'Round is not open (state: closed)',
        ],
    ])("won't start when %s", async (_label, roundOverrides, message) => {
        const { req } = await setupSitting({ roundOverrides });
        expect(errorOf((await run(startExam, req())).next)).toMatchObject({
            message,
        });
        expect(await prisma.submissions.count()).toBe(0);
    });

    it('requires starting the exam before saving an answer', async () => {
        const { req, mcq } = await setupSitting();
        const { next } = await run(
            saveAnswer,
            req({ params: { questionId: mcq.id }, body: { answer_value: '0' } })
        );
        expect(errorOf(next)).toMatchObject({
            message: 'No active submission found — start the exam first',
        });
    });

    it('rejects saving an answer to a question from another round', async () => {
        const { req } = await setupSitting();
        const other = await f.createRound({
            olympiad: await f.createOlympiad(),
        });
        const { questions } = await f.createPaper({
            round: other,
            questions: [{ type: 'essay' }],
        });
        await run(startExam, req());

        const { next } = await run(
            saveAnswer,
            req({
                params: { questionId: questions[0].id },
                body: { answer_value: 'x' },
            })
        );
        expect(errorOf(next)).toMatchObject({ statusCode: 404 });
    });
});
