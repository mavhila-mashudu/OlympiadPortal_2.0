// A1: every round-open and round-close event handled correctly under peak
// simultaneous load. Each scenario piles many things onto the same instant
// (rounds due together, learners submitting in the second a round closes,
// lifecycle ticks and email passes running at once) and then checks the
// outcome exactly, not merely that nothing failed.
// Emails are "sent" by a stand-in that takes a moment, like a real request,
// so passes running at once genuinely overlap. It records who it emailed (a
// plain function, since the shared test setup resets jest.fn mocks). It must
// come before the requires below: these test files aren't transpiled, so
// jest.mock isn't hoisted.
jest.mock("../../src/lib/mailer", () => {
  const emailed = [];
  return {
    emailed,
    isMailerConfigured: () => true,
    sendNotificationEmail: async ({ to }) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      emailed.push(to);
      return { delivered: true };
    },
  };
});
const { emailed } = require("../../src/lib/mailer");
const prisma = require("../../src/config/database").default;
const f = require("../integration/helpers/factories");
const { as } = require("./helpers/api");
const { runLifecycleTick } = require("../../src/services/lifecycleService");
const { processDueNotifications } = require("../../src/services/notificationDispatchService");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = (moment) => sleep(Math.max(0, moment.getTime() - Date.now()));
const range = (n) => Array.from({ length: n }, (_, i) => i);
const LONG = 120_000;

beforeEach(() => {
  emailed.length = 0;
});

// How many audit events of a kind each round has
const eventCounts = async (kind) => {
  const events = await prisma.round_events.findMany({ where: { kind }, select: { round_id: true } });
  return events.reduce((counts, e) => counts.set(e.round_id, (counts.get(e.round_id) ?? 0) + 1), new Map());
};

describe("rounds due at the same instant", () => {
  it("opens and closes each round exactly once while three ticks run at once", async () => {
    const olympiad = await f.createOlympiad();
    const opening = [];
    const closing = [];
    for (const i of range(20)) {
      opening.push(await f.createRound({ olympiad, name: `Opening ${i}`, state: "scheduled", opens_at: f.hoursFromNow(-0.01), closes_at: f.hoursFromNow(2) }));
      closing.push(await f.createRound({ olympiad, name: `Closing ${i}`, state: "open", opens_at: f.hoursFromNow(-2), closes_at: f.hoursFromNow(-0.01) }));
    }

    await Promise.all([runLifecycleTick(), runLifecycleTick(), runLifecycleTick()]);

    const states = new Map((await prisma.rounds.findMany({ select: { id: true, state: true, closed_at: true } })).map((r) => [r.id, r]));
    expect(opening.every((r) => states.get(r.id).state === "open")).toBe(true);
    expect(closing.every((r) => states.get(r.id).state === "closed" && states.get(r.id).closed_at)).toBe(true);

    const opened = await eventCounts("round_opened");
    const closed = await eventCounts("round_closed");
    const marked = await eventCounts("round_automarked");
    expect(opening.map((r) => opened.get(r.id))).toEqual(opening.map(() => 1));
    expect(closing.map((r) => closed.get(r.id))).toEqual(closing.map(() => 1));
    expect(closing.map((r) => marked.get(r.id))).toEqual(closing.map(() => 1));
  }, LONG);
});

