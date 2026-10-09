// The exam verification workflow (draft → ready → live) lives inside the
// route file; its handlers are called directly here.
jest.mock('../../../src/config/database', () => ({
    __esModule: true,
    default: require('../helpers/prismaMock').prisma,
}));
jest.mock('../../../src/config/supabase', () => ({
    auth: { getUser: jest.fn() },
}));

const { prisma, resetPrismaMock } = require('../helpers/prismaMock');
const router = require('../../../src/routes/examStatus');
const { mockReq, getRouteHandler, run } = require('../helpers/http');

const getExamStatus = getRouteHandler(router, 'get', '/:roundId/exam-status');
const updateExamStatus = getRouteHandler(
    router,
    'patch',
    '/:roundId/exam-status'
);

const organiser = { userId: 'org-1', role: 'organiser' };
const req = (extra = {}) =>
    mockReq({ user: organiser, params: { roundId: 'round-1' }, ...extra });

const round = (overrides = {}) => ({
    id: 'round-1',
    state: 'scheduled',
    exam_status: 'draft',
    approved_by: null,
    approved_at: null,
    olympiads: { organiser_id: 'org-1' },
    papers: [{ id: 'paper-1', questions: [{ id: 'q1', type: 'mcq' }] }],
    ...overrides,
});

beforeEach(resetPrismaMock);

describe('GET /:roundId/exam-status', () => {
    it('rejects an unknown round', async () => {
        prisma.rounds.findUnique.mockResolvedValue(null);
        const { next } = await run(getExamStatus, req());
        expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 404 });
    });

    it("rejects an organiser who doesn't own the round", async () => {
        prisma.rounds.findUnique.mockResolvedValue(
            round({ olympiads: { organiser_id: 'org-2' } })
        );
        const { next } = await run(getExamStatus, req());
        expect(next.mock.calls[0][0]).toMatchObject({
            statusCode: 403,
            message: 'Not your round',
        });
    });

    it('summarises the exam with question counts by type', async () => {
        prisma.rounds.findUnique.mockResolvedValue(
            round({
                exam_status: 'ready',
                papers: [
                    {
                        id: 'paper-1',
                        questions: [
                            { id: 'q1', type: 'mcq' },
                            { id: 'q2', type: 'mcq' },
                            { id: 'q3', type: 'essay' },
                        ],
                    },
                ],
            })
        );

        const { res } = await run(getExamStatus, req());

        expect(prisma.users.findUnique).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: {
                exam_status: 'ready',
                state: 'scheduled',
                question_count: 3,
                questions_by_type: { mcq: 2, essay: 1 },
                paper_id: 'paper-1',
                approved_by: null,
                approved_at: null,
                approved_by_name: null,
            },
        });
    });

    it('reports an empty exam when there is no paper', async () => {
        prisma.rounds.findUnique.mockResolvedValue(round({ papers: [] }));
        const { res } = await run(getExamStatus, req());
        expect(res.json.mock.calls[0][0].data).toMatchObject({
            question_count: 0,
            questions_by_type: {},
            paper_id: null,
        });
    });

    it('names the organiser who approved the exam', async () => {
        const approvedAt = new Date('2026-05-20T12:00:00Z');
        prisma.rounds.findUnique.mockResolvedValue(
            round({
                exam_status: 'live',
                approved_by: 'org-9',
                approved_at: approvedAt,
            })
        );
        prisma.users.findUnique.mockResolvedValue({ full_name: 'Dr Mokoena' });

        const { res } = await run(getExamStatus, req());

        expect(prisma.users.findUnique).toHaveBeenCalledWith({
            where: { id: 'org-9' },
            select: { full_name: true },
        });
        expect(res.json.mock.calls[0][0].data).toMatchObject({
            approved_by: 'org-9',
            approved_at: approvedAt,
            approved_by_name: 'Dr Mokoena',
        });
    });

    it('leaves the approver name empty if that user no longer exists', async () => {
        prisma.rounds.findUnique.mockResolvedValue(
            round({ approved_by: 'gone' })
        );
        prisma.users.findUnique.mockResolvedValue(null);
        const { res } = await run(getExamStatus, req());
        expect(res.json.mock.calls[0][0].data.approved_by_name).toBeNull();
    });
});

