// The exam-sitting handlers live inside the route file. They are called
// directly here (no HTTP server); the auth middleware in front of them is
// covered by middlewares/auth.test.js.
jest.mock("../../../src/config/database", () => ({
  __esModule: true,
  default: require("../helpers/prismaMock").prisma,
}));
jest.mock("../../../src/config/supabase", () => ({ auth: { getUser: jest.fn() } }));

const { prisma, resetPrismaMock } = require("../helpers/prismaMock");
const router = require("../../../src/routes/studentExam");
const { mockReq, getRouteHandler, run } = require("../helpers/http");

const getExam = getRouteHandler(router, "get", "/:roundId/exam");
const startExam = getRouteHandler(router, "post", "/:roundId/exam/start");
const saveAnswer = getRouteHandler(router, "patch", "/:roundId/exam/answers/:qid");
const submitExam = getRouteHandler(router, "post", "/:roundId/exam/submit");

const student = { userId: "stu-1", role: "student", entrant: { id: "ent-1" } };
const studentReq = (extra = {}) => mockReq({ user: student, params: { roundId: "round-1" }, ...extra });

const questions = [
  { id: "q1", type: "mcq", prompt: "Pick primes", options: ["2", "4", "5"], correct_option: "0,2", correct_answer: null, negative_pct: "25", max_points: "4" },
  { id: "q2", type: "true_false", prompt: "The sky is green", options: ["True", "False"], correct_option: "1", correct_answer: null, negative_pct: null, max_points: 1 },
  { id: "q3", type: "essay", prompt: "Explain", options: null, correct_option: null, correct_answer: null, negative_pct: 0, max_points: 10 },
];

const sittableRound = (overrides = {}) => ({
  id: "round-1",
  name: "Round 1",
  state: "open",
  exam_status: "live",
  opens_at: new Date("2026-06-01T08:00:00Z"),
  closes_at: new Date("2026-06-01T10:00:00Z"),
  papers: [{ id: "paper-1", questions }],
  ...overrides,
});

const expectError = (next, statusCode, message) => {
  expect(next).toHaveBeenCalledTimes(1);
  expect(next.mock.calls[0][0]).toMatchObject(message ? { statusCode, message } : { statusCode });
};

beforeEach(resetPrismaMock);

describe("sitting guards (GET exam and POST start)", () => {
  describe.each([
    ["getExam", getExam],
    ["startExam", startExam],
  ])("%s", (_name, handler) => {
    it("rejects a user with no entrant profile", async () => {
      const { next } = await run(handler, studentReq({ user: { ...student, entrant: null } }));
      expectError(next, 403, "No entrant profile linked to your account");
      expect(prisma.rounds.findUnique).not.toHaveBeenCalled();
    });

    it("rejects an unknown round", async () => {
      prisma.rounds.findUnique.mockResolvedValue(null);
      expectError((await run(handler, studentReq())).next, 404, "Round not found");
    });

    it("rejects a round that isn't open", async () => {
      prisma.rounds.findUnique.mockResolvedValue(sittableRound({ state: "closed" }));
      expectError((await run(handler, studentReq())).next, 400, "Round is not open (state: closed)");
    });

    it("rejects an exam that isn't live yet", async () => {
      prisma.rounds.findUnique.mockResolvedValue(sittableRound({ exam_status: "ready" }));
      expectError((await run(handler, studentReq())).next, 400, "This exam is not available for sitting");
    });

    it("rejects a student who isn't registered for the round", async () => {
      prisma.rounds.findUnique.mockResolvedValue(sittableRound());
      prisma.entrant_registrations.findFirst.mockResolvedValue(null);

      const { next } = await run(handler, studentReq());
      expectError(next, 403, "You are not registered for this round");
      expect(prisma.entrant_registrations.findFirst).toHaveBeenCalledWith({
        where: { entrant_id: "ent-1", round_id: "round-1" },
      });
    });
  });
});

