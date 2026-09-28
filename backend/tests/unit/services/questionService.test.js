jest.mock("../../../src/config/database", () => ({
  __esModule: true,
  default: require("../helpers/prismaMock").prisma,
}));

const { prisma, resetPrismaMock } = require("../helpers/prismaMock");
const questionService = require("../../../src/services/questionService");
const {
  assertRoundAccess,
  createQuestion,
  listQuestions,
  updateQuestion,
  deleteQuestion,
} = questionService;

beforeEach(resetPrismaMock);

const round = (overrides = {}) => ({
  id: "round-1",
  name: "Round 1",
  exam_status: "draft",
  olympiads: { id: "oly-1", organiser_id: "org-1" },
  ...overrides,
});

const questionIn = (roundOverrides = {}) => ({
  id: "q-1",
  papers: { rounds: round(roundOverrides) },
});

const allowEducator = () => {
  prisma.educators.findUnique.mockResolvedValue({ school_id: "school-1" });
  prisma.school_registrations.findFirst.mockResolvedValue({ id: "reg" });
};

describe("assertRoundAccess", () => {
  it("is exported, because paperService relies on it", () => {
    // Regression: paperService imported this before it was exported, so the
    // paper/memo viewer endpoint crashed with "is not a function".
    expect(typeof questionService.assertRoundAccess).toBe("function");
  });

  it("rejects an unknown round", async () => {
    prisma.rounds.findUnique.mockResolvedValue(null);
    await expect(assertRoundAccess("x", "org-1", "organiser")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns the round to its owning organiser", async () => {
    prisma.rounds.findUnique.mockResolvedValue(round());
    await expect(assertRoundAccess("round-1", "org-1", "organiser")).resolves.toMatchObject({ id: "round-1" });
  });

  it("rejects an organiser who doesn't own the olympiad", async () => {
    prisma.rounds.findUnique.mockResolvedValue(round());
    await expect(assertRoundAccess("round-1", "org-2", "organiser")).rejects.toMatchObject({
      statusCode: 403,
      message: "Not your round",
    });
  });

  it("allows an educator whose school is registered", async () => {
    prisma.rounds.findUnique.mockResolvedValue(round());
    allowEducator();
    await expect(assertRoundAccess("round-1", "edu", "educator")).resolves.toMatchObject({ id: "round-1" });
    expect(prisma.school_registrations.findFirst).toHaveBeenCalledWith({
      where: { school_id: "school-1", olympiad_id: "oly-1" },
    });
  });

  it("rejects an educator without a profile", async () => {
    prisma.rounds.findUnique.mockResolvedValue(round());
    prisma.educators.findUnique.mockResolvedValue(null);
    await expect(assertRoundAccess("round-1", "edu", "educator")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects an educator whose school isn't registered", async () => {
    prisma.rounds.findUnique.mockResolvedValue(round());
    prisma.educators.findUnique.mockResolvedValue({ school_id: "school-1" });
    prisma.school_registrations.findFirst.mockResolvedValue(null);
    await expect(assertRoundAccess("round-1", "edu", "educator")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects any other role", async () => {
    prisma.rounds.findUnique.mockResolvedValue(round());
    await expect(assertRoundAccess("round-1", "s", "student")).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("createQuestion", () => {
  const data = { type: "mcq", prompt: "2 + 2?", options: ["3", "4"], correct_option: "1" };

  it("only allows adding questions while the exam is a draft", async () => {
    prisma.rounds.findUnique.mockResolvedValue(round({ exam_status: "ready" }));
    await expect(createQuestion("round-1", "org-1", "organiser", data)).rejects.toMatchObject({
      statusCode: 400,
      message: "Questions can only be added while the exam is in draft status",
    });
  });

  it("adds the question to the round's existing paper", async () => {
    prisma.rounds.findUnique.mockResolvedValue(round());
    prisma.papers.findFirst.mockResolvedValue({ id: "paper-1" });
    prisma.questions.create.mockResolvedValue({ id: "q-new" });

    await expect(createQuestion("round-1", "org-1", "organiser", data)).resolves.toEqual({ id: "q-new" });
    expect(prisma.papers.create).not.toHaveBeenCalled();
    expect(prisma.questions.create).toHaveBeenCalledWith({
      data: {
        paper_id: "paper-1",
        type: "mcq",
        prompt: "2 + 2?",
        options: ["3", "4"],
        correct_option: "1",
        correct_answer: undefined,
        negative_pct: 0,
        max_points: 1,
      },
    });
  });

  it("creates a paper named after the round when none exists yet", async () => {
    prisma.rounds.findUnique
      .mockResolvedValueOnce(round())
      .mockResolvedValueOnce({ name: "Round 1" });
    prisma.papers.findFirst.mockResolvedValue(null);
    prisma.papers.create.mockResolvedValue({ id: "paper-new" });

    await createQuestion("round-1", "org-1", "organiser", data);
    expect(prisma.papers.create).toHaveBeenCalledWith({ data: { round_id: "round-1", title: "Round 1" } });
    expect(prisma.questions.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paper_id: "paper-new" }) }),
    );
  });

  it("keeps explicit negative marking and points", async () => {
    prisma.rounds.findUnique.mockResolvedValue(round());
    allowEducator();
    prisma.papers.findFirst.mockResolvedValue({ id: "paper-1" });

    await createQuestion("round-1", "edu", "educator", { ...data, negative_pct: 25, max_points: 4 });
    expect(prisma.questions.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ negative_pct: 25, max_points: 4 }) }),
    );
  });
});

