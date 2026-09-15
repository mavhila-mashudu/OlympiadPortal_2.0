jest.mock("../../../src/config/database", () => ({
  __esModule: true,
  default: require("../helpers/prismaMock").prisma,
}));

const { prisma, resetPrismaMock } = require("../helpers/prismaMock");
const {
  autoMarkSubmission,
  autoMarkRoundInternal,
  autoMarkRound,
  markAnswer,
  generateResults,
  getMarkingQueue,
} = require("../../../src/services/markingService");

beforeEach(resetPrismaMock);

const organiserRound = (overrides = {}) => ({
  id: "round-1",
  state: "closed",
  qualifying_threshold: null,
  olympiads: { id: "oly-1", organiser_id: "org-1" },
  ...overrides,
});

// Shared ownership rules (organiser owns olympiad / educator's school registered)
// exercised through one public entry point: getMarkingQueue.
describe("round access checks", () => {
  it("rejects an unknown round", async () => {
    prisma.rounds.findUnique.mockResolvedValue(null);
    await expect(getMarkingQueue("round-x", "org-1", "organiser")).rejects.toMatchObject({
      statusCode: 404,
      message: "Round not found",
    });
  });

  it("rejects an organiser who doesn't own the olympiad", async () => {
    prisma.rounds.findUnique.mockResolvedValue(organiserRound());
    await expect(getMarkingQueue("round-1", "org-2", "organiser")).rejects.toMatchObject({
      statusCode: 403,
      message: "Not your round",
    });
  });

  it("rejects an educator with no educator profile", async () => {
    prisma.rounds.findUnique.mockResolvedValue(organiserRound());
    prisma.educators.findUnique.mockResolvedValue(null);
    await expect(getMarkingQueue("round-1", "edu-user", "educator")).rejects.toMatchObject({
      statusCode: 403,
      message: "Educator profile not found",
    });
  });

  it("rejects an educator whose school isn't registered for the olympiad", async () => {
    prisma.rounds.findUnique.mockResolvedValue(organiserRound());
    prisma.educators.findUnique.mockResolvedValue({ school_id: "school-1" });
    prisma.school_registrations.findFirst.mockResolvedValue(null);
    await expect(getMarkingQueue("round-1", "edu-user", "educator")).rejects.toMatchObject({
      statusCode: 403,
      message: "Your school is not registered for this olympiad",
    });
    expect(prisma.school_registrations.findFirst).toHaveBeenCalledWith({
      where: { school_id: "school-1", olympiad_id: "oly-1" },
    });
  });

  it("rejects any other role", async () => {
    prisma.rounds.findUnique.mockResolvedValue(organiserRound());
    await expect(getMarkingQueue("round-1", "stu", "student")).rejects.toMatchObject({
      statusCode: 403,
      message: "Insufficient permissions",
    });
  });
});