describe("GET /:roundId/exam", () => {
  beforeEach(() => {
    prisma.rounds.findUnique.mockResolvedValue(sittableRound());
    prisma.entrant_registrations.findFirst.mockResolvedValue({ id: "reg" });
  });

  it("never sends the correct answers to the student", async () => {
    prisma.submissions.findFirst.mockResolvedValue(null);

    const { res } = await run(getExam, studentReq());
    const { questions: sent } = res.json.mock.calls[0][0].data;

    for (const q of sent) {
      expect(q).not.toHaveProperty("correct_option");
      expect(q).not.toHaveProperty("correct_answer");
    }
  });

  it("tells the UI which questions allow several answers and their penalty", async () => {
    prisma.submissions.findFirst.mockResolvedValue(null);

    const { res } = await run(getExam, studentReq());
    expect(res.json.mock.calls[0][0].data.questions).toEqual([
      { id: "q1", type: "mcq", prompt: "Pick primes", options: ["2", "4", "5"], max_points: "4", multi_select: true, negative_pct: 25 },
      { id: "q2", type: "true_false", prompt: "The sky is green", options: ["True", "False"], max_points: 1, multi_select: false, negative_pct: 0 },
      { id: "q3", type: "essay", prompt: "Explain", options: null, max_points: 10, multi_select: false, negative_pct: 0 },
    ]);
  });

  it("returns round info, total points and the server clock", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-06-01T09:15:00Z"));
    prisma.submissions.findFirst.mockResolvedValue(null);

    const { res, next } = await run(getExam, studentReq());
    jest.useRealTimers();

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        round: {
          id: "round-1",
          name: "Round 1",
          opens_at: new Date("2026-06-01T08:00:00Z"),
          closes_at: new Date("2026-06-01T10:00:00Z"),
          state: "open",
        },
        total_points: 15,
        server_time: "2026-06-01T09:15:00.000Z",
        submission: null,
      }),
    });
  });

  it("includes the student's existing online attempt so they can resume", async () => {
    prisma.submissions.findFirst.mockResolvedValue({
      id: "sub-1",
      status: "received",
      answers: [{ id: "a1", question_id: "q1", answer_value: "0" }],
    });

    const { res } = await run(getExam, studentReq());
    expect(prisma.submissions.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { round_id: "round-1", entrant_id: "ent-1", route: "online" } }),
    );
    expect(res.json.mock.calls[0][0].data.submission).toEqual({
      id: "sub-1",
      status: "received",
      answers: [{ id: "a1", question_id: "q1", answer_value: "0" }],
    });
  });

  it("returns no questions for a round without a paper", async () => {
    prisma.rounds.findUnique.mockResolvedValue(sittableRound({ papers: [] }));
    prisma.submissions.findFirst.mockResolvedValue(null);

    const { res } = await run(getExam, studentReq());
    expect(res.json.mock.calls[0][0].data).toMatchObject({ questions: [], total_points: 0 });
  });
});

describe("POST /:roundId/exam/start", () => {
  beforeEach(() => {
    prisma.rounds.findUnique.mockResolvedValue(sittableRound());
    prisma.entrant_registrations.findFirst.mockResolvedValue({ id: "reg" });
  });

  it.each([
    ["no paper", []],
    ["a paper with no questions", [{ id: "paper-1", questions: [] }]],
  ])("refuses to start a round with %s", async (_label, papers) => {
    prisma.rounds.findUnique.mockResolvedValue(sittableRound({ papers }));
    expectError((await run(startExam, studentReq())).next, 400, "No questions available for this exam");
  });

  it("resumes an attempt that hasn't been submitted", async () => {
    const existing = { id: "sub-1", status: "received", answers: [{ id: "a1", question_id: "q1", answer_value: "2" }] };
    prisma.submissions.findFirst.mockResolvedValue(existing);

    const { res } = await run(startExam, studentReq());

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { submission: existing } });
    expect(prisma.submissions.create).not.toHaveBeenCalled();
  });

  it("won't restart an exam that was already submitted", async () => {
    prisma.submissions.findFirst.mockResolvedValue({ id: "sub-1", status: "automarked", answers: [] });
    expectError((await run(startExam, studentReq())).next, 400, "This exam has already been submitted");
    expect(prisma.submissions.create).not.toHaveBeenCalled();
  });

  it("won't start when the school already captured the learner's answers on paper", async () => {
    prisma.submissions.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "sub-offline" });
    expectError((await run(startExam, studentReq())).next, 409, "Your school has already submitted your results for this round");
    expect(prisma.submissions.findFirst).toHaveBeenLastCalledWith({
      where: { round_id: "round-1", entrant_id: "ent-1", route: "offline" },
      select: { id: true },
    });
    expect(prisma.submissions.create).not.toHaveBeenCalled();
  });

  it("creates an online submission with an empty answer for every question", async () => {
    prisma.submissions.findFirst.mockResolvedValue(null);
    prisma.submissions.create.mockResolvedValue({ id: "sub-new", status: "received" });
    prisma.answers.create.mockImplementation(async ({ data }) => ({ id: `ans-${data.question_id}` }));

    const { res } = await run(startExam, studentReq());

    expect(prisma.submissions.create).toHaveBeenCalledWith({
      data: {
        round_id: "round-1",
        entrant_id: "ent-1",
        submitted_by: null,
        route: "online",
        status: "received",
        idempotency_key: "round-1:ent-1:online",
        round_close_snapshot: new Date("2026-06-01T10:00:00Z"),
      },
    });
    expect(prisma.answers.create.mock.calls.map(([arg]) => arg.data)).toEqual([
      { submission_id: "sub-new", question_id: "q1", answer_value: null },
      { submission_id: "sub-new", question_id: "q2", answer_value: null },
      { submission_id: "sub-new", question_id: "q3", answer_value: null },
    ]);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        submission: {
          id: "sub-new",
          status: "received",
          answers: [
            { id: "ans-q1", question_id: "q1", answer_value: null },
            { id: "ans-q2", question_id: "q2", answer_value: null },
            { id: "ans-q3", question_id: "q3", answer_value: null },
          ],
        },
      },
    });
  });
});

