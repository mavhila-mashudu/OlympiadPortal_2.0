// Offline submissions, auto-marking, the manual marking queue, marking an
// answer and generating final results.
const prisma = require("../../src/config/database").default;
const f = require("../integration/helpers/factories");
const { as, expectError, expectOk } = require("./helpers/api");

const MISSING = "00000000-0000-4000-8000-000000000000";

// An open round (MCQ worth 4 + essay worth 10) in an olympiad with two
// registered schools. Each school has a coordinator and a registered learner.
const setup = async (roundOverrides = {}) => {
  const { organiser, olympiad, school, educatorUser, educator } = await f.createOlympiadWithSchool();
  const round = await f.createRound({ olympiad, state: "open", opens_at: f.hoursFromNow(-1), closes_at: f.hoursFromNow(2), ...roundOverrides });
  const { questions } = await f.createPaper({
    round,
    questions: [
      { type: "mcq", options: ["2", "4", "5"], correct_option: "0,2", max_points: 4, created_at: new Date("2026-01-01T09:00:00Z") },
      { type: "essay", max_points: 10, created_at: new Date("2026-01-01T10:00:00Z") },
    ],
  });
  const [mcq, essay] = questions;
  const ayanda = await f.createEntrant({ school, full_name: "Ayanda Khumalo", grade: "11" });
  await f.registerEntrant({ entrant: ayanda, round, educator });

  const otherSchool = await f.createSchool();
  await f.registerSchool(otherSchool, olympiad);
  const other = await f.createEducator({ school: otherSchool });
  const lerato = await f.createEntrant({ school: otherSchool, full_name: "Lerato Nkosi" });
  await f.registerEntrant({ entrant: lerato, round, educator: other.educator });

  return {
    organiser,
    olympiad,
    round,
    school,
    educator,
    mcq,
    essay,
    ayanda,
    lerato,
    organiserApi: as(organiser),
    educatorApi: as(educatorUser),
    otherEducatorApi: as(other.user),
    otherOrganiserApi: as(await f.createOrganiser()),
  };
};

const answersFor = ({ mcq, essay }, mcqValue = "0,2", essayValue = "Plants make sugar from light") => [
  { question_id: mcq.id, answer_value: mcqValue },
  { question_id: essay.id, answer_value: essayValue },
];

