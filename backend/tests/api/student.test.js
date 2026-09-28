// Student portal: dashboard, round detail, results, paper download, and
// sitting an exam online (load → start → save answers → submit).
const prisma = require("../../src/config/database").default;
const f = require("../integration/helpers/factories");
const { as, expectError, expectOk } = require("./helpers/api");

const MISSING = "00000000-0000-4000-8000-000000000000";

// A live, open round with three questions and a registered student
const setup = async (roundOverrides = {}) => {
  const { olympiad, school, educator } = await f.createOlympiadWithSchool();
  const round = await f.createRound({
    olympiad,
    name: "Round 2 — Regional",
    state: "open",
    exam_status: "live",
    opens_at: f.hoursFromNow(-1),
    closes_at: f.hoursFromNow(1),
    ...roundOverrides,
  });
  const { paper, questions } = await f.createPaper({
    round,
    file_url: "rounds/r2/paper-regional.pdf",
    memo_file_url: "rounds/r2/memo.pdf",
    questions: [
      { type: "mcq", prompt: "Which are prime?", options: ["2", "4", "5", "9"], correct_option: "0,2", max_points: 4, negative_pct: 25, created_at: new Date("2026-01-01T09:00:00Z") },
      { type: "short_answer", prompt: "Capital of South Africa?", correct_answer: "Pretoria", max_points: 2, created_at: new Date("2026-01-01T09:01:00Z") },
      { type: "essay", prompt: "Explain photosynthesis", max_points: 10, created_at: new Date("2026-01-01T09:02:00Z") },
    ],
  });
  const { user, entrant } = await f.createStudent({ school, entrantOverrides: { full_name: "Ayanda Khumalo" } });
  await f.registerEntrant({ entrant, round, educator });
  const [mcq, short, essay] = questions;
  return { olympiad, school, educator, round, paper, mcq, short, essay, user, entrant, studentApi: as(user) };
};

// Another student at the same school who isn't registered for the round
const unregisteredStudent = async (school) => as((await f.createStudent({ school })).user);

describe("GET /rounds/registered", () => {
  it("summarises the student's rounds and stats", async () => {
    const { olympiad, educator, entrant, round, studentApi } = await setup();
    const released = await f.createRound({ olympiad, name: "Round 1", state: "results_released", opens_at: f.hoursFromNow(-50), closes_at: f.hoursFromNow(-48) });
    await f.createPaper({ round: released, questions: [{ type: "essay", max_points: 20 }] });
    await f.registerEntrant({ entrant, round: released, educator });
    await prisma.results.create({ data: { round_id: released.id, entrant_id: entrant.id, total_points: 17, rank: 1, qualified: true } });

    const data = expectOk(await studentApi.get("/rounds/registered"));

    expect(data.stats).toEqual({ roundsEntered: 2, resultsAvailable: 1, certificatesEarned: 1 });
    expect(data.rounds).toEqual([
      {
        id: released.id,
        title: "Round 1",
        olympiadTitle: olympiad.name,
        timezone: "Africa/Johannesburg",
        opens_at: expect.any(String),
        closes_at: expect.any(String),
        status: "closed",
        paperFile: null,
        paperTitle: "Round 1 paper",
        hasSubmitted: false,
        result: { score: "17 / 20", percentage: "85%", rankInSchool: 1, hasCertificate: true },
      },
      expect.objectContaining({ id: round.id, status: "open", paperFile: "paper-regional.pdf", hasSubmitted: false, result: null }),
    ]);
  });

  it("returns an empty dashboard for a student with no registrations", async () => {
    const { school } = await setup();
    expect(expectOk(await (await unregisteredStudent(school)).get("/rounds/registered"))).toEqual({
      rounds: [],
      stats: { roundsEntered: 0, resultsAvailable: 0, certificatesEarned: 0 },
    });
  });

  it("responds 403 for a student account without a learner record", async () => {
    expectError(await as(await f.createUser("student")).get("/rounds/registered"), 403, "No entrant profile linked to your account");
  });
});

describe("GET /rounds/:roundId/details", () => {
  it("describes a round the student is registered for, without storage paths", async () => {
    const { round, school, studentApi } = await setup();

    const { round: detail } = expectOk(await studentApi.get(`/rounds/${round.id}/details`));

    expect(detail).toMatchObject({
      id: round.id,
      title: "Round 2 — Regional",
      schoolName: school.name,
      status: "open",
      canSitOnline: true,
      hasSubmitted: false,
      submissionStatus: null,
      paperFile: "paper-regional.pdf",
      hasPaper: true,
      paperNote: "Paper is available for download or online sitting.",
      result: null,
      timezone: "Africa/Johannesburg",
    });
    expect(JSON.stringify(detail)).not.toContain("rounds/r2/");
  });

  it("responds 404 for a round the student isn't registered for", async () => {
    const { round, school } = await setup();
    const res = await (await unregisteredStudent(school)).get(`/rounds/${round.id}/details`);
    expectError(res, 404, "Round not found or you are not registered for this round");
  });

  it("responds 422 for a round id that isn't a UUID", async () => {
    const { studentApi } = await setup();
    expectError(await studentApi.get("/rounds/round-2/details"), 422, "Valid round UUID required");
  });
});