describe("PATCH /:roundId/exam/answers/:qid", () => {
  const saveReq = (body) => studentReq({ params: { roundId: "round-1", qid: "q1" }, body });

  it("rejects a user with no entrant profile", async () => {
    const { next } = await run(
      saveAnswer,
      mockReq({ user: { ...student, entrant: null }, params: { roundId: "round-1", qid: "q1" }, body: { answer_value: "0" } }),
    );
    expectError(next, 403, "No entrant profile linked to your account");
    expect(prisma.submissions.findFirst).not.toHaveBeenCalled();
  });

  it("requires an attempt that is still in progress", async () => {
    prisma.submissions.findFirst.mockResolvedValue(null);

    const { next } = await run(saveAnswer, saveReq({ answer_value: "0" }));
    expectError(next, 400, "No active submission found — start the exam first");
    expect(prisma.submissions.findFirst).toHaveBeenCalledWith({
      where: { round_id: "round-1", entrant_id: "ent-1", route: "online", status: "received" },
    });
  });

  it("rejects a question that isn't part of the attempt", async () => {
    prisma.submissions.findFirst.mockResolvedValue({ id: "sub-1" });
    prisma.answers.findFirst.mockResolvedValue(null);

    expectError((await run(saveAnswer, saveReq({ answer_value: "0" }))).next, 404, "Answer row not found for this question");
    expect(prisma.answers.findFirst).toHaveBeenCalledWith({ where: { submission_id: "sub-1", question_id: "q1" } });
  });

  it("saves the answer without marking it", async () => {
    prisma.submissions.findFirst.mockResolvedValue({ id: "sub-1" });
    prisma.answers.findFirst.mockResolvedValue({ id: "ans-1" });
    prisma.answers.update.mockResolvedValue({ id: "ans-1", question_id: "q1", answer_value: "0,2", is_correct: null });

    const { res } = await run(saveAnswer, saveReq({ answer_value: "0,2" }));

    expect(prisma.answers.update).toHaveBeenCalledWith({ where: { id: "ans-1" }, data: { answer_value: "0,2" } });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { answer: { id: "ans-1", question_id: "q1", answer_value: "0,2" } },
    });
  });

  it("clears the answer when no value is sent", async () => {
    prisma.submissions.findFirst.mockResolvedValue({ id: "sub-1" });
    prisma.answers.findFirst.mockResolvedValue({ id: "ans-1" });
    prisma.answers.update.mockResolvedValue({ id: "ans-1", question_id: "q1", answer_value: null });

    await run(saveAnswer, saveReq({}));
    expect(prisma.answers.update).toHaveBeenCalledWith({ where: { id: "ans-1" }, data: { answer_value: null } });
  });
});