describe("POST /rounds/:roundId/submissions", () => {
  it("records an educator's offline capture, auto-marking the objective answers", async () => {
    const world = await setup();
    const { round, ayanda, educator, educatorApi } = world;

    const res = await educatorApi.post(`/rounds/${round.id}/submissions`).send({ entrant_id: ayanda.id, answers: answersFor(world) });

    const data = expectOk(res, 201);
    expect(data).toMatchObject({
      submission: { round_id: round.id, entrant_id: ayanda.id, submitted_by: educator.id, route: "offline", status: "received" },
      totalPoints: 4,
      autoMarked: false,
    });
    expect(data.answers).toHaveLength(2);
    expect(data.answers.find((a) => a.question_id === world.mcq.id)).toMatchObject({ is_correct: true, points_awarded: "4" });
    expect(data.answers.find((a) => a.question_id === world.essay.id)).toMatchObject({ is_correct: null, points_awarded: null });
  });

  it("accepts a capture with no answers (results recorded elsewhere)", async () => {
    const { round, ayanda, educatorApi } = await setup();
    const data = expectOk(await educatorApi.post(`/rounds/${round.id}/submissions`).send({ entrant_id: ayanda.id, route: "offline", answers: [] }), 201);
    expect(data).toMatchObject({ answers: [], totalPoints: 0, autoMarked: false });
  });

  it("responds 409 to a second capture for the same learner, whether or not the route is named", async () => {
    const { round, ayanda, educatorApi } = await setup();
    const url = `/rounds/${round.id}/submissions`;
    expectOk(await educatorApi.post(url).send({ entrant_id: ayanda.id, answers: [] }), 201);

    const message = "A submission already exists for this entrant, round, and route";
    expectError(await educatorApi.post(url).send({ entrant_id: ayanda.id, answers: [] }), 409, message);
    expectError(await educatorApi.post(url).send({ entrant_id: ayanda.id, route: "offline", answers: [] }), 409, message);
    expect(await prisma.submissions.count()).toBe(1);
  });

  it("responds 409 for a learner who already sat the round online", async () => {
    const { round, ayanda, educatorApi } = await setup();
    await prisma.submissions.create({
      data: { round_id: round.id, entrant_id: ayanda.id, route: "online", status: "automarked", idempotency_key: `${round.id}:${ayanda.id}:online`, round_close_snapshot: round.closes_at },
    });

    const res = await educatorApi.post(`/rounds/${round.id}/submissions`).send({ entrant_id: ayanda.id, answers: [] });

    expectError(res, 409, "This entrant already has a submission for this round");
    expect(await prisma.submissions.count()).toBe(1);
  });

  it.each([
    [{ entrant_id: undefined }, "entrant_id is required"],
    [{ route: "email" }, "route must be online or offline"],
    [{ answers: "0,2" }, "answers must be an array"],
    [{ answers: [{ question_id: "q1", answer_value: "1" }] }, "question_id is required"],
  ])("responds 422 for %o", async (overrides, message) => {
    const { round, ayanda, educatorApi } = await setup();
    const res = await educatorApi.post(`/rounds/${round.id}/submissions`).send({ entrant_id: ayanda.id, answers: [], ...overrides });
    expectError(res, 422, message);
  });

  it.each([
    ["the round isn't open", { roundState: "closed" }, 400, 'Submissions are not accepted — round is "closed"'],
    ["the learner is at another school", { entrant: "lerato" }, 403, "Entrant does not belong to your school"],
    ["the learner isn't registered for the round", { entrant: "unregistered" }, 403, "Entrant is not registered for this round"],
    ["the learner doesn't exist", { entrant: "missing" }, 404, "Entrant not found"],
  ])("refuses a capture when %s", async (_label, { roundState, entrant = "ayanda" }, status, message) => {
    const world = await setup(roundState ? { state: roundState } : {});
    const entrants = {
      ayanda: world.ayanda.id,
      lerato: world.lerato.id,
      unregistered: (await f.createEntrant({ school: world.school })).id,
      missing: MISSING,
    };

    const res = await world.educatorApi.post(`/rounds/${world.round.id}/submissions`).send({ entrant_id: entrants[entrant], answers: [] });

    expectError(res, status, message);
    expect(await prisma.submissions.count()).toBe(0);
  });

  it("responds 400 for an answer to a question from another paper", async () => {
    const world = await setup();
    const elsewhere = await f.createRound({ olympiad: world.olympiad });
    const { questions } = await f.createPaper({ round: elsewhere, questions: [{ type: "essay" }] });

    const res = await world.educatorApi
      .post(`/rounds/${world.round.id}/submissions`)
      .send({ entrant_id: world.ayanda.id, answers: [{ question_id: questions[0].id, answer_value: "x" }] });

    expectError(res, 400, `Question ${questions[0].id} does not belong to this round's paper`);
  });

  it("responds 404 for an unknown round", async () => {
    const { ayanda, educatorApi } = await setup();
    expectError(await educatorApi.post(`/rounds/${MISSING}/submissions`).send({ entrant_id: ayanda.id, answers: [] }), 404, "Round not found");
  });
});

// Two captured submissions: Ayanda's (educator's school) and Lerato's
const withSubmissions = async (roundOverrides) => {
  const world = await setup(roundOverrides);
  const capture = async (entrant, api) =>
    expectOk(await api.post(`/rounds/${world.round.id}/submissions`).send({ entrant_id: entrant.id, answers: answersFor(world) }), 201).submission;
  // Captures need an open round; move it on afterwards if asked
  if (roundOverrides?.state && roundOverrides.state !== "open") {
    await prisma.rounds.update({ where: { id: world.round.id }, data: { state: "open" } });
  }
  const mine = await capture(world.ayanda, world.educatorApi);
  const theirs = await capture(world.lerato, world.otherEducatorApi);
  if (roundOverrides?.state) await prisma.rounds.update({ where: { id: world.round.id }, data: { state: roundOverrides.state } });
  return { ...world, mine, theirs };
};