describe("GET /rounds/my-results", () => {
  it("lists closed rounds, hiding scores until they are released", async () => {
    const { olympiad, educator, entrant, studentApi } = await setup();
    const marking = await f.createRound({ olympiad, name: "Marking", state: "marking", closes_at: f.hoursFromNow(-2), opens_at: f.hoursFromNow(-4) });
    const released = await f.createRound({ olympiad, name: "Released", state: "results_released", closes_at: f.hoursFromNow(-20), opens_at: f.hoursFromNow(-22) });
    for (const r of [marking, released]) {
      await f.registerEntrant({ entrant, round: r, educator });
      await prisma.results.create({ data: { round_id: r.id, entrant_id: entrant.id, total_points: 6 } });
    }

    const { results } = expectOk(await studentApi.get("/rounds/my-results"));

    expect(results.map((r) => [r.round, r.resultStatus, r.score, r.percentage])).toEqual([
      ["Marking", "pending", "—", "—"],
      ["Released", "released", "6 / 0", "0%"],
    ]);
  });
});

describe("GET /rounds/:roundId/paper/download", () => {
  it("signs a one-minute link to the paper for a registered student", async () => {
    const { round, studentApi } = await setup();
    expect(expectOk(await studentApi.get(`/rounds/${round.id}/paper/download`))).toEqual({
      url: "https://storage.test/rounds/r2/paper-regional.pdf?expires=60",
    });
  });

  it("responds 400 before the round opens", async () => {
    const { round, studentApi } = await setup({ state: "scheduled" });
    expectError(await studentApi.get(`/rounds/${round.id}/paper/download`), 400, "Paper is not available yet — the round has not opened");
  });

  it("responds 404 to an unregistered student and when there's no paper file", async () => {
    const { round, paper, school, studentApi } = await setup();
    expectError(await (await unregisteredStudent(school)).get(`/rounds/${round.id}/paper/download`), 404, "Round not found or you are not registered for this round");
    await prisma.papers.update({ where: { id: paper.id }, data: { file_url: null } });
    expectError(await studentApi.get(`/rounds/${round.id}/paper/download`), 404, "No paper uploaded for this round");
  });
});