describe("POST /:roundId/exam/submit", () => {
  const attempt = (answers, overrides = {}) => ({
    id: "sub-1",
    status: "received",
    round_close_snapshot: new Date("2026-06-01T10:00:00Z"),
    answers,
    ...overrides,
  });
  const ans = (id, q, answer_value) => ({ id, answer_value, questions: q });
  const shortQ = { id: "q4", type: "short_answer", correct_answer: " Pretoria ", max_points: "3" };

  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date("2026-06-01T09:30:00Z")));
  afterEach(() => jest.useRealTimers());

  it("rejects a user with no entrant profile", async () => {
    const { next } = await run(submitExam, mockReq({ user: { ...student, entrant: null }, params: { roundId: "round-1" } }));
    expectError(next, 403);
  });

  it("requires an attempt to have been started", async () => {
    prisma.submissions.findFirst.mockResolvedValue(null);
    expectError((await run(submitExam, studentReq())).next, 400, "No submission found — start the exam first");
  });

  it("rejects a second submission", async () => {
    prisma.submissions.findFirst.mockResolvedValue(attempt([], { status: "queued_for_marking" }));
    expectError((await run(submitExam, studentReq())).next, 400, "This exam has already been submitted");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("marks choice and short-answer questions and totals the score", async () => {
    prisma.submissions.findFirst.mockResolvedValue(
      attempt([
        ans("a1", questions[0], "0,1"), // 1 right (2 pts) − 1 wrong at 25% of 4 (1) = 1
        ans("a2", questions[1], "1"), // correct: 1
        ans("a3", shortQ, "pretoria"), // case-insensitive match: 3
      ]),
    );

    const { res } = await run(submitExam, studentReq());

    expect(prisma.answers.update.mock.calls.map(([arg]) => [arg.where.id, arg.data])).toEqual([
      ["a1", { is_correct: false, points_awarded: 1, marked_at: expect.any(Date) }],
      ["a2", { is_correct: true, points_awarded: 1, marked_at: expect.any(Date) }],
      ["a3", { is_correct: true, points_awarded: 3, marked_at: expect.any(Date) }],
    ]);
    expect(prisma.submissions.update).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: { status: "automarked", is_late: false },
    });
    expect(prisma.results.upsert).toHaveBeenCalledWith({
      where: { round_id_entrant_id: { round_id: "round-1", entrant_id: "ent-1" } },
      create: { round_id: "round-1", entrant_id: "ent-1", total_points: 5 },
      update: { total_points: 5 },
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { message: "Exam submitted successfully", status: "automarked", total_points: 5, is_late: false },
    });
  });

  it("gives zero for a wrong or blank short answer", async () => {
    prisma.submissions.findFirst.mockResolvedValue(attempt([ans("a1", shortQ, "Cape Town"), ans("a2", shortQ, null)]));

    const { res } = await run(submitExam, studentReq());
    expect(prisma.answers.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "a2" }, data: expect.objectContaining({ is_correct: false, points_awarded: 0 }) }),
    );
    expect(res.json.mock.calls[0][0].data.total_points).toBe(0);
  });

  it("queues the attempt for manual marking when it has an essay", async () => {
    prisma.submissions.findFirst.mockResolvedValue(attempt([ans("a1", questions[1], "1"), ans("a3", questions[2], "My essay")]));

    const { res } = await run(submitExam, studentReq());

    expect(prisma.answers.update).toHaveBeenCalledTimes(1);
    expect(prisma.submissions.update).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: { status: "queued_for_marking", is_late: false },
    });
    expect(res.json.mock.calls[0][0].data).toMatchObject({ status: "queued_for_marking", total_points: 1 });
  });

  it("queues a choice question that has no answer key", async () => {
    prisma.submissions.findFirst.mockResolvedValue(
      attempt([ans("a1", { id: "q9", type: "mcq", correct_option: null, max_points: 2 }, "0")]),
    );

    await run(submitExam, studentReq());
    expect(prisma.answers.update).not.toHaveBeenCalled();
    expect(prisma.submissions.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "queued_for_marking", is_late: false } }),
    );
  });

  it("rejects a submission after the close time and records the decision", async () => {
    jest.setSystemTime(new Date("2026-06-01T10:00:05Z"));
    prisma.submissions.findFirst.mockResolvedValue(attempt([ans("a2", questions[1], "1")]));

    const { next } = await run(submitExam, studentReq());
    expectError(next, 400, "Submission received at or after the round deadline");
    expect(prisma.submission_deadline_decisions.create).toHaveBeenCalledWith({ data: expect.objectContaining({ accepted: false, route: "online" }) });
    expect(prisma.submissions.update).not.toHaveBeenCalled();
  });

  it("rejects an online submission received exactly at closing", async () => {
    jest.setSystemTime(new Date("2026-06-01T10:00:00Z"));
    prisma.submissions.findFirst.mockResolvedValue(attempt([ans("a2", questions[1], "1")]));
    const { next } = await run(submitExam, studentReq());
    expectError(next, 400, "Submission received at or after the round deadline");
    expect(prisma.submission_deadline_decisions.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ route: "online", accepted: false }),
    });
  });

  it("rejects an attempt without a recorded closing time", async () => {
    prisma.submissions.findFirst.mockResolvedValue(attempt([], { round_close_snapshot: null }));
    expect((await run(submitExam, studentReq())).next).toHaveBeenCalledWith(expect.any(Error));
  });
});
