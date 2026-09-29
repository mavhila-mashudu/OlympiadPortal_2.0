// Offline submissions, auto-marking, the manual marking queue, final results
// and the automatic round lifecycle, against the real database.
const prisma = require("../../src/config/database").default;
const submissionService = require("../../src/services/submissionService");
const markingService = require("../../src/services/markingService");
const { runLifecycleTick } = require("../../src/services/lifecycleService");
const f = require("./helpers/factories");

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

// An open round with MCQ + essay, a registered school, two entrants
const setup = async ({ threshold } = {}) => {
  const world = await f.createOlympiadWithSchool();
  const round = await f.createRound({
    olympiad: world.olympiad,
    state: "open",
    opens_at: f.hoursFromNow(-2),
    closes_at: f.hoursFromNow(2),
    qualifying_threshold: threshold,
  });
  const { paper, questions } = await f.createPaper({
    round,
    questions: [
      { type: "mcq", options: ["a", "b", "c"], correct_option: "1", max_points: 5 },
      { type: "essay", max_points: 10 },
    ],
  });
  const ayanda = await f.createEntrant({ school: world.school, full_name: "Ayanda" });
  const ben = await f.createEntrant({ school: world.school, full_name: "Ben" });
  for (const entrant of [ayanda, ben]) await f.registerEntrant({ entrant, round, educator: world.educator });
  const [mcq, essay] = questions;
  return { ...world, round, paper, mcq, essay, ayanda, ben };
};

const pointsOf = async (roundId, entrantId) =>
  String(
    (await prisma.results.findUnique({ where: { round_id_entrant_id: { round_id: roundId, entrant_id: entrantId } } }))
      .total_points,
  );