describe("sitting an exam online", () => {
  const exam = (round) => `/rounds/${round.id}/exam`;

  describe("GET /rounds/:roundId/exam", () => {
    it("returns the questions without their answers, in the entrant's own shuffled order", async () => {
      const { round, entrant, mcq, short, essay, studentApi } = await setup();

      const data = expectOk(await studentApi.get(exam(round)));

      expect(data).toMatchObject({
        round: { id: round.id, name: "Round 2 — Regional", state: "open" },
        total_points: 16,
        server_time: expect.any(String),
        submission: null,
      });
      // The entrant's personal variant: question order and option order.
      const assignment = await prisma.exam_assignments.findUnique({
        where: { round_id_entrant_id: { round_id: round.id, entrant_id: entrant.id } },
      });
      expect(data.questions.map((q) => q.id)).toEqual(assignment.question_order);
      const byId = Object.fromEntries(data.questions.map((q) => [q.id, q]));
      expect(byId[mcq.id]).toMatchObject({ type: "mcq", prompt: "Which are prime?", max_points: "4", multi_select: true, negative_pct: 25 });
      expect(byId[mcq.id].options).toEqual(assignment.option_orders[mcq.id].map((index) => ["2", "4", "5", "9"][index]));
      expect(byId[short.id]).toEqual({ id: short.id, type: "short_answer", prompt: "Capital of South Africa?", options: null, max_points: "2", multi_select: false, negative_pct: 0 });
      expect(byId[essay.id]).toEqual({ id: essay.id, type: "essay", prompt: "Explain photosynthesis", options: null, max_points: "10", multi_select: false, negative_pct: 0 });
      expect(JSON.stringify(data)).not.toMatch(/Pretoria|correct_/);
    });

    it.each([
      [{ state: "scheduled" }, 400, "Round is not open (state: scheduled)"],
      [{ state: "closed" }, 400, "Round is not open (state: closed)"],
      [{ exam_status: "ready" }, 400, "This exam is not available for sitting"],
    ])("refuses a round with %o", async (overrides, status, message) => {
      const { round, studentApi } = await setup(overrides);
      expectError(await studentApi.get(exam(round)), status, message);
    });

    it("refuses an unregistered student and an unknown round", async () => {
      const { round, school, studentApi } = await setup();
      expectError(await (await unregisteredStudent(school)).get(exam(round)), 403, "You are not registered for this round");
      expectError(await studentApi.get(`/rounds/${MISSING}/exam`), 404, "Round not found");
    });
  });

  it("runs start → save → resume → submit over HTTP", async () => {
    const { round, mcq, short, essay, entrant, studentApi } = await setup();

    // The entrant's own variant decides where each option is displayed; pick
    // the two primes by their displayed position.
    const data = expectOk(await studentApi.get(exam(round)));
    const primePicks = data.questions.find((q) => q.id === mcq.id).options
      .map((option, index) => (option === "2" || option === "5" ? index : -1))
      .filter((index) => index >= 0)
      .join(",");

    // Start: creates the submission with an empty answer for every question
    const started = expectOk(await studentApi.post(`${exam(round)}/start`), 201);
    expect(started.submission).toMatchObject({ status: "received", answers: expect.arrayContaining([expect.objectContaining({ question_id: mcq.id, answer_value: null })]) });

    // Save answers
    const saved = expectOk(await studentApi.patch(`${exam(round)}/answers/${mcq.id}`).send({ answer_value: primePicks }));
    expect(saved.answer).toMatchObject({ question_id: mcq.id, answer_value: primePicks });
    expectOk(await studentApi.patch(`${exam(round)}/answers/${short.id}`).send({ answer_value: " pretoria " }));
    expectOk(await studentApi.patch(`${exam(round)}/answers/${essay.id}`).send({ answer_value: "Light becomes sugar" }));

    // Starting again resumes (200, not 201) with the saved answers
    const resumed = await studentApi.post(`${exam(round)}/start`);
    expect(expectOk(resumed).submission.answers.find((a) => a.question_id === mcq.id).answer_value).toBe(primePicks);
    expect(expectOk(await studentApi.get(exam(round))).submission).toMatchObject({ status: "received" });

    // Submit: the primes are marked correct wherever they were displayed,
    // worth 4, plus 2 for the short answer; the essay waits for marking
    expect(expectOk(await studentApi.post(`${exam(round)}/submit`))).toEqual({
      message: "Exam submitted successfully",
      status: "queued_for_marking",
      total_points: 6,
      is_late: false,
    });
    expect(await prisma.submissions.count({ where: { entrant_id: entrant.id } })).toBe(1);

    // Locked afterwards
    expectError(await studentApi.post(`${exam(round)}/submit`), 400, "This exam has already been submitted");
    expectError(await studentApi.post(`${exam(round)}/start`), 400, "This exam has already been submitted");
    expectError(await studentApi.patch(`${exam(round)}/answers/${mcq.id}`).send({ answer_value: "0,2" }), 400, "No active submission found — start the exam first");
  });

  describe("POST /rounds/:roundId/exam/start", () => {
    it("responds 400 when the exam has no questions", async () => {
      const { round, mcq, short, essay, studentApi } = await setup();
      await prisma.questions.deleteMany({ where: { id: { in: [mcq.id, short.id, essay.id] } } });
      expectError(await studentApi.post(`${exam(round)}/start`), 400, "No questions available for this exam");
    });

    it("responds 409 when the school already captured the student's answers on paper", async () => {
      const { round, entrant, educator, studentApi } = await setup();
      await prisma.submissions.create({
        data: { round_id: round.id, entrant_id: entrant.id, submitted_by: educator.id, route: "offline", idempotency_key: "paper", round_close_snapshot: round.closes_at },
      });

      expectError(await studentApi.post(`${exam(round)}/start`), 409, "Your school has already submitted your results for this round");
      expect(await prisma.submissions.count()).toBe(1);
      // The round page no longer offers the online sitting either
      expect(expectOk(await studentApi.get(`/rounds/${round.id}/details`)).round).toMatchObject({ hasSubmitted: true });
    });

    it("refuses an unregistered student", async () => {
      const { round, school } = await setup();
      expectError(await (await unregisteredStudent(school)).post(`${exam(round)}/start`), 403, "You are not registered for this round");
      expect(await prisma.submissions.count()).toBe(0);
    });
  });

  describe("PATCH /rounds/:roundId/exam/answers/:qid", () => {
    it("adds one autosave event per answer to the round's timeline, however often it is saved", async () => {
      const { round, mcq, short, studentApi } = await setup();
      expectOk(await studentApi.post(`${exam(round)}/start`), 201);
      for (const value of ["0", "1", "0,1"]) {
        expectOk(await studentApi.patch(`${exam(round)}/answers/${mcq.id}`).send({ answer_value: value }));
      }
      expectOk(await studentApi.patch(`${exam(round)}/answers/${short.id}`).send({ answer_value: "pretoria" }));

      const events = await prisma.round_events.findMany({ where: { round_id: round.id, kind: "answer_autosaved" } });
      expect(events.map((e) => e.details.question_id).sort()).toEqual([mcq.id, short.id].sort());
    });

    it("clears an answer when sent an empty value", async () => {
      const { round, mcq, studentApi } = await setup();
      expectOk(await studentApi.post(`${exam(round)}/start`), 201);
      expectOk(await studentApi.patch(`${exam(round)}/answers/${mcq.id}`).send({ answer_value: "0" }));
      expect(expectOk(await studentApi.patch(`${exam(round)}/answers/${mcq.id}`).send({})).answer.answer_value).toBeNull();
    });

    it("responds 400 before the exam is started", async () => {
      const { round, mcq, studentApi } = await setup();
      expectError(await studentApi.patch(`${exam(round)}/answers/${mcq.id}`).send({ answer_value: "0" }), 400, "No active submission found — start the exam first");
    });

    it("responds 404 for a question that isn't on this exam", async () => {
      const { round, olympiad, studentApi } = await setup();
      const other = await f.createRound({ olympiad });
      const { questions } = await f.createPaper({ round: other, questions: [{ type: "essay" }] });
      expectOk(await studentApi.post(`${exam(round)}/start`), 201);

      expectError(await studentApi.patch(`${exam(round)}/answers/${questions[0].id}`).send({ answer_value: "x" }), 404, "Answer row not found for this question");
    });

    it("keeps one student's answers out of another's reach", async () => {
      const { round, mcq, school, educator, studentApi } = await setup();
      const classmate = await f.createStudent({ school });
      await f.registerEntrant({ entrant: classmate.entrant, round, educator });
      expectOk(await studentApi.post(`${exam(round)}/start`), 201);
      expectOk(await studentApi.patch(`${exam(round)}/answers/${mcq.id}`).send({ answer_value: "0,2" }));

      // The classmate hasn't started, so there is nothing of theirs to write to
      const res = await as(classmate.user).patch(`${exam(round)}/answers/${mcq.id}`).send({ answer_value: "1" });
      expectError(res, 400, "No active submission found — start the exam first");
      const [answer] = await prisma.answers.findMany({ where: { question_id: mcq.id } });
      expect(answer.answer_value).toBe("0,2");
    });

    it("responds 422 for a question id that isn't a UUID", async () => {
      const { round, studentApi } = await setup();
      const res = await studentApi.patch(`${exam(round)}/answers/q-1`).send({ answer_value: "x" });
      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });
  });

  describe("POST /rounds/:roundId/exam/submit", () => {
    it("responds 400 before the exam is started", async () => {
      const { round, studentApi } = await setup();
      expectError(await studentApi.post(`${exam(round)}/submit`), 400, "No submission found — start the exam first");
    });

    it("marks an all-objective exam as automarked", async () => {
      const { round, mcq, short, essay, studentApi } = await setup();
      await prisma.questions.delete({ where: { id: essay.id } });

      // Pick the two primes by their displayed position in the variant.
      const data = expectOk(await studentApi.get(exam(round)));
      const picks = data.questions.find((q) => q.id === mcq.id).options
        .map((option, index) => (option === "2" || option === "5" ? index : -1))
        .filter((index) => index >= 0)
        .join(",");

      expectOk(await studentApi.post(`${exam(round)}/start`), 201);
      expectOk(await studentApi.patch(`${exam(round)}/answers/${mcq.id}`).send({ answer_value: picks }));
      expectOk(await studentApi.patch(`${exam(round)}/answers/${short.id}`).send({ answer_value: "PRETORIA" }));

      expect(expectOk(await studentApi.post(`${exam(round)}/submit`))).toMatchObject({ status: "automarked", total_points: 6 });
    });

    it("rejects a late submission and stores the ruling", async () => {
      const { round, studentApi } = await setup();
      expectOk(await studentApi.post(`${exam(round)}/start`), 201);
      await prisma.submissions.updateMany({ data: { round_close_snapshot: f.hoursFromNow(-0.01) } });

      expectError(await studentApi.post(`${exam(round)}/submit`), 400, "Submission received at or after the round deadline");
      expect(await prisma.submission_deadline_decisions.count({ where: { round_id: round.id, accepted: false } })).toBe(1);
    });
  });
});
