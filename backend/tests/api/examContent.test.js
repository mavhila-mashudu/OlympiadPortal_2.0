// Building and verifying an exam: questions, the exam-status workflow
// (draft → ready → live) and signed links to the paper and memo.
const prisma = require("../../src/config/database").default;
const f = require("../integration/helpers/factories");
const { supabase } = require("../integration/helpers/externalMocks");
const { as, expectError, expectOk } = require("./helpers/api");

const MISSING = "00000000-0000-4000-8000-000000000000";

// An organiser's round in a school's olympiad, with that school's coordinator
const setup = async (roundOverrides = {}) => {
  const world = await f.createOlympiadWithSchool();
  const round = await f.createRound({ olympiad: world.olympiad, ...roundOverrides });
  const outsider = await f.createEducator(); // school not registered for the olympiad
  return {
    ...world,
    round,
    organiserApi: as(world.organiser),
    educatorApi: as(world.educatorUser),
    outsiderApi: as(outsider.user),
    otherOrganiserApi: as(await f.createOrganiser()),
  };
};

const mcq = (overrides = {}) => ({
  type: "mcq",
  prompt: "Which of these are prime?",
  options: ["2", "4", "5", "9"],
  correct_option: "0,2",
  negative_pct: 25,
  max_points: 4,
  ...overrides,
});

describe("POST /rounds/:roundId/questions", () => {
  it("adds a question, creating the round's paper on first use", async () => {
    const { round, organiserApi } = await setup();

    const { question } = expectOk(await organiserApi.post(`/rounds/${round.id}/questions`).send(mcq()), 201);

    const paper = await prisma.papers.findFirst({ where: { round_id: round.id } });
    expect(paper.title).toBe(round.name);
    expect(question).toMatchObject({
      paper_id: paper.id,
      type: "mcq",
      prompt: "Which of these are prime?",
      options: ["2", "4", "5", "9"],
      correct_option: "0,2",
      negative_pct: "25",
      max_points: "4",
    });
  });

  it("lets an educator of a registered school digitise the paper, with default points", async () => {
    const { round, educatorApi } = await setup();
    const res = await educatorApi.post(`/rounds/${round.id}/questions`).send({ type: "essay", prompt: "Explain photosynthesis" });
    expect(expectOk(res, 201).question).toMatchObject({ type: "essay", max_points: "1", negative_pct: "0", correct_option: null });
  });

  it.each([
    [{ type: undefined }, "Question type is required"],
    [{ type: "matching" }, "type must be one of: mcq, true_false, short_answer, essay"],
    [{ prompt: "   " }, "Prompt is required"],
    [{ correct_option: "0,b" }, "correct_option must be option indexes separated by commas (e.g. 0,2)"],
    [{ correct_option: "1,1" }, "correct_option must not repeat an option index"],
    [{ negative_pct: 101 }, "negative_pct must be a percentage between 0 and 100"],
    [{ max_points: 0 }, "max_points must be a number greater than 0"],
    [{ options: "2,4,5" }, "options must be an array"],
    [{ correct_answer: 42 }, "correct_answer must be text"],
  ])("responds 422 for %o", async (overrides, message) => {
    const { round, organiserApi } = await setup();
    expectError(await organiserApi.post(`/rounds/${round.id}/questions`).send(mcq(overrides)), 422, message);
    expect(await prisma.questions.count()).toBe(0);
  });

  it("responds 422 for a round id that isn't a UUID", async () => {
    const { organiserApi } = await setup();
    expectError(await organiserApi.post("/rounds/round-1/questions").send(mcq()), 422, "roundId must be a valid UUID");
  });

  it("responds 400 once the exam has left draft", async () => {
    const { round, organiserApi } = await setup({ exam_status: "ready" });
    expectError(
      await organiserApi.post(`/rounds/${round.id}/questions`).send(mcq()),
      400,
      "Questions can only be added while the exam is in draft status",
    );
  });

  it("refuses organisers and schools outside the olympiad", async () => {
    const { round, otherOrganiserApi, outsiderApi, organiserApi } = await setup();
    expectError(await otherOrganiserApi.post(`/rounds/${round.id}/questions`).send(mcq()), 403, "Not your round");
    expectError(await outsiderApi.post(`/rounds/${round.id}/questions`).send(mcq()), 403, "Your school is not registered for this olympiad");
    expectError(await organiserApi.post(`/rounds/${MISSING}/questions`).send(mcq()), 404, "Round not found");
    expect(await prisma.questions.count()).toBe(0);
  });
});