describe("GET /rounds/:roundId/submissions", () => {
  it("shows the organiser every submission and an educator only their school's", async () => {
    const { round, mine, theirs, organiserApi, educatorApi } = await withSubmissions();

    const all = expectOk(await organiserApi.get(`/rounds/${round.id}/submissions`)).submissions;
    expect(all.map((s) => s.id).sort()).toEqual([mine.id, theirs.id].sort());
    expect(all[0]).toMatchObject({ entrants: { id: expect.any(String), full_name: expect.any(String) }, _count: { answers: 2 } });

    const own = expectOk(await educatorApi.get(`/rounds/${round.id}/submissions`)).submissions;
    expect(own.map((s) => s.id)).toEqual([mine.id]);
  });

  it("responds 403 to another organiser and 404 for an unknown round", async () => {
    const { round, otherOrganiserApi, organiserApi } = await withSubmissions();
    expectError(await otherOrganiserApi.get(`/rounds/${round.id}/submissions`), 403, "Not your round");
    expectError(await organiserApi.get(`/rounds/${MISSING}/submissions`), 404, "Round not found");
  });
});

describe("GET /rounds/:roundId/submissions/:id", () => {
  it("returns a submission with its answers to the organiser and the learner's school", async () => {
    const { round, mine, organiserApi, educatorApi } = await withSubmissions();

    const { submission } = expectOk(await educatorApi.get(`/rounds/${round.id}/submissions/${mine.id}`));
    expect(submission).toMatchObject({ id: mine.id, entrants: { full_name: "Ayanda Khumalo" } });
    expect(submission.answers.map((a) => a.questions.type)).toEqual(["mcq", "essay"]);

    expect(expectOk(await organiserApi.get(`/rounds/${round.id}/submissions/${mine.id}`)).submission.id).toBe(mine.id);
  });

  it("refuses another school's educator and another organiser", async () => {
    const { round, mine, otherEducatorApi, otherOrganiserApi } = await withSubmissions();
    expectError(await otherEducatorApi.get(`/rounds/${round.id}/submissions/${mine.id}`), 403, "Not your school's submission");
    expectError(await otherOrganiserApi.get(`/rounds/${round.id}/submissions/${mine.id}`), 403, "Not your submission");
  });

  it("responds 404 for an unknown submission or one from a different round", async () => {
    const { round, olympiad, mine, organiserApi } = await withSubmissions();
    const otherRound = await f.createRound({ olympiad });
    expectError(await organiserApi.get(`/rounds/${round.id}/submissions/${MISSING}`), 404, "Submission not found");
    expectError(await organiserApi.get(`/rounds/${otherRound.id}/submissions/${mine.id}`), 404, "Submission not found");
  });
});

describe("POST /rounds/:roundId/mark", () => {
  it("auto-marks every received submission for the organiser", async () => {
    const { round, organiserApi } = await withSubmissions();

    const { result } = expectOk(await organiserApi.post(`/rounds/${round.id}/mark`));

    expect(result.total).toBe(2);
    expect(result.processed).toHaveLength(2);
    expect(await prisma.submissions.findMany({ select: { status: true } })).toEqual([
      { status: "queued_for_marking" },
      { status: "queued_for_marking" },
    ]);
  });

  it("limits an educator to their own school's submissions", async () => {
    const { round, mine, theirs, educatorApi } = await withSubmissions();

    expect(expectOk(await educatorApi.post(`/rounds/${round.id}/mark`)).result.total).toBe(1);
    expect((await prisma.submissions.findUnique({ where: { id: mine.id } })).status).toBe("queued_for_marking");
    expect((await prisma.submissions.findUnique({ where: { id: theirs.id } })).status).toBe("received");
  });

  it("refuses organisers and schools outside the olympiad", async () => {
    const { round, otherOrganiserApi } = await withSubmissions();
    const outsider = as((await f.createEducator()).user);
    expectError(await otherOrganiserApi.post(`/rounds/${round.id}/mark`), 403, "Not your round");
    expectError(await outsider.post(`/rounds/${round.id}/mark`), 403, "Your school is not registered for this olympiad");
    expect(await prisma.submissions.count({ where: { status: "received" } })).toBe(2);
  });
});