describe("listQuestions", () => {
  it("returns the paper's questions in creation order, each with its difficulty for the organiser", async () => {
    prisma.rounds.findUnique.mockResolvedValue(round());
    prisma.papers.findFirst.mockResolvedValue({ questions: [{ id: "q-1", max_points: "4" }, { id: "q-2", max_points: "2" }] });
    prisma.answers.groupBy.mockResolvedValue([
      { question_id: "q-1", _sum: { points_awarded: "4" }, _count: { _all: 5 } },
    ]);

    await expect(listQuestions("round-1", "org-1", "organiser")).resolves.toEqual([
      { id: "q-1", max_points: "4", difficulty: { value: 0.8, band: "hard", answered: 5 } },
      { id: "q-2", max_points: "2", difficulty: { value: null, band: null, answered: 0 } },
    ]);
    expect(prisma.papers.findFirst).toHaveBeenCalledWith({
      where: { round_id: "round-1" },
      include: { questions: { orderBy: { created_at: "asc" } } },
    });
  });

  it("gives an educator the questions without their difficulty", async () => {
    prisma.rounds.findUnique.mockResolvedValue(round());
    prisma.educators.findUnique.mockResolvedValue({ school_id: "school-1" });
    prisma.school_registrations.findFirst.mockResolvedValue({ id: "reg-1" });
    prisma.papers.findFirst.mockResolvedValue({ questions: [{ id: "q-1", max_points: "4" }] });

    await expect(listQuestions("round-1", "edu-1", "educator")).resolves.toEqual([{ id: "q-1", max_points: "4" }]);
    expect(prisma.answers.groupBy).not.toHaveBeenCalled();
  });

  it("returns an empty list when the round has no paper", async () => {
    prisma.rounds.findUnique.mockResolvedValue(round());
    prisma.papers.findFirst.mockResolvedValue(null);
    await expect(listQuestions("round-1", "org-1", "organiser")).resolves.toEqual([]);
  });
});

