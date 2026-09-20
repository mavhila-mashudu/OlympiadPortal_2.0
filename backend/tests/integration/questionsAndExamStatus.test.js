// Digitising an exam: educators build questions, the organiser verifies and
// approves (draft → ready → live). Questions service + exam-status route
// handlers, all against the real database.
jest.mock("../../src/config/supabase", () => require("./helpers/externalMocks").supabase);

const prisma = require("../../src/config/database").default;
const questionService = require("../../src/services/questionService");
const examStatusRouter = require("../../src/routes/examStatus");
const { getRouteHandler, run } = require("../unit/helpers/http");
const f = require("./helpers/factories");

const getExamStatus = getRouteHandler(examStatusRouter, "get", "/:roundId/exam-status");
const updateExamStatus = getRouteHandler(examStatusRouter, "patch", "/:roundId/exam-status");

const mcq = { type: "mcq", prompt: "Which are prime?", options: ["2", "4", "5"], correct_option: "0,2", max_points: 4, negative_pct: 25 };

const setup = async () => {
  const world = await f.createOlympiadWithSchool();
  const round = await f.createRound({ olympiad: world.olympiad });
  return { ...world, round };
};

const statusReq = (round, organiser, body) => ({
  params: { roundId: round.id },
  user: { userId: organiser.id, role: "organiser" },
  body: body ?? {},
});

describe("building questions", () => {
  it("creates the round's paper with the first question and reuses it after", async () => {
    const { round, educatorUser } = await setup();

    const first = await questionService.createQuestion(round.id, educatorUser.id, "educator", mcq);
    const second = await questionService.createQuestion(round.id, educatorUser.id, "educator", {
      type: "essay",
      prompt: "Explain your reasoning",
    });

    const papers = await prisma.papers.findMany({ where: { round_id: round.id } });
    expect(papers).toHaveLength(1);
    expect(papers[0].title).toBe(round.name);
    expect([first.paper_id, second.paper_id]).toEqual([papers[0].id, papers[0].id]);
    expect(String(second.max_points)).toBe("1");
    expect(String(second.negative_pct)).toBe("0");
  });

  it("stores options as JSON and the answer key as given", async () => {
    const { round, organiser } = await setup();
    const q = await questionService.createQuestion(round.id, organiser.id, "organiser", mcq);

    const stored = await prisma.questions.findUnique({ where: { id: q.id } });
    expect(stored).toMatchObject({ options: ["2", "4", "5"], correct_option: "0,2" });
    expect([String(stored.max_points), String(stored.negative_pct)]).toEqual(["4", "25"]);
  });

  it("lists questions in the order they were added", async () => {
    const { round, organiser } = await setup();
    const ids = [];
    for (const prompt of ["First", "Second", "Third"]) {
      ids.push((await questionService.createQuestion(round.id, organiser.id, "organiser", { type: "essay", prompt })).id);
    }
    const listed = await questionService.listQuestions(round.id, organiser.id, "organiser");
    expect(listed.map((q) => q.id)).toEqual(ids);
  });

  it("returns no questions before anything is added", async () => {
    const { round, organiser } = await setup();
    await expect(questionService.listQuestions(round.id, organiser.id, "organiser")).resolves.toEqual([]);
  });

  it("keeps educators from schools not in the olympiad out", async () => {
    const { round } = await setup();
    const outsider = await f.createEducator(); // school not registered
    await expect(
      questionService.createQuestion(round.id, outsider.user.id, "educator", mcq),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(await prisma.questions.count()).toBe(0);
  });

  it("updates only the fields sent", async () => {
    const { round, educatorUser } = await setup();
    const q = await questionService.createQuestion(round.id, educatorUser.id, "educator", mcq);

    await questionService.updateQuestion(q.id, educatorUser.id, "educator", { prompt: "Which numbers are prime?" });

    expect(await prisma.questions.findUnique({ where: { id: q.id } })).toMatchObject({
      prompt: "Which numbers are prime?",
      correct_option: "0,2",
      options: ["2", "4", "5"],
    });
  });

  it("deletes a question from a draft", async () => {
    const { round, organiser } = await setup();
    const q = await questionService.createQuestion(round.id, organiser.id, "organiser", mcq);
    await questionService.deleteQuestion(q.id, organiser.id, "organiser");
    expect(await prisma.questions.count()).toBe(0);
  });
});

describe("exam status workflow", () => {
  it("won't mark an exam with no questions as ready", async () => {
    const { round, organiser } = await setup();

    const { next } = await run(updateExamStatus, statusReq(round, organiser, { status: "ready" }));

    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 400 });
    expect((await prisma.rounds.findUnique({ where: { id: round.id } })).exam_status).toBe("draft");
  });

  it("locks editing for educators once ready, while the organiser can still correct answers", async () => {
    const { round, organiser, educatorUser } = await setup();
    const q = await questionService.createQuestion(round.id, educatorUser.id, "educator", mcq);

    const { res } = await run(updateExamStatus, statusReq(round, organiser, { status: "ready" }));
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { exam_status: "ready" } });

    await expect(
      questionService.updateQuestion(q.id, educatorUser.id, "educator", { correct_option: "0" }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      questionService.createQuestion(round.id, educatorUser.id, "educator", { type: "essay", prompt: "Late add" }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await questionService.updateQuestion(q.id, organiser.id, "organiser", { correct_option: "2" });
    expect((await prisma.questions.findUnique({ where: { id: q.id } })).correct_option).toBe("2");
  });

  it("records who approved the exam when it goes live, and freezes it", async () => {
    const { round, organiser } = await setup();
    const q = await questionService.createQuestion(round.id, organiser.id, "organiser", mcq);
    await questionService.createQuestion(round.id, organiser.id, "organiser", { type: "essay", prompt: "Explain" });

    await run(updateExamStatus, statusReq(round, organiser, { status: "ready" }));
    await run(updateExamStatus, statusReq(round, organiser, { status: "live" }));

    const live = await prisma.rounds.findUnique({ where: { id: round.id } });
    expect(live).toMatchObject({ exam_status: "live", approved_by: organiser.id, approved_at: expect.any(Date) });

    const { res } = await run(getExamStatus, statusReq(round, organiser));
    expect(res.json.mock.calls[0][0].data).toMatchObject({
      exam_status: "live",
      question_count: 2,
      questions_by_type: { mcq: 1, essay: 1 },
      approved_by_name: organiser.full_name,
    });

    await expect(questionService.updateQuestion(q.id, organiser.id, "organiser", { prompt: "x" })).rejects.toMatchObject({
      message: "Questions are locked once the exam is live",
    });
    const back = await run(updateExamStatus, statusReq(round, organiser, { status: "draft" }));
    expect(back.next.mock.calls[0][0]).toMatchObject({ statusCode: 400 });
  });

  it("clears the approval when an exam is sent back to draft", async () => {
    const { round, organiser } = await setup();
    await questionService.createQuestion(round.id, organiser.id, "organiser", mcq);
    await prisma.rounds.update({
      where: { id: round.id },
      data: { exam_status: "ready", approved_by: organiser.id, approved_at: new Date() },
    });

    await run(updateExamStatus, statusReq(round, organiser, { status: "draft" }));
    expect(await prisma.rounds.findUnique({ where: { id: round.id } })).toMatchObject({
      exam_status: "draft",
      approved_by: null,
      approved_at: null,
    });
  });

  it("won't let another organiser change the exam status", async () => {
    const { round } = await setup();
    const intruder = await f.createOrganiser();
    const { next } = await run(getExamStatus, statusReq(round, intruder));
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
  });
});