describe("GET /rounds/:roundId/marking-queue", () => {
  it("lists unmarked answers with the memo, organiser sees all schools, educator their own", async () => {
    const { round, essay, organiserApi, educatorApi } = await withSubmissions();
    expectOk(await organiserApi.post(`/rounds/${round.id}/mark`));

    const all = expectOk(await organiserApi.get(`/rounds/${round.id}/marking-queue`)).submissions;
    expect(all).toHaveLength(2);
    expect(all[0].answers).toEqual([
      expect.objectContaining({ question_id: essay.id, questions: expect.objectContaining({ type: "essay", max_points: "10" }) }),
    ]);

    const own = expectOk(await educatorApi.get(`/rounds/${round.id}/marking-queue`)).submissions;
    expect(own.map((s) => s.entrants.full_name)).toEqual(["Ayanda Khumalo"]);
    expect(own[0].entrants).toEqual({ id: expect.any(String), full_name: "Ayanda Khumalo", grade: "11" });
  });

  it("refuses another organiser", async () => {
    const { round, otherOrganiserApi } = await withSubmissions();
    expectError(await otherOrganiserApi.get(`/rounds/${round.id}/marking-queue`), 403, "Not your round");
  });
});

describe("PATCH /rounds/:roundId/answers/:id", () => {
  const essayAnswerOf = (world, submission) =>
    prisma.answers.findFirst({ where: { submission_id: submission.id, question_id: world.essay.id } });

  it("records the mark, updates the total and finishes the submission", async () => {
    const world = await withSubmissions();
    const answer = await essayAnswerOf(world, world.mine);

    const res = await world.organiserApi.patch(`/rounds/${world.round.id}/answers/${answer.id}`).send({ is_correct: true, points_awarded: 7.5 });

    expect(expectOk(res)).toEqual({ result: { answerId: answer.id, is_correct: true, points_awarded: 7.5 } });
    expect(await prisma.answers.findUnique({ where: { id: answer.id } })).toMatchObject({ marked_by: world.organiser.id, marked_at: expect.any(Date) });
    expect((await prisma.submissions.findUnique({ where: { id: world.mine.id } })).status).toBe("marked");
    const result = await prisma.results.findFirst({ where: { entrant_id: world.ayanda.id } });
    expect(String(result.total_points)).toBe("11.5");
  });

  it("caps the mark at the question's maximum", async () => {
    const world = await withSubmissions();
    const answer = await essayAnswerOf(world, world.mine);
    const res = await world.educatorApi.patch(`/rounds/${world.round.id}/answers/${answer.id}`).send({ is_correct: true, points_awarded: 50 });
    expect(expectOk(res).result.points_awarded).toBe(10);
  });

  it("won't let an educator mark another school's learner", async () => {
    const world = await withSubmissions();
    const answer = await essayAnswerOf(world, world.theirs);

    const res = await world.educatorApi.patch(`/rounds/${world.round.id}/answers/${answer.id}`).send({ is_correct: true, points_awarded: 10 });

    expectError(res, 403, "Not your school's submission");
    expect((await prisma.answers.findUnique({ where: { id: answer.id } })).marked_at).toBeNull();
  });

  it("won't let an organiser mark a round they don't own", async () => {
    const world = await withSubmissions();
    const answer = await essayAnswerOf(world, world.mine);
    const res = await world.otherOrganiserApi.patch(`/rounds/${world.round.id}/answers/${answer.id}`).send({ is_correct: true, points_awarded: 10 });
    expectError(res, 403, "Not your round");
    expect((await prisma.answers.findUnique({ where: { id: answer.id } })).points_awarded).toBeNull();
  });

  it("won't mark an answer through a different round the marker has access to", async () => {
    const world = await withSubmissions();
    const answer = await essayAnswerOf(world, world.mine);
    const ownRound = await f.createRound({ olympiad: await f.createOlympiad({ organiser: world.organiser }) });

    const res = await world.organiserApi.patch(`/rounds/${ownRound.id}/answers/${answer.id}`).send({ is_correct: true, points_awarded: 10 });

    expectError(res, 404, "Answer not found");
  });

  it("responds 404 for an unknown answer", async () => {
    const { round, organiserApi } = await withSubmissions();
    expectError(await organiserApi.patch(`/rounds/${round.id}/answers/${MISSING}`).send({ is_correct: false, points_awarded: 0 }), 404, "Answer not found");
  });

  it.each([
    [{ points_awarded: 1 }, "is_correct (boolean) is required"],
    [{ is_correct: true, points_awarded: -1 }, "points_awarded must be >= 0"],
    [{ is_correct: "yes", points_awarded: 1 }, "is_correct (boolean) is required"],
  ])("responds 422 for %o", async (body, message) => {
    const world = await withSubmissions();
    const answer = await essayAnswerOf(world, world.mine);
    expectError(await world.organiserApi.patch(`/rounds/${world.round.id}/answers/${answer.id}`).send(body), 422, message);
  });
});

