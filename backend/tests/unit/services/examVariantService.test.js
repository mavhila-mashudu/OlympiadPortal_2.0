// A6/A7: per-entrant exam variants. The service issues each entrant a
// personal layout (question order + each question's option order), keeps
// layouts distinct while permutations remain, and translates the displayed
// answer indexes back to the canonical answer key for marking.
jest.mock('../../../src/config/database', () => ({
    __esModule: true,
    default: require('../helpers/prismaMock').prisma,
}));

const { prisma, resetPrismaMock } = require('../helpers/prismaMock');
const {
    getAssignment,
    canonicalizeAnswer,
} = require('../../../src/services/examVariantService');

const questions = [
    { id: 'q1', options: ['2', '4', '5'] },
    { id: 'q2', options: ['True', 'False'] },
    { id: 'q3', options: null },
];

const stored = (overrides = {}) => ({
    id: 'assign-1',
    round_id: 'round-1',
    entrant_id: 'ent-1',
    question_order: ['q1', 'q2', 'q3'],
    option_orders: { q1: [0, 1, 2], q2: [0, 1], q3: [] },
    variant_hash: 'hash-1',
    ...overrides,
});

const uniqueViolation = () =>
    Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

beforeEach(() => {
    resetPrismaMock();
    prisma.exam_assignments.findUnique.mockResolvedValue(null);
    prisma.exam_assignments.count.mockResolvedValue(0);
});

describe('getAssignment', () => {
    it('reuses the layout already issued to the entrant', async () => {
        const existing = stored();
        prisma.exam_assignments.findUnique.mockResolvedValue(existing);

        await expect(
            getAssignment('round-1', 'ent-1', questions)
        ).resolves.toBe(existing);

        expect(prisma.exam_assignments.findUnique).toHaveBeenCalledWith({
            where: {
                round_id_entrant_id: {
                    round_id: 'round-1',
                    entrant_id: 'ent-1',
                },
            },
        });
        expect(prisma.exam_assignments.count).not.toHaveBeenCalled();
        expect(prisma.exam_assignments.create).not.toHaveBeenCalled();
    });

    it('issues a fresh layout and records the assignment in the round timeline', async () => {
        const created = stored({ variant_hash: 'hash-new' });
        prisma.exam_assignments.create.mockResolvedValue(created);

        const result = await getAssignment('round-1', 'ent-1', questions);

        expect(result).toBe(created);
        const data = prisma.exam_assignments.create.mock.calls[0][0].data;
        expect(data.round_id).toBe('round-1');
        expect(data.entrant_id).toBe('ent-1');
        // The layout is random, but it must be a permutation of the paper.
        expect([...data.question_order].sort()).toEqual(['q1', 'q2', 'q3']);
        expect(data.option_orders.q1).toEqual(
            expect.arrayContaining([0, 1, 2])
        );
        expect(data.option_orders.q3).toEqual([]);
        expect(data.variant_hash).toEqual(expect.any(String));
        expect(prisma.round_events.createMany).toHaveBeenCalledWith({
            data: [
                expect.objectContaining({
                    round_id: 'round-1',
                    kind: 'exam_variant_assigned',
                    origin: 'automatic',
                    event_key: 'exam-variant:assign-1',
                    details: { entrant_id: 'ent-1', variant_hash: 'hash-new' },
                }),
            ],
            skipDuplicates: true,
        });
    });

    it('tries again when a candidate layout is already taken by another entrant', async () => {
        prisma.exam_assignments.findUnique
            .mockResolvedValueOnce(null) // nothing issued to this entrant yet
            .mockResolvedValueOnce({ id: 'taken' }) // first candidate clashes
            .mockResolvedValueOnce(null); // second candidate is free
        prisma.exam_assignments.create.mockResolvedValue(stored());

        await getAssignment('round-1', 'ent-1', questions);

        expect(prisma.exam_assignments.findUnique).toHaveBeenCalledTimes(3);
        expect(prisma.exam_assignments.create).toHaveBeenCalledTimes(1);
    });

    it('allows a repeated layout once every distinct permutation is in use', async () => {
        // 3 questions (3! orders) x 3- and 2-option shuffles = 72 layouts
        prisma.exam_assignments.count.mockResolvedValue(72);
        prisma.exam_assignments.create.mockResolvedValue(
            stored({ variant_hash: null })
        );

        await getAssignment('round-1', 'ent-1', questions);

        // Only the entrant lookup happens — no duplicate-layout check is needed.
        expect(prisma.exam_assignments.findUnique).toHaveBeenCalledTimes(1);
        expect(prisma.exam_assignments.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                round_id: 'round-1',
                entrant_id: 'ent-1',
                variant_hash: null,
            }),
        });
    });

    it("resumes the winner's row when two starts race on one entrant", async () => {
        const winner = stored({ id: 'assign-winner' });
        prisma.exam_assignments.findUnique
            .mockResolvedValueOnce(null) // nothing issued yet
            .mockResolvedValueOnce(null) // candidate layout is free
            .mockResolvedValueOnce(winner); // the race winner, after the clash
        prisma.exam_assignments.create.mockRejectedValue(uniqueViolation());

        await expect(
            getAssignment('round-1', 'ent-1', questions)
        ).resolves.toBe(winner);
    });
});

describe('canonicalizeAnswer', () => {
    const assignment = { option_orders: { q1: [2, 0, 1], q2: [1, 0], q3: [] } };

    it('maps displayed option indexes back to the canonical answer key', () => {
        expect(canonicalizeAnswer('0,1', assignment, 'q1')).toBe('2,0');
        expect(canonicalizeAnswer('1', assignment, 'q2')).toBe('0');
    });

    it('passes answers through when no variant is linked', () => {
        expect(canonicalizeAnswer('0,1', null, 'q1')).toBe('0,1');
        expect(canonicalizeAnswer('0', { option_orders: {} }, 'q1')).toBe('0');
        expect(canonicalizeAnswer('0', assignment, 'q9')).toBe('0');
    });

    it('skips blank entries but leaves unknown values untouched', () => {
        expect(canonicalizeAnswer(' 0 , , 1 ', assignment, 'q1')).toBe('2,0');
        expect(canonicalizeAnswer('0,5', assignment, 'q1')).toBe('0,5');
        expect(canonicalizeAnswer('abc', assignment, 'q1')).toBe('abc');
    });

    it('leaves blank answers blank', () => {
        expect(canonicalizeAnswer(null, assignment, 'q1')).toBe(null);
        expect(canonicalizeAnswer('', assignment, 'q1')).toBe('');
    });
});