describe("autoMarkSubmission", () => {
  const answer = (id, question, answer_value, marked_at = null) => ({
    id,
    answer_value,
    marked_at,
    questions: question,
  });
  const mcq = { id: "q1", type: "mcq", correct_option: "0,1", negative_pct: 0, max_points: 4 };
  const tf = { id: "q2", type: "true_false", correct_option: "1", negative_pct: 0, max_points: 1 };
  const short = { id: "q3", type: "short_answer", correct_answer: "  Photosynthesis ", max_points: 2 };
  const essay = { id: "q4", type: "essay", max_points: 10 };

  const submissionWith = (answers) => ({
    id: "sub-1",
    round_id: "round-1",
    entrant_id: "ent-1",
    answers,
  });

  it("throws when the submission doesn't exist", async () => {
    prisma.submissions.findUnique.mockResolvedValue(null);
    await expect(autoMarkSubmission("missing")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("marks MCQ, True/False and short answers, and leaves essays alone", async () => {
    prisma.submissions.findUnique.mockResolvedValue(
      submissionWith([
        answer("a1", mcq, "0"),
        answer("a2", tf, "1"),
        answer("a3", short, "photosynthesis"),
        answer("a4", essay, "A long essay"),
      ]),
    );
    prisma.answers.findMany.mockResolvedValue([]);

    await autoMarkSubmission("sub-1");

    const updates = prisma.answers.update.mock.calls.map(([arg]) => arg);
    expect(updates).toEqual([
      { where: { id: "a1" }, data: { is_correct: false, points_awarded: 2, marked_at: expect.any(Date) } },
      { where: { id: "a2" }, data: { is_correct: true, points_awarded: 1, marked_at: expect.any(Date) } },
      { where: { id: "a3" }, data: { is_correct: true, points_awarded: 2, marked_at: expect.any(Date) } },
    ]);
  });

  it("marks a wrong short answer as zero and treats a blank answer as wrong", async () => {
    prisma.submissions.findUnique.mockResolvedValue(
      submissionWith([answer("a1", short, "osmosis"), answer("a2", short, null)]),
    );
    prisma.answers.findMany.mockResolvedValue([]);

    await autoMarkSubmission("sub-1");

    expect(prisma.answers.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "a1" }, data: expect.objectContaining({ is_correct: false, points_awarded: 0 }) }),
    );
    expect(prisma.answers.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "a2" }, data: expect.objectContaining({ is_correct: false, points_awarded: 0 }) }),
    );
  });

  it("skips answers that are already marked or have no question", async () => {
    prisma.submissions.findUnique.mockResolvedValue(
      submissionWith([answer("a1", mcq, "0,1", new Date()), answer("a2", null, "0")]),
    );
    prisma.answers.findMany.mockResolvedValue([]);

    await autoMarkSubmission("sub-1");
    expect(prisma.answers.update).not.toHaveBeenCalled();
  });

  it("recalculates the total from every answer and upserts the result", async () => {
    prisma.submissions.findUnique.mockResolvedValue(submissionWith([answer("a1", mcq, "0,1")]));
    prisma.answers.findMany.mockResolvedValue([
      { points_awarded: "4" },
      { points_awarded: 1.5 },
      { points_awarded: null },
    ]);

    await autoMarkSubmission("sub-1");

    expect(prisma.answers.findMany).toHaveBeenCalledWith({
      where: { submission_id: "sub-1" },
      select: { points_awarded: true },
    });
    expect(prisma.results.upsert).toHaveBeenCalledWith({
      where: { round_id_entrant_id: { round_id: "round-1", entrant_id: "ent-1" } },
      create: { round_id: "round-1", entrant_id: "ent-1", total_points: 5.5 },
      update: { total_points: 5.5 },
    });
  });

  it("sets status to automarked when every question could be auto-marked", async () => {
    prisma.submissions.findUnique.mockResolvedValue(submissionWith([answer("a1", mcq, "0")]));
    prisma.answers.findMany.mockResolvedValue([]);

    await expect(autoMarkSubmission("sub-1")).resolves.toEqual({
      submissionId: "sub-1",
      status: "processed",
    });
    expect(prisma.submissions.update).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: { status: "automarked" },
    });
  });

  it("queues the submission for manual marking when it contains an essay", async () => {
    prisma.submissions.findUnique.mockResolvedValue(
      submissionWith([answer("a1", mcq, "0"), answer("a2", essay, "text")]),
    );
    prisma.answers.findMany.mockResolvedValue([]);

    await autoMarkSubmission("sub-1");
    expect(prisma.submissions.update).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: { status: "queued_for_marking" },
    });
  });

  it("queues an MCQ with no correct option configured for manual marking", async () => {
    prisma.submissions.findUnique.mockResolvedValue(
      submissionWith([answer("a1", { ...mcq, correct_option: null }, "0")]),
    );
    prisma.answers.findMany.mockResolvedValue([]);

    await autoMarkSubmission("sub-1");
    expect(prisma.answers.update).not.toHaveBeenCalled();
    expect(prisma.submissions.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "queued_for_marking" } }),
    );
  });
});

describe("autoMarkRoundInternal", () => {
  it("marks every received submission and reports per-submission failures", async () => {
    prisma.submissions.findMany.mockResolvedValue([{ id: "sub-ok" }, { id: "sub-missing" }]);
    prisma.submissions.findUnique
      .mockResolvedValueOnce({ id: "sub-ok", round_id: "r", entrant_id: "e", answers: [] })
      .mockResolvedValueOnce(null);
    prisma.answers.findMany.mockResolvedValue([]);

    const result = await autoMarkRoundInternal("round-1");

    expect(prisma.submissions.findMany).toHaveBeenCalledWith({
      where: { round_id: "round-1", status: "received" },
      select: { id: true },
    });
    expect(result).toEqual({
      total: 2,
      processed: [
        { submissionId: "sub-ok", status: "processed" },
        { submissionId: "sub-missing", error: "Submission not found" },
      ],
    });
  });

  it("returns an empty report when nothing is pending", async () => {
    prisma.submissions.findMany.mockResolvedValue([]);
    await expect(autoMarkRoundInternal("round-1")).resolves.toEqual({ total: 0, processed: [] });
  });
});