describe("POST /rounds/:roundId/results", () => {
  it("ranks the entrants, applies the qualifying threshold and releases the results", async () => {
    const world = await withSubmissions({ qualifying_threshold: 10 });
    await prisma.rounds.update({ where: { id: world.round.id }, data: { state: "marking" } });
    const [ayandaEssay, leratoEssay] = await Promise.all([
      prisma.answers.findFirst({ where: { submission_id: world.mine.id, question_id: world.essay.id } }),
      prisma.answers.findFirst({ where: { submission_id: world.theirs.id, question_id: world.essay.id } }),
    ]);
    expectOk(await world.organiserApi.patch(`/rounds/${world.round.id}/answers/${ayandaEssay.id}`).send({ is_correct: true, points_awarded: 9 }));
    expectOk(await world.organiserApi.patch(`/rounds/${world.round.id}/answers/${leratoEssay.id}`).send({ is_correct: false, points_awarded: 2 }));

    const { result } = expectOk(await world.organiserApi.post(`/rounds/${world.round.id}/results`));

    expect(result).toEqual({ roundId: world.round.id, entrantCount: 2, threshold: 10, state: "results_released" });
    const results = await prisma.results.findMany({ orderBy: { rank: "asc" } });
    expect(results.map((r) => [r.entrant_id, r.rank, r.qualified, String(r.total_points)])).toEqual([
      [world.ayanda.id, 1, true, "13"],
      [world.lerato.id, 2, false, "6"],
    ]);
    expect((await prisma.rounds.findUnique({ where: { id: world.round.id } })).state).toBe("results_released");
  });

  it("responds 400 while the round is still open", async () => {
    const { round, organiserApi } = await withSubmissions();
    expectError(await organiserApi.post(`/rounds/${round.id}/results`), 400, 'Cannot release results — round is "open"');
  });

  it("responds 400 when nobody has submitted", async () => {
    const { round, organiserApi } = await setup({ state: "closed" });
    expectError(await organiserApi.post(`/rounds/${round.id}/results`), 400, "No results to generate — no submissions found");
  });

  it("responds 403 to another organiser and 404 for an unknown round", async () => {
    const { round, organiserApi, otherOrganiserApi } = await withSubmissions({ state: "closed" });
    expectError(await otherOrganiserApi.post(`/rounds/${round.id}/results`), 403, "Not your round");
    expectError(await organiserApi.post(`/rounds/${MISSING}/results`), 404, "Round not found");
    expect(await prisma.results.count({ where: { rank: { not: null } } })).toBe(0);
  });
});
