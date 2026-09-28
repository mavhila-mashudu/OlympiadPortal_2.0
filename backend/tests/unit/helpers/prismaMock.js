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
  "users",
  "invitations",
  "schools",
  "school_memberships",
  "educators",
  "entrants",
  "olympiads",
  "notification_rules",
  "sent_notifications",
  "school_registrations",
  "rounds",
  "papers",
  "questions",
  "answers",
  "submissions",
  "entrant_registrations",
  "results",
];

const METHODS = [
  "findUnique",
  "findFirst",
  "findMany",
  "create",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
  "count",
];

const prisma = { $transaction: jest.fn() };
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
    typeof arg === "function" ? arg(prisma) : Promise.all(arg),
  );
};

resetPrismaMock();

module.exports = { prisma, resetPrismaMock };