describe("autoMarkRound", () => {
  it("marks all received submissions for the owning organiser", async () => {
    prisma.rounds.findUnique.mockResolvedValue(organiserRound());
    prisma.submissions.findMany.mockResolvedValue([]);

    await expect(autoMarkRound("round-1", "org-1", "organiser")).resolves.toEqual({
      total: 0,
      processed: [],
    });
    expect(prisma.submissions.findMany).toHaveBeenCalledWith({
      where: { round_id: "round-1", status: "received" },
      select: { id: true },
    });
  });

  it("limits an educator to their own school's submissions", async () => {
    prisma.rounds.findUnique.mockResolvedValue(organiserRound());
    prisma.educators.findUnique.mockResolvedValue({ school_id: "school-7" });
    prisma.school_registrations.findFirst.mockResolvedValue({ id: "reg" });
    prisma.submissions.findMany.mockResolvedValue([]);

    await autoMarkRound("round-1", "edu-user", "educator");
    expect(prisma.submissions.findMany).toHaveBeenCalledWith({
      where: { round_id: "round-1", status: "received", entrants: { school_id: "school-7" } },
      select: { id: true },
    });
  });

  it("records a failure for one submission without stopping the rest", async () => {
    prisma.rounds.findUnique.mockResolvedValue(organiserRound());
    prisma.submissions.findMany.mockResolvedValue([{ id: "sub-1" }, { id: "sub-2" }]);
    prisma.submissions.findUnique
      .mockRejectedValueOnce(new Error("db timeout"))
      .mockResolvedValueOnce({ id: "sub-2", round_id: "round-1", entrant_id: "ent-2", answers: [] });
    prisma.answers.findMany.mockResolvedValue([]);

    await expect(autoMarkRound("round-1", "org-1", "organiser")).resolves.toEqual({
      total: 2,
      processed: [
        { submissionId: "sub-1", error: "db timeout" },
        { submissionId: "sub-2", status: "processed" },
      ],
    });
  });
});

describe("markAnswer", () => {
  const storedAnswer = {
    id: "ans-1",
    submission_id: "sub-1",
    submissions: { id: "sub-1", round_id: "round-1", entrant_id: "ent-1" },
    questions: { max_points: "5" },
  };

  it("throws when the answer doesn't exist", async () => {
    prisma.answers.findUnique.mockResolvedValue(null);
    await expect(markAnswer("x", "marker", { is_correct: true, points_awarded: 1 })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("records the marker, the mark and the time", async () => {
    prisma.answers.findUnique.mockResolvedValue(storedAnswer);
    prisma.answers.findMany.mockResolvedValue([{ points_awarded: 3, marked_at: new Date() }]);

    const result = await markAnswer("ans-1", "marker-1", { is_correct: true, points_awarded: 3 });

    expect(result).toEqual({ answerId: "ans-1", is_correct: true, points_awarded: 3 });
    expect(prisma.answers.update).toHaveBeenCalledWith({
      where: { id: "ans-1" },
      data: { is_correct: true, points_awarded: 3, marked_by: "marker-1", marked_at: expect.any(Date) },
    });
  });

  it.each([
    [9, 5],
    [-2, 0],
  ])("clamps %p points into the 0..max range (%p)", async (given, expected) => {
    prisma.answers.findUnique.mockResolvedValue(storedAnswer);
    prisma.answers.findMany.mockResolvedValue([]);

    const result = await markAnswer("ans-1", "m", { is_correct: true, points_awarded: given });
    expect(result.points_awarded).toBe(expected);
  });

  it("recalculates the submission's result", async () => {
    prisma.answers.findUnique.mockResolvedValue(storedAnswer);
    prisma.answers.findMany.mockResolvedValue([{ points_awarded: 2, marked_at: new Date() }]);

    await markAnswer("ans-1", "m", { is_correct: true, points_awarded: 2 });
    expect(prisma.results.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { total_points: 2 } }),
    );
  });

  it("moves the submission to 'marked' once every answer is marked", async () => {
    prisma.answers.findUnique.mockResolvedValue(storedAnswer);
    prisma.answers.findMany.mockResolvedValue([{ marked_at: new Date() }, { marked_at: new Date() }]);

    await markAnswer("ans-1", "m", { is_correct: true, points_awarded: 2 });
    expect(prisma.submissions.update).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: { status: "marked" },
    });
  });

  it("leaves the status alone while other answers still need marking", async () => {
    prisma.answers.findUnique.mockResolvedValue(storedAnswer);
    prisma.answers.findMany.mockResolvedValue([{ marked_at: new Date() }, { marked_at: null }]);

    await markAnswer("ans-1", "m", { is_correct: true, points_awarded: 2 });
    expect(prisma.submissions.update).not.toHaveBeenCalled();
  });
});