describe("GET /rounds/:roundId/questions", () => {
  it("lists the paper's questions in the order they were added, answers included", async () => {
    const { round, educatorApi } = await setup();
    const { questions } = await f.createPaper({
      round,
      questions: [
        { type: "short_answer", correct_answer: "Pretoria", created_at: new Date("2026-01-01T10:00:00Z") },
        { type: "essay", created_at: new Date("2026-01-01T09:00:00Z") },
      ],
    });

    const data = expectOk(await educatorApi.get(`/rounds/${round.id}/questions`));

    expect(data.questions.map((q) => q.id)).toEqual([questions[1].id, questions[0].id]);
    expect(data.questions[1].correct_answer).toBe("Pretoria");
  });

  it("returns an empty list for a round without a paper", async () => {
    const { round, organiserApi } = await setup();
    expect(expectOk(await organiserApi.get(`/rounds/${round.id}/questions`))).toEqual({ questions: [] });
  });

  it("hides the questions (and answer key) from anyone outside the olympiad", async () => {
    const { round, otherOrganiserApi, outsiderApi } = await setup();
    await f.createPaper({ round, questions: [{ type: "mcq", correct_option: "1" }] });
    expectError(await otherOrganiserApi.get(`/rounds/${round.id}/questions`), 403, "Not your round");
    expectError(await outsiderApi.get(`/rounds/${round.id}/questions`), 403, "Your school is not registered for this olympiad");
  });
});

describe("PATCH /rounds/:roundId/questions/:id", () => {
  const withQuestion = async (roundOverrides) => {
    const world = await setup(roundOverrides);
    const { questions } = await f.createPaper({ round: world.round, questions: [mcq()] });
    return { ...world, question: questions[0], url: `/rounds/${world.round.id}/questions/${questions[0].id}` };
  };

  it("updates only the fields sent", async () => {
    const { url, educatorApi } = await withQuestion();
    const { question } = expectOk(await educatorApi.patch(url).send({ prompt: "Pick every prime", max_points: 6 }));
    expect(question).toMatchObject({ prompt: "Pick every prime", max_points: "6", correct_option: "0,2", options: ["2", "4", "5", "9"] });
  });

  it("lets the organiser correct the answer key while the exam awaits verification", async () => {
    const { url, organiserApi, educatorApi } = await withQuestion({ exam_status: "ready" });
    expectError(await educatorApi.patch(url).send({ correct_option: "0" }), 400, "Questions can only be edited while the exam is in draft status");
    expect(expectOk(await organiserApi.patch(url).send({ correct_option: "0" })).question.correct_option).toBe("0");
  });

  it("responds 400 once the exam is live", async () => {
    const { url, organiserApi } = await withQuestion({ exam_status: "live" });
    expectError(await organiserApi.patch(url).send({ correct_option: "0" }), 400, "Questions are locked once the exam is live");
  });

  it("responds 404 for a question that isn't on the round in the URL", async () => {
    const { question, olympiad, organiserApi } = await withQuestion();
    const otherRound = await f.createRound({ olympiad });
    const res = await organiserApi.patch(`/rounds/${otherRound.id}/questions/${question.id}`).send({ prompt: "Moved?" });
    expectError(res, 404, "Question not found");
    expect((await prisma.questions.findUnique({ where: { id: question.id } })).prompt).toBe("Which of these are prime?");
  });

  it("responds 404 for an unknown question and 422 for invalid fields", async () => {
    const { round, url, organiserApi } = await withQuestion();
    expectError(await organiserApi.patch(`/rounds/${round.id}/questions/${MISSING}`).send({ prompt: "x" }), 404, "Question not found");
    expectError(await organiserApi.patch(url).send({ correct_option: "a" }), 422, "correct_option must be option indexes separated by commas (e.g. 0,2)");
    expectError(await organiserApi.patch(`/rounds/${round.id}/questions/q-1`).send({ prompt: "x" }), 422, "Question id must be a valid UUID");
  });

  it("refuses organisers and schools outside the olympiad", async () => {
    const { url, otherOrganiserApi, outsiderApi } = await withQuestion();
    expectError(await otherOrganiserApi.patch(url).send({ prompt: "x" }), 403, "Not your question");
    expectError(await outsiderApi.patch(url).send({ prompt: "x" }), 403, "Your school is not registered for this olympiad");
  });
});