describe("offline submissions", () => {
  it("stores an educator's captured answers and marks the objective ones", async () => {
    const { round, educatorUser, educator, ayanda, mcq, essay } = await setup();

    const result = await submissionService.createSubmission(round.id, educatorUser.id, {
      entrant_id: ayanda.id,
      answers: [
        { question_id: mcq.id, answer_value: "1" },
        { question_id: essay.id, answer_value: "Handwritten essay, typed up" },
      ],
    });

    expect(result).toMatchObject({ totalPoints: 5, allAutoMarked: false });
    const stored = await prisma.submissions.findUnique({ where: { id: result.submission.id }, include: { answers: true } });
    expect(stored).toMatchObject({ route: "offline", status: "received", submitted_by: educator.id });
    expect(stored.answers).toHaveLength(2);
    expect(await pointsOf(round.id, ayanda.id)).toBe("5");
  });

  it("rejects a second capture for the same learner, keeping the first", async () => {
    const { round, educatorUser, ayanda, mcq } = await setup();
    const body = { entrant_id: ayanda.id, answers: [{ question_id: mcq.id, answer_value: "1" }] };

    await submissionService.createSubmission(round.id, educatorUser.id, body);
    await expect(submissionService.createSubmission(round.id, educatorUser.id, body)).rejects.toMatchObject({
      statusCode: 409,
    });
    // Naming the default route explicitly is still the same capture
    await expect(
      submissionService.createSubmission(round.id, educatorUser.id, { ...body, route: "offline" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await prisma.submissions.count()).toBe(1);
  });

  it("won't capture answers for a learner who isn't registered for the round", async () => {
    const { round, school, educatorUser, mcq } = await setup();
    const unregistered = await f.createEntrant({ school });

    await expect(
      submissionService.createSubmission(round.id, educatorUser.id, {
        entrant_id: unregistered.id,
        answers: [{ question_id: mcq.id, answer_value: "1" }],
      }),
    ).rejects.toMatchObject({ statusCode: 403, message: "Entrant is not registered for this round" });
    expect(await prisma.submissions.count()).toBe(0);
  });

  it("won't capture answers for a learner from another school", async () => {
    const { round, educatorUser, mcq } = await setup();
    const stranger = await f.createEntrant({ school: await f.createSchool() });

    await expect(
      submissionService.createSubmission(round.id, educatorUser.id, {
        entrant_id: stranger.id,
        answers: [{ question_id: mcq.id, answer_value: "1" }],
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(await prisma.submissions.count()).toBe(0);
  });

  it("scopes submission lists: organisers see everything, educators only their school", async () => {
    const { round, organiser, olympiad, educatorUser, ayanda, mcq } = await setup();
    const otherSchool = await f.createSchool();
    await f.registerSchool(otherSchool, olympiad);
    const otherTeacher = await f.createEducator({ school: otherSchool });
    const otherLearner = await f.createEntrant({ school: otherSchool });
    await f.registerEntrant({ entrant: otherLearner, round, educator: otherTeacher.educator });
    const answer = [{ question_id: mcq.id, answer_value: "0" }];

    const mine = await submissionService.createSubmission(round.id, educatorUser.id, { entrant_id: ayanda.id, answers: answer });
    await submissionService.createSubmission(round.id, otherTeacher.user.id, { entrant_id: otherLearner.id, answers: answer });

    expect(await submissionService.listSubmissions(round.id, organiser.id, "organiser")).toHaveLength(2);
    const educatorView = await submissionService.listSubmissions(round.id, educatorUser.id, "educator");
    expect(educatorView.map((s) => s.id)).toEqual([mine.submission.id]);
    expect(educatorView[0]._count.answers).toBe(1);

    await expect(
      submissionService.getSubmission(mine.submission.id, otherTeacher.user.id, "educator"),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("auto-marking and the marking queue", () => {
  const onlineSubmission = async ({ round, entrant, answers }) =>
    prisma.submissions.create({
      data: {
        round_id: round.id,
        entrant_id: entrant.id,
        route: "online",
        idempotency_key: `${round.id}:${entrant.id}:online`,
        round_close_snapshot: round.closes_at,
        answers: { create: answers },
      },
    });

  it("marks every received submission in a round and queues the essays", async () => {
    const { round, organiser, ayanda, ben, mcq, essay } = await setup();
    await onlineSubmission({
      round,
      entrant: ayanda,
      answers: [{ question_id: mcq.id, answer_value: "1" }, { question_id: essay.id, answer_value: "Essay A" }],
    });
    await onlineSubmission({ round, entrant: ben, answers: [{ question_id: mcq.id, answer_value: "2" }] });

    const report = await markingService.autoMarkRound(round.id, organiser.id, "organiser");

    expect(report.total).toBe(2);
    const statuses = Object.fromEntries(
      (await prisma.submissions.findMany()).map((s) => [s.entrant_id, s.status]),
    );
    expect(statuses).toEqual({ [ayanda.id]: "queued_for_marking", [ben.id]: "automarked" });
    expect(await pointsOf(round.id, ayanda.id)).toBe("5");
    expect(await pointsOf(round.id, ben.id)).toBe("0");

    // Running it again doesn't re-mark anything
    expect((await markingService.autoMarkRound(round.id, organiser.id, "organiser")).total).toBe(0);
  });

  it("puts only unmarked essays in the queue, and finishing them marks the submission", async () => {
    const { round, organiser, ayanda, mcq, essay } = await setup();
    const submission = await onlineSubmission({
      round,
      entrant: ayanda,
      answers: [{ question_id: mcq.id, answer_value: "1" }, { question_id: essay.id, answer_value: "Essay A" }],
    });
    await markingService.autoMarkSubmission(submission.id);

    const queue = await markingService.getMarkingQueue(round.id, organiser.id, "organiser");
    expect(queue).toHaveLength(1);
    expect(queue[0].entrants.full_name).toBe("Ayanda");
    expect(queue[0].answers.map((a) => a.question_id)).toEqual([essay.id]);

    const essayAnswer = queue[0].answers[0];
    const marked = await markingService.markAnswer(round.id, essayAnswer.id, organiser.id, "organiser", { is_correct: true, points_awarded: 7.5 });
    expect(marked.points_awarded).toBe(7.5);

    expect(await prisma.answers.findUnique({ where: { id: essayAnswer.id } })).toMatchObject({
      marked_by: organiser.id,
      is_correct: true,
    });
    expect(await pointsOf(round.id, ayanda.id)).toBe("12.5");
    expect((await prisma.submissions.findUnique({ where: { id: submission.id } })).status).toBe("marked");
    expect(await markingService.getMarkingQueue(round.id, organiser.id, "organiser")).toEqual([]);
  });

  it("caps a manual mark at the question's maximum", async () => {
    const { round, organiser, ayanda, essay } = await setup();
    const submission = await onlineSubmission({ round, entrant: ayanda, answers: [{ question_id: essay.id, answer_value: "x" }] });
    const [answer] = await prisma.answers.findMany({ where: { submission_id: submission.id } });

    await markingService.markAnswer(round.id, answer.id, organiser.id, "organiser", { is_correct: true, points_awarded: 99 });
    expect(await pointsOf(round.id, ayanda.id)).toBe("10");
  });

  it("shows an educator only their own school's marking", async () => {
    const { round, olympiad, educatorUser, ayanda, essay } = await setup();
    const otherSchool = await f.createSchool();
    await f.registerSchool(otherSchool, olympiad);
    const stranger = await f.createEntrant({ school: otherSchool });
    for (const entrant of [ayanda, stranger]) {
      const s = await onlineSubmission({ round, entrant, answers: [{ question_id: essay.id, answer_value: "x" }] });
      await prisma.submissions.update({ where: { id: s.id }, data: { status: "queued_for_marking" } });
    }

    const queue = await markingService.getMarkingQueue(round.id, educatorUser.id, "educator");
    expect(queue.map((s) => s.entrant_id)).toEqual([ayanda.id]);
  });
});

describe("final results", () => {
  it("ranks entrants, qualifies those at the threshold, releases the round and archives the paper", async () => {
    const { round, organiser, school, paper } = await setup({ threshold: "60" });
    await prisma.rounds.update({ where: { id: round.id }, data: { state: "marking" } });
    // The paper is out of 15, and the threshold is 60% of that: 9 marks
    const scores = { Low: "6", Top: "14", Borderline: "9" };
    for (const [name, points] of Object.entries(scores)) {
      const entrant = await f.createEntrant({ school, full_name: name });
      await prisma.results.create({ data: { round_id: round.id, entrant_id: entrant.id, total_points: points } });
    }

    const summary = await markingService.generateResults(round.id, organiser.id, "organiser");

    expect(summary).toMatchObject({ entrantCount: 3, threshold: 60, state: "results_released" });
    const results = await prisma.results.findMany({ include: { entrants: true }, orderBy: { rank: "asc" } });
    expect(results.map((r) => [r.entrants.full_name, r.rank, r.qualified])).toEqual([
      ["Top", 1, true],
      ["Borderline", 2, true],
      ["Low", 3, false],
    ]);
    expect(results.every((r) => r.finalised_at instanceof Date)).toBe(true);
    expect((await prisma.rounds.findUnique({ where: { id: round.id } })).state).toBe("results_released");
    expect(await prisma.papers.findUnique({ where: { id: paper.id } })).toMatchObject({ is_archived: true });
  });

  it("won't release results while the round is still open", async () => {
    const { round, organiser, ayanda } = await setup();
    await prisma.results.create({ data: { round_id: round.id, entrant_id: ayanda.id } });
    await expect(markingService.generateResults(round.id, organiser.id, "organiser")).rejects.toMatchObject({
      statusCode: 400,
    });
    expect((await prisma.results.findFirst()).rank).toBeNull();
  });
});

describe("automatic round lifecycle", () => {
  it("opens rounds whose time has come, closes finished ones, and marks their submissions", async () => {
    const olympiad = await f.createOlympiad();
    const school = await f.createSchool();
    const due = await f.createRound({ olympiad, opens_at: f.hoursFromNow(-0.1), closes_at: f.hoursFromNow(2) });
    const notYet = await f.createRound({ olympiad, opens_at: f.hoursFromNow(1), closes_at: f.hoursFromNow(2) });
    const finished = await f.createRound({
      olympiad,
      state: "open",
      opens_at: f.hoursFromNow(-3),
      closes_at: f.hoursFromNow(-0.1),
    });
    const { questions } = await f.createPaper({
      round: finished,
      questions: [{ type: "short_answer", correct_answer: "42", max_points: 3 }],
    });
    const entrant = await f.createEntrant({ school });
    await prisma.submissions.create({
      data: {
        round_id: finished.id,
        entrant_id: entrant.id,
        idempotency_key: "k",
        round_close_snapshot: finished.closes_at,
        answers: { create: [{ question_id: questions[0].id, answer_value: " 42 " }] },
      },
    });

    await expect(runLifecycleTick()).resolves.toEqual({ opened: 1, closed: 1 });

    const states = Object.fromEntries((await prisma.rounds.findMany()).map((r) => [r.id, r.state]));
    expect(states).toEqual({ [due.id]: "open", [notYet.id]: "scheduled", [finished.id]: "closed" });
    expect((await prisma.submissions.findFirst()).status).toBe("automarked");
    expect(await pointsOf(finished.id, entrant.id)).toBe("3");

    // A second tick has nothing left to do
    await expect(runLifecycleTick()).resolves.toEqual({ opened: 0, closed: 0 });
  });
});