describe("learners submitting in the second a round closes", () => {
  // A live round with two short-answer questions, and learners who have all
  // started the exam and saved a wrong first answer
  const crowdedRound = async (count) => {
    const { olympiad, school, educator } = await f.createOlympiadWithSchool();
    const round = await f.createRound({
      olympiad, state: "open", exam_status: "live", opens_at: f.hoursFromNow(-1), closes_at: f.hoursFromNow(1),
    });
    const { questions: [capital, sum] } = await f.createPaper({
      round,
      questions: [
        { type: "short_answer", prompt: "Capital of South Africa?", correct_answer: "Pretoria", max_points: 2 },
        { type: "short_answer", prompt: "2 + 2?", correct_answer: "4", max_points: 1 },
      ],
    });
    const students = [];
    for (const _ of range(count)) {
      const { user, entrant } = await f.createStudent({ school });
      await f.registerEntrant({ entrant, round, educator });
      students.push({ entrant, api: as(user) });
    }
    for (const s of students) {
      expect((await s.api.post(`/rounds/${round.id}/exam/start`)).status).toBe(201);
      expect((await s.api.patch(`/rounds/${round.id}/exam/answers/${capital.id}`).send({ answer_value: "Cape Town" })).status).toBe(200);
    }
    const save = (s, value) => s.api.patch(`/rounds/${round.id}/exam/answers/${capital.id}`).send({ answer_value: value });
    const submit = (s) => s.api.post(`/rounds/${round.id}/exam/submit`);
    return { round, capital, sum, students, save, submit };
  };

  // Marks every answer is expected to carry, from the answer it holds
  const expectedPoints = (answer, capital) =>
    (answer.answer_value ?? "").trim().toLowerCase() === (answer.question_id === capital.id ? "pretoria" : "4")
      ? (answer.question_id === capital.id ? 2 : 1)
      : 0;

  it("counts everything that arrived before the close, nothing after, and marks every sitting once", async () => {
    const { round, capital, students, save, submit } = await crowdedRound(45);
    const early = students.slice(0, 15);
    const edge = students.slice(15, 30);
    const late = students.slice(30);

    // The deadline is set a few seconds out, now that everyone is sitting
    const closesAt = new Date(Date.now() + 4000);
    await prisma.rounds.update({ where: { id: round.id }, data: { closes_at: closesAt } });

    const answerAndSubmit = async (s) => ({ saved: await save(s, "Pretoria"), submitted: await submit(s) });
    const earlyDone = Promise.all(early.map(answerAndSubmit));
    // The edge group goes in the last moments, and two ticks close the round
    // just after the deadline while those requests are still being handled
    await until(new Date(closesAt.getTime() - 150));
    const edgeDone = Promise.all(edge.map(answerAndSubmit));
    await until(new Date(closesAt.getTime() + 5));
    const ticks = Promise.all([runLifecycleTick(), runLifecycleTick()]);
    await until(new Date(closesAt.getTime() + 300));
    const lateDone = Promise.all(late.map(answerAndSubmit));

    const [earlyRes, , lateRes] = await Promise.all([earlyDone, edgeDone, lateDone, ticks]);
    // A later tick picks up anything the close left behind
    await runLifecycleTick();

    // Well before the deadline: every answer saved and every submission accepted
    expect(earlyRes.map((r) => [r.saved.status, r.submitted.status])).toEqual(early.map(() => [200, 200]));
    // After it: neither the answer change nor the submission counts
    expect(lateRes.map((r) => [r.saved.status, r.submitted.status])).toEqual(late.map(() => [400, 400]));

    // Every ruling agrees with the moment its request arrived, and no learner
    // has more than one submission accepted
    const decisions = await prisma.submission_deadline_decisions.findMany({ where: { round_id: round.id } });
    for (const d of decisions) expect([d.entrant_id, d.accepted]).toEqual([d.entrant_id, d.decided_at < closesAt]);
    const acceptedPerLearner = decisions.filter((d) => d.accepted).reduce((m, d) => m.set(d.entrant_id, (m.get(d.entrant_id) ?? 0) + 1), new Map());
    expect([...acceptedPerLearner.values()].every((n) => n === 1)).toBe(true);
    expect(early.every((s) => acceptedPerLearner.get(s.entrant.id) === 1)).toBe(true);

    // Every learner has one sitting, marked, and one result that adds up
    const submissions = await prisma.submissions.findMany({ where: { round_id: round.id }, include: { answers: true } });
    expect(submissions).toHaveLength(students.length);
    expect(submissions.filter((s) => s.status === "received")).toEqual([]);
    const results = new Map((await prisma.results.findMany({ where: { round_id: round.id } })).map((r) => [r.entrant_id, Number(r.total_points)]));
    expect(results.size).toBe(students.length);
    for (const sub of submissions) {
      // Each mark matches the answer actually stored: no answer changed after it was marked
      for (const a of sub.answers) {
        expect(a.marked_at).not.toBeNull();
        expect([a.answer_value, Number(a.points_awarded)]).toEqual([a.answer_value, expectedPoints(a, capital)]);
      }
      expect(results.get(sub.entrant_id)).toBe(sub.answers.reduce((n, a) => n + Number(a.points_awarded), 0));
    }
    // The early learners' change counted; the late learners' didn't
    const capitalAnswer = (s) => submissions.find((x) => x.entrant_id === s.entrant.id).answers.find((a) => a.question_id === capital.id).answer_value;
    expect(early.map(capitalAnswer)).toEqual(early.map(() => "Pretoria"));
    expect(late.map(capitalAnswer)).toEqual(late.map(() => "Cape Town"));

    // The round closed once
    const closedRound = await prisma.rounds.findUnique({ where: { id: round.id } });
    expect(closedRound.state).toBe("closed");
    expect((await eventCounts("round_closed")).get(round.id)).toBe(1);
  }, LONG);

  it("counts a double-clicked submit once", async () => {
    const { round, students, submit } = await crowdedRound(10);

    const pairs = await Promise.all(students.map((s) => Promise.all([submit(s), submit(s)])));

    expect(pairs.map((p) => p.map((r) => r.status).sort())).toEqual(students.map(() => [200, 400]));
    for (const p of pairs) {
      expect(p.find((r) => r.status === 400).body.error).toBe("This exam has already been submitted");
    }
    const accepted = await prisma.submission_deadline_decisions.count({ where: { round_id: round.id, accepted: true } });
    expect(accepted).toBe(students.length);
    expect(await prisma.results.count({ where: { round_id: round.id } })).toBe(students.length);
  }, LONG);
});