describe("DELETE /rounds/:roundId/questions/:id", () => {
  it("deletes a question from a draft exam", async () => {
    const { round, organiserApi } = await setup();
    const { questions } = await f.createPaper({ round, questions: [mcq()] });

    expect(expectOk(await organiserApi.delete(`/rounds/${round.id}/questions/${questions[0].id}`))).toEqual({ message: "Question deleted" });
    expect(await prisma.questions.count()).toBe(0);
  });

  it("responds 400 once the exam has left draft", async () => {
    const { round, organiserApi } = await setup({ exam_status: "live" });
    const { questions } = await f.createPaper({ round, questions: [mcq()] });
    expectError(await organiserApi.delete(`/rounds/${round.id}/questions/${questions[0].id}`), 400, "Questions can only be deleted while the exam is in draft status");
  });

  it("responds 409 for a question that already has answers, keeping it", async () => {
    const { round, school, educator, organiserApi } = await setup({ state: "open" });
    const { questions } = await f.createPaper({ round, questions: [mcq()] });
    const entrant = await f.createEntrant({ school });
    await prisma.submissions.create({
      data: {
        round_id: round.id,
        entrant_id: entrant.id,
        submitted_by: educator.id,
        idempotency_key: "k",
        round_close_snapshot: round.closes_at,
        answers: { create: [{ question_id: questions[0].id, answer_value: "0" }] },
      },
    });

    const res = await organiserApi.delete(`/rounds/${round.id}/questions/${questions[0].id}`);
    expectError(res, 409, "This record is still referenced by other records");
    expect(await prisma.questions.count()).toBe(1);
  });

  it("responds 404 for a question from another round and refuses outsiders", async () => {
    const { round, olympiad, organiserApi, outsiderApi } = await setup();
    const { questions } = await f.createPaper({ round, questions: [mcq()] });
    const otherRound = await f.createRound({ olympiad });

    expectError(await organiserApi.delete(`/rounds/${otherRound.id}/questions/${questions[0].id}`), 404, "Question not found");
    expectError(await outsiderApi.delete(`/rounds/${round.id}/questions/${questions[0].id}`), 403, "Your school is not registered for this olympiad");
    expect(await prisma.questions.count()).toBe(1);
  });
});

describe("GET /rounds/:roundId/exam-status", () => {
  it("summarises the exam and who approved it", async () => {
    const { round, organiser, organiserApi } = await setup({ exam_status: "live", approved_at: new Date("2026-09-01T10:00:00Z") });
    await prisma.rounds.update({ where: { id: round.id }, data: { approved_by: organiser.id } });
    const { paper } = await f.createPaper({ round, questions: [{ type: "mcq" }, { type: "mcq" }, { type: "essay" }] });

    expect(expectOk(await organiserApi.get(`/rounds/${round.id}/exam-status`))).toEqual({
      exam_status: "live",
      state: "scheduled",
      question_count: 3,
      questions_by_type: { mcq: 2, essay: 1 },
      paper_id: paper.id,
      approved_by: organiser.id,
      approved_at: "2026-09-01T10:00:00.000Z",
      approved_by_name: organiser.full_name,
    });
  });

  it("reports an empty draft for a round without a paper", async () => {
    const { round, organiserApi } = await setup();
    expect(expectOk(await organiserApi.get(`/rounds/${round.id}/exam-status`))).toMatchObject({
      exam_status: "draft",
      question_count: 0,
      questions_by_type: {},
      paper_id: null,
      approved_by_name: null,
    });
  });

  it("responds 403 to another organiser and 404 for an unknown round", async () => {
    const { round, otherOrganiserApi, organiserApi } = await setup();
    expectError(await otherOrganiserApi.get(`/rounds/${round.id}/exam-status`), 403, "Not your round");
    expectError(await organiserApi.get(`/rounds/${MISSING}/exam-status`), 404, "Round not found");
  });
});

describe("PATCH /rounds/:roundId/exam-status", () => {
  const status = (api, round, value) => api.patch(`/rounds/${round.id}/exam-status`).send({ status: value });

  it("runs draft → ready → live, recording the approving organiser", async () => {
    const { round, organiser, organiserApi } = await setup();
    await f.createPaper({ round, questions: [mcq()] });

    expect(expectOk(await status(organiserApi, round, "ready"))).toEqual({ exam_status: "ready" });
    expect(expectOk(await status(organiserApi, round, "live"))).toEqual({ exam_status: "live" });

    expect(await prisma.rounds.findUnique({ where: { id: round.id } })).toMatchObject({
      exam_status: "live",
      approved_by: organiser.id,
      approved_at: expect.any(Date),
    });
  });

  it("sends a ready exam back to draft and clears any approval", async () => {
    const { round, organiser, organiserApi } = await setup({ exam_status: "ready", approved_at: new Date() });
    await prisma.rounds.update({ where: { id: round.id }, data: { approved_by: organiser.id } });

    expectOk(await status(organiserApi, round, "draft"));

    expect(await prisma.rounds.findUnique({ where: { id: round.id } })).toMatchObject({ exam_status: "draft", approved_by: null, approved_at: null });
  });

  it("responds 400 when marking an exam without questions as ready", async () => {
    const { round, organiserApi } = await setup();
    expectError(await status(organiserApi, round, "ready"), 400, "Cannot mark as ready — at least one question is required");
  });

  it.each([
    ["draft", "live"],
    ["live", "draft"],
    ["live", "ready"],
  ])("responds 400 for %s → %s", async (from, to) => {
    const { round, organiserApi } = await setup({ exam_status: from });
    await f.createPaper({ round, questions: [mcq()] });
    expectError(await status(organiserApi, round, to), 400, `Cannot transition from ${from} to ${to}`);
  });

  it.each([undefined, "published"])("responds 422 for status %p", async (value) => {
    const { round, organiserApi } = await setup();
    expectError(await status(organiserApi, round, value), 422, "status must be one of: draft, ready, live");
  });

  it("responds 403 to another organiser, leaving the exam unchanged", async () => {
    const { round, otherOrganiserApi } = await setup({ exam_status: "ready" });
    await f.createPaper({ round, questions: [mcq()] });
    expectError(await status(otherOrganiserApi, round, "live"), 403, "Not your round");
    expect((await prisma.rounds.findUnique({ where: { id: round.id } })).exam_status).toBe("ready");
  });
});