describe('PATCH /:roundId/exam-status', () => {
    const patch = (status) => req({ body: { status } });

    it.each([undefined, 'archived', 'LIVE'])(
        'rejects status %p before touching the database',
        async (status) => {
            const { next } = await run(updateExamStatus, patch(status));
            expect(next.mock.calls[0][0]).toMatchObject({
                statusCode: 400,
                message: 'status must be one of: draft, ready, live',
            });
            expect(prisma.rounds.findUnique).not.toHaveBeenCalled();
        }
    );

    it('rejects an unknown round', async () => {
        prisma.rounds.findUnique.mockResolvedValue(null);
        const { next } = await run(updateExamStatus, patch('ready'));
        expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 404 });
    });

    it("rejects an organiser who doesn't own the round", async () => {
        prisma.rounds.findUnique.mockResolvedValue(
            round({ olympiads: { organiser_id: 'org-2' } })
        );
        const { next } = await run(updateExamStatus, patch('ready'));
        expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
        expect(prisma.rounds.update).not.toHaveBeenCalled();
    });

    it.each([
        ['draft', 'ready'],
        ['ready', 'draft'],
        ['ready', 'live'],
    ])('allows %s → %s', async (from, to) => {
        prisma.rounds.findUnique.mockResolvedValue(
            round({ exam_status: from })
        );
        prisma.rounds.update.mockResolvedValue({ exam_status: to });

        const { res, next } = await run(updateExamStatus, patch(to));

        expect(next).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: { exam_status: to },
        });
    });

    it.each([
        ['draft', 'live'],
        ['draft', 'draft'],
        ['live', 'draft'],
        ['live', 'ready'],
    ])('rejects %s → %s', async (from, to) => {
        prisma.rounds.findUnique.mockResolvedValue(
            round({ exam_status: from })
        );
        const { next } = await run(updateExamStatus, patch(to));
        expect(next.mock.calls[0][0]).toMatchObject({
            statusCode: 400,
            message: `Cannot transition from ${from} to ${to}`,
        });
        expect(prisma.rounds.update).not.toHaveBeenCalled();
    });

    it.each([
        ['no paper', []],
        ['no questions', [{ id: 'paper-1', questions: [] }]],
    ])("won't mark an exam with %s as ready", async (_label, papers) => {
        prisma.rounds.findUnique.mockResolvedValue(round({ papers }));
        const { next } = await run(updateExamStatus, patch('ready'));
        expect(next.mock.calls[0][0]).toMatchObject({
            statusCode: 400,
            message: 'Cannot mark as ready — at least one question is required',
        });
    });

    it('records which organiser approved the exam when it goes live', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-05-20T12:00:00Z'));
        prisma.rounds.findUnique.mockResolvedValue(
            round({ exam_status: 'ready' })
        );
        prisma.rounds.update.mockResolvedValue({ exam_status: 'live' });

        await run(updateExamStatus, patch('live'));
        jest.useRealTimers();

        expect(prisma.rounds.update).toHaveBeenCalledWith({
            where: { id: 'round-1' },
            data: {
                exam_status: 'live',
                approved_by: 'org-1',
                approved_at: new Date('2026-05-20T12:00:00Z'),
            },
        });
    });

    it.each(['ready', 'draft'])(
        'clears any old approval when moving to %s',
        async (to) => {
            const from = to === 'ready' ? 'draft' : 'ready';
            prisma.rounds.findUnique.mockResolvedValue(
                round({ exam_status: from, approved_by: 'org-1' })
            );

            await run(updateExamStatus, patch(to));
            expect(prisma.rounds.update).toHaveBeenCalledWith({
                where: { id: 'round-1' },
                data: { exam_status: to, approved_by: null, approved_at: null },
            });
        }
    );
});