describe("updateQuestion", () => {
  it("rejects an unknown question", async () => {
    prisma.questions.findUnique.mockResolvedValue(null);
    await expect(updateQuestion("x", "org-1", "organiser", {})).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects an organiser who doesn't own the question", async () => {
    prisma.questions.findUnique.mockResolvedValue(questionIn());
    await expect(updateQuestion("q-1", "org-2", "organiser", {})).rejects.toMatchObject({
      message: "Not your question",
    });
  });

  it("updates only the fields that were provided", async () => {
    prisma.questions.findUnique.mockResolvedValue(questionIn());
    prisma.questions.update.mockResolvedValue({ id: "q-1" });

    await updateQuestion("q-1", "org-1", "organiser", {
      prompt: "New prompt",
      correct_option: "0,2",
      max_points: undefined,
    });
    expect(prisma.questions.update).toHaveBeenCalledWith({
      where: { id: "q-1" },
      data: { prompt: "New prompt", correct_option: "0,2" },
    });
  });

  it("passes every editable field through", async () => {
    prisma.questions.findUnique.mockResolvedValue(questionIn());
    const all = {
      type: "short_answer",
      prompt: "p",
      options: null,
      correct_option: null,
      correct_answer: "42",
      negative_pct: 0,
      max_points: 2,
    };
    await updateQuestion("q-1", "org-1", "organiser", all);
    expect(prisma.questions.update).toHaveBeenCalledWith({ where: { id: "q-1" }, data: all });
  });

  it("rejects an educator without a profile", async () => {
    prisma.questions.findUnique.mockResolvedValue(questionIn());
    prisma.educators.findUnique.mockResolvedValue(null);
    await expect(updateQuestion("q-1", "edu", "educator", {})).rejects.toMatchObject({
      statusCode: 403,
      message: "Educator profile not found",
    });
  });

  it("rejects an educator whose school isn't registered for the olympiad", async () => {
    prisma.questions.findUnique.mockResolvedValue(questionIn());
    prisma.educators.findUnique.mockResolvedValue({ school_id: "school-1" });
    prisma.school_registrations.findFirst.mockResolvedValue(null);
    await expect(updateQuestion("q-1", "edu", "educator", {})).rejects.toMatchObject({
      statusCode: 403,
      message: "Your school is not registered for this olympiad",
    });
    expect(prisma.questions.update).not.toHaveBeenCalled();
  });

  it("rejects any other role", async () => {
    prisma.questions.findUnique.mockResolvedValue(questionIn());
    await expect(updateQuestion("q-1", "s", "student", {})).rejects.toMatchObject({
      statusCode: 403,
      message: "Insufficient permissions",
    });
  });

  it("lets an educator edit a draft exam", async () => {
    prisma.questions.findUnique.mockResolvedValue(questionIn());
    allowEducator();
    await expect(updateQuestion("q-1", "edu", "educator", { prompt: "p" })).resolves.toBeUndefined();
    expect(prisma.questions.update).toHaveBeenCalled();
  });

  it("lets the organiser correct answers while the exam awaits verification", async () => {
    prisma.questions.findUnique.mockResolvedValue(questionIn({ exam_status: "ready" }));
    await updateQuestion("q-1", "org-1", "organiser", { correct_option: "1" });
    expect(prisma.questions.update).toHaveBeenCalled();
  });

  it("stops an educator editing once the exam has left draft", async () => {
    prisma.questions.findUnique.mockResolvedValue(questionIn({ exam_status: "ready" }));
    allowEducator();
    await expect(updateQuestion("q-1", "edu", "educator", { prompt: "p" })).rejects.toMatchObject({
      statusCode: 400,
      message: "Questions can only be edited while the exam is in draft status",
    });
  });

  it("locks questions for the organiser once the exam is live", async () => {
    prisma.questions.findUnique.mockResolvedValue(questionIn({ exam_status: "live" }));
    await expect(updateQuestion("q-1", "org-1", "organiser", { prompt: "p" })).rejects.toMatchObject({
      statusCode: 400,
      message: "Questions are locked once the exam is live",
    });
    expect(prisma.questions.update).not.toHaveBeenCalled();
  });
});

describe("the round named in the request", () => {
  it.each([
    ["updating", () => updateQuestion("q-1", "org-1", "organiser", { prompt: "x" }, "round-2")],
    ["deleting", () => deleteQuestion("q-1", "org-1", "organiser", "round-2")],
  ])("reports a question from another round as not found when %s", async (_label, act) => {
    prisma.questions.findUnique.mockResolvedValue(questionIn());
    await expect(act()).rejects.toMatchObject({ statusCode: 404, message: "Question not found" });
    expect(prisma.questions.update).not.toHaveBeenCalled();
    expect(prisma.questions.delete).not.toHaveBeenCalled();
  });

  it("accepts the question's own round", async () => {
    prisma.questions.findUnique.mockResolvedValue(questionIn());
    await deleteQuestion("q-1", "org-1", "organiser", "round-1");
    expect(prisma.questions.delete).toHaveBeenCalled();
  });
});

describe("deleteQuestion", () => {
  it("deletes a question from a draft exam", async () => {
    prisma.questions.findUnique.mockResolvedValue(questionIn());
    await deleteQuestion("q-1", "org-1", "organiser");
    expect(prisma.questions.delete).toHaveBeenCalledWith({ where: { id: "q-1" } });
  });

  it.each(["ready", "live"])("refuses once the exam is %s", async (exam_status) => {
    prisma.questions.findUnique.mockResolvedValue(questionIn({ exam_status }));
    await expect(deleteQuestion("q-1", "org-1", "organiser")).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.questions.delete).not.toHaveBeenCalled();
  });
});