describe("generateResults", () => {
  it("only lets organisers generate results", async () => {
    prisma.rounds.findUnique.mockResolvedValue(organiserRound());
    prisma.educators.findUnique.mockResolvedValue({ school_id: "s" });
    prisma.school_registrations.findFirst.mockResolvedValue({ id: "reg" });

    await expect(generateResults("round-1", "edu", "educator")).rejects.toMatchObject({
      statusCode: 403,
      message: "Only organisers can generate final results",
    });
  });

  it.each(["scheduled", "open"])("refuses while the round is %s", async (state) => {
    prisma.rounds.findUnique.mockResolvedValue(organiserRound({ state }));
    await expect(generateResults("round-1", "org-1", "organiser")).rejects.toMatchObject({
      statusCode: 400,
      message: `Cannot generate results — round is "${state}"`,
    });
  });

  it("refuses when there are no results", async () => {
    prisma.rounds.findUnique.mockResolvedValue(organiserRound());
    prisma.results.findMany.mockResolvedValue([]);
    await expect(generateResults("round-1", "org-1", "organiser")).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("ranks by points and qualifies entrants at or above the threshold", async () => {
    prisma.rounds.findUnique.mockResolvedValue(organiserRound({ qualifying_threshold: "50" }));
    prisma.results.findMany.mockResolvedValue([
      { id: "r-a", total_points: "80" },
      { id: "r-b", total_points: "50" },
      { id: "r-c", total_points: "49.5" },
    ]);

    const summary = await generateResults("round-1", "org-1", "organiser");

    expect(prisma.results.findMany).toHaveBeenCalledWith({
      where: { round_id: "round-1" },
      orderBy: { total_points: "desc" },
    });
    expect(prisma.results.update.mock.calls.map(([arg]) => arg)).toEqual([
      { where: { id: "r-a" }, data: { rank: 1, qualified: true, finalised_at: expect.any(Date) } },
      { where: { id: "r-b" }, data: { rank: 2, qualified: true, finalised_at: expect.any(Date) } },
      { where: { id: "r-c" }, data: { rank: 3, qualified: false, finalised_at: expect.any(Date) } },
    ]);
    expect(summary).toEqual({
      roundId: "round-1",
      entrantCount: 3,
      threshold: 50,
      state: "results_released",
    });
  });

  it("qualifies nobody when the round has no threshold", async () => {
    prisma.rounds.findUnique.mockResolvedValue(organiserRound({ qualifying_threshold: null }));
    prisma.results.findMany.mockResolvedValue([{ id: "r-a", total_points: 100 }]);

    const summary = await generateResults("round-1", "org-1", "organiser");
    expect(prisma.results.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ qualified: false }) }),
    );
    expect(summary.threshold).toBeNull();
  });

  it("releases the round and archives its papers", async () => {
    prisma.rounds.findUnique.mockResolvedValue(organiserRound({ state: "marking" }));
    prisma.results.findMany.mockResolvedValue([{ id: "r-a", total_points: 1 }]);

    await generateResults("round-1", "org-1", "organiser");
    expect(prisma.rounds.update).toHaveBeenCalledWith({
      where: { id: "round-1" },
      data: { state: "results_released" },
    });
    expect(prisma.papers.updateMany).toHaveBeenCalledWith({
      where: { round_id: "round-1" },
      data: { is_archived: true, released_at: expect.any(Date) },
    });
  });
});

describe("getMarkingQueue", () => {
  it("returns only submissions that still have unmarked answers", async () => {
    prisma.rounds.findUnique.mockResolvedValue(organiserRound());
    prisma.submissions.findMany.mockResolvedValue([
      { id: "s1", answers: [{ id: "a1" }] },
      { id: "s2", answers: [] },
    ]);

    await expect(getMarkingQueue("round-1", "org-1", "organiser")).resolves.toEqual([
      { id: "s1", answers: [{ id: "a1" }] },
    ]);
    expect(prisma.submissions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { round_id: "round-1", status: "queued_for_marking" } }),
    );
  });

  it("limits an educator to their own school", async () => {
    prisma.rounds.findUnique.mockResolvedValue(organiserRound());
    prisma.educators.findUnique.mockResolvedValue({ school_id: "school-3" });
    prisma.school_registrations.findFirst.mockResolvedValue({ id: "reg" });
    prisma.submissions.findMany.mockResolvedValue([]);

    await getMarkingQueue("round-1", "edu", "educator");
    expect(prisma.submissions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { round_id: "round-1", status: "queued_for_marking", entrants: { school_id: "school-3" } },
      }),
    );
  });
});