describe("sittings the close left behind", () => {
  it("marks a sitting saved after the close-time marking had run", async () => {
    const { olympiad, school, educator } = await f.createOlympiadWithSchool();
    const round = await f.createRound({ olympiad, state: "closed", closed_at: f.hoursFromNow(-0.01), opens_at: f.hoursFromNow(-2), closes_at: f.hoursFromNow(-0.01) });
    const { questions: [capital] } = await f.createPaper({ round, questions: [{ type: "short_answer", correct_answer: "Pretoria", max_points: 2 }] });
    const { entrant } = await f.createStudent({ school });
    await f.registerEntrant({ entrant, round, educator });
    const sitting = await prisma.submissions.create({
      data: { round_id: round.id, entrant_id: entrant.id, route: "online", status: "received", idempotency_key: `k-${entrant.id}`, round_close_snapshot: round.closes_at },
    });
    await prisma.answers.create({ data: { submission_id: sitting.id, question_id: capital.id, answer_value: "Pretoria" } });

    await runLifecycleTick();

    expect((await prisma.submissions.findUnique({ where: { id: sitting.id } })).status).toBe("automarked");
    expect(Number((await prisma.results.findFirst({ where: { entrant_id: entrant.id } })).total_points)).toBe(2);
    expect((await eventCounts("late_sittings_automarked")).get(round.id)).toBe(1);
  }, LONG);
});

describe("emails when a round opens", () => {
  it("emails each educator once while three passes run at once", async () => {
    const { olympiad, school } = await f.createOlympiadWithSchool();
    for (const _ of range(12)) await f.createEducator({ school });
    // Opened a minute ago, so the "round is now open" notice is due
    const round = await f.createRound({ olympiad, state: "open", opens_at: f.hoursFromNow(-1 / 60), closes_at: f.hoursFromNow(2) });

    await Promise.all([processDueNotifications(), processDueNotifications(), processDueNotifications()]);

    expect(emailed).toHaveLength(13);
    expect(new Set(emailed).size).toBe(13);
    expect(await prisma.sent_notifications.count({ where: { round_id: round.id } })).toBe(13);

    // And a later pass has nothing left to send
    await processDueNotifications();
    expect(emailed).toHaveLength(13);
  }, LONG);
});
