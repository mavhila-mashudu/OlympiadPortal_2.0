jest.mock("../../../src/config/database", () => ({
  __esModule: true,
  default: require("../helpers/prismaMock").prisma,
}));

const { prisma, resetPrismaMock } = require("../helpers/prismaMock");
const { MIN_ANSWERS, answerStats, describeDifficulty } = require("../../../src/services/questionDifficulty");

beforeEach(resetPrismaMock);

describe("describeDifficulty", () => {
  it("is 1 − average score ÷ max points", () => {
    // 10 answers earning 25 of a possible 40 marks: 62.5% average
    expect(describeDifficulty([{ maxPoints: "4", points: 25, answered: 10 }]))
      .toEqual({ value: 0.38, band: "medium", answered: 10 });
  });

  it.each([
    [0.9, 0.1, "easy"],
    [0.71, 0.29, "easy"],
    [0.7, 0.3, "medium"],
    [0.3, 0.7, "medium"],
    [0.29, 0.71, "hard"],
    [0, 1, "hard"],
  ])("puts an average of %s of the marks at %s, %s", (average, value, band) => {
    const answered = 100;
    expect(describeDifficulty([{ maxPoints: 1, points: average * answered, answered }]))
      .toEqual({ value, band, answered });
  });

  it(`needs at least ${MIN_ANSWERS} marked answers`, () => {
    expect(describeDifficulty([{ maxPoints: 2, points: 0, answered: MIN_ANSWERS - 1 }]))
      .toEqual({ value: null, band: null, answered: MIN_ANSWERS - 1 });
    expect(describeDifficulty([])).toEqual({ value: null, band: null, answered: 0 });
  });

  it("keeps the value between 0 and 1 when negative marking takes the average below zero", () => {
    expect(describeDifficulty([{ maxPoints: 4, points: -6, answered: 5 }]))
      .toEqual({ value: 1, band: "hard", answered: 5 });
  });

  it("pools versions of a question, weighing each answer against its own version's marks", () => {
    // 3 answers on a 2-mark version earning 6 (all correct), 3 on a 4-mark
    // version earning 0: half the marks on average
    expect(describeDifficulty([
      { maxPoints: 2, points: 6, answered: 3 },
      { maxPoints: 4, points: 0, answered: 3 },
    ])).toEqual({ value: 0.5, band: "medium", answered: 6 });
  });

  it("ignores versions with no answers or no marks available", () => {
    expect(describeDifficulty([
      { maxPoints: 2, points: 10, answered: 5 },
      { maxPoints: 2, points: 0, answered: 0 },
      { maxPoints: 0, points: 0, answered: 4 },
    ])).toEqual({ value: 0, band: "easy", answered: 5 });
  });
});

describe("answerStats", () => {
  it("totals each question's marked answers", async () => {
    prisma.answers.groupBy.mockResolvedValue([
      { question_id: "q-1", _sum: { points_awarded: "7.5" }, _count: { _all: 3 } },
      { question_id: "q-2", _sum: { points_awarded: null }, _count: { _all: 0 } },
    ]);

    const stats = await answerStats(["q-1", "q-2"]);

    expect(stats.get("q-1")).toEqual({ points: 7.5, answered: 3 });
    expect(stats.get("q-2")).toEqual({ points: 0, answered: 0 });
    expect(prisma.answers.groupBy).toHaveBeenCalledWith({
      by: ["question_id"],
      where: { question_id: { in: ["q-1", "q-2"] }, points_awarded: { not: null } },
      _sum: { points_awarded: true },
      _count: { _all: true },
    });
  });

  it("doesn't query for no questions", async () => {
    await expect(answerStats([])).resolves.toEqual(new Map());
    expect(prisma.answers.groupBy).not.toHaveBeenCalled();
  });
});
