// In-memory stand-in for the Prisma client so unit tests never touch a
// database. Every model method is a jest.fn(); tests program the return
// values they need.
//
// Usage in a test file:
//   jest.mock("../../../src/config/database", () => ({
//     __esModule: true,
//     default: require("../helpers/prismaMock").prisma,
//   }));
//   const { prisma, resetPrismaMock } = require("../helpers/prismaMock");
//   beforeEach(resetPrismaMock);

const MODELS = [
    'users',
    'olympiad_invites',
    'schools',
    'school_memberships',
    'educators',
    'entrants',
    'olympiads',
    'notification_rules',
    'sent_notifications',
    'portal_notifications',
    'round_events',
    'submission_deadline_decisions',
    'remark_requests',
    'marking_reviews',
    'school_registrations',
    'rounds',
    'papers',
    'questions',
    'answers',
    'submissions',
    'exam_assignments',
    'entrant_registrations',
    'results',
];

const METHODS = [
    'findUnique',
    'findFirst',
    'findMany',
    'create',
    'createMany',
    'update',
    'updateMany',
    'upsert',
    'delete',
    'deleteMany',
    'count',
    'groupBy',
    'aggregate',
];

const prisma = { $transaction: jest.fn(), $queryRaw: jest.fn() };
for (const model of MODELS) {
    prisma[model] = {};
    for (const method of METHODS) prisma[model][method] = jest.fn();
}

const resetPrismaMock = () => {
    for (const model of MODELS) {
        for (const method of METHODS) prisma[model][method].mockReset();
    }
    prisma.$transaction.mockReset();
    // Interactive transactions receive the same mock as their `tx`, so a
    // test can assert on prisma.<model>.<method> regardless of whether the
    // service used the client directly or inside a transaction.
    prisma.$transaction.mockImplementation(async (arg) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg)
    );
    // Raw row locks (SELECT … FOR UPDATE) find their row unless a test says not
    prisma.$queryRaw.mockReset();
    prisma.$queryRaw.mockResolvedValue([{ id: 'locked' }]);
};

resetPrismaMock();

module.exports = { prisma, resetPrismaMock };