describe("GET /papers/by-round/:roundId", () => {
  const withFiles = async (paperOverrides = {}) => {
    const world = await setup();
    await f.createPaper({ round: world.round, file_url: "rounds/r/paper.pdf", memo_file_url: "rounds/r/memo.pdf", ...paperOverrides });
    return world;
  };

  it("gives the organiser hour-long viewing links to the paper and memo", async () => {
    const { round, organiserApi } = await withFiles();
    expect(expectOk(await organiserApi.get(`/papers/by-round/${round.id}?type=paper`))).toEqual({ url: "https://storage.test/rounds/r/paper.pdf?expires=3600" });
    expect(expectOk(await organiserApi.get(`/papers/by-round/${round.id}?type=memo`))).toEqual({ url: "https://storage.test/rounds/r/memo.pdf?expires=3600" });
    expect(supabase.storage.from).toHaveBeenCalledWith("papers");
  });

  it("gives a registered school's educator the paper but not the memo", async () => {
    const { round, educatorApi } = await withFiles();
    expect(expectOk(await educatorApi.get(`/papers/by-round/${round.id}`)).url).toContain("paper.pdf");
    expectError(await educatorApi.get(`/papers/by-round/${round.id}?type=memo`), 403, "Only the organiser can view the memo");
  });

  it("treats an unknown type as the paper", async () => {
    const { round, organiserApi } = await withFiles();
    expect(expectOk(await organiserApi.get(`/papers/by-round/${round.id}?type=answers`)).url).toContain("paper.pdf");
  });

  it("responds 404 when there's no paper or no file of that type", async () => {
    const { round, organiserApi } = await setup();
    expectError(await organiserApi.get(`/papers/by-round/${round.id}`), 404, "No paper uploaded for this round");
    await f.createPaper({ round, file_url: "rounds/r/paper.pdf" });
    expectError(await organiserApi.get(`/papers/by-round/${round.id}?type=memo`), 404, "No memo uploaded for this round");
  });

  it("refuses organisers and schools outside the olympiad", async () => {
    const { round, otherOrganiserApi, outsiderApi } = await withFiles();
    expectError(await otherOrganiserApi.get(`/papers/by-round/${round.id}`), 403, "Not your round");
    expectError(await outsiderApi.get(`/papers/by-round/${round.id}`), 403, "Your school is not registered for this olympiad");
    expect(supabase.storage.bucket.createSignedUrl).not.toHaveBeenCalled();
  });

  it("responds 400 when storage can't sign the link", async () => {
    const { round, organiserApi } = await withFiles();
    supabase.storage.bucket.createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: "Object not found" } });
    expectError(await organiserApi.get(`/papers/by-round/${round.id}`), 400, "Could not generate view link: Object not found");
  });
});

describe("GET /papers/:id/download", () => {
  it("gives the owning organiser a one-minute download link", async () => {
    const { round, organiserApi } = await setup();
    const { paper } = await f.createPaper({ round, file_url: "rounds/r/paper.pdf", memo_file_url: "rounds/r/memo.pdf" });

    expect(expectOk(await organiserApi.get(`/papers/${paper.id}/download`))).toEqual({ url: "https://storage.test/rounds/r/paper.pdf?expires=60" });
    expect(expectOk(await organiserApi.get(`/papers/${paper.id}/download?type=memo`))).toEqual({ url: "https://storage.test/rounds/r/memo.pdf?expires=60" });
  });

  it("responds 404 to another organiser, for an unknown paper, and for a missing file", async () => {
    const { round, organiserApi, otherOrganiserApi } = await setup();
    const { paper } = await f.createPaper({ round, file_url: "rounds/r/paper.pdf" });

    expectError(await otherOrganiserApi.get(`/papers/${paper.id}/download`), 404, "Paper not found");
    expectError(await organiserApi.get(`/papers/${MISSING}/download`), 404, "Paper not found");
    expectError(await organiserApi.get(`/papers/${paper.id}/download?type=memo`), 404, "No memo uploaded for this round");
  });
});
