// Marking moderation (I7): the organiser reviews a stable sample of answers
// that were marked by hand, and may revise a mark, which recalculates results.
// A marker can't moderate their own marking.
const prisma = require("../../src/config/database").default;
const f = require("../integration/helpers/factories");
const { as, expectError, expectOk } = require("./helpers/api");

const MISSING = "00000000-0000-4000-8000-000000000000";

// A round in marking with an essay out of 10. `count` learners each have one
// answer marked by the school's educator, a minute apart.
const setup = async ({ count = 1 } = {}) => {
  const world = await f.createOlympiadWithSchool();
  const { olympiad, school, educatorUser } = world;
  const round = await f.createRound({ olympiad, state: "marking", opens_at: f.hoursFromNow(-48), closes_at: f.hoursFromNow(-24) });
  const { questions: [essay] } = await f.createPaper({ round, questions: [{ type: "essay", max_points: 10, prompt: "Prove there are infinitely many primes." }] });

  const answers = [];
  for (let i = 0; i < count; i++) {
    const entrant = await f.createEntrant({ school, full_name: `Learner ${i}` });
    const submission = await prisma.submissions.create({
      data: { round_id: round.id, entrant_id: entrant.id, route: "offline", status: "marked", idempotency_key: `k-${entrant.id}`, round_close_snapshot: round.closes_at },
    });
    answers.push(await prisma.answers.create({
      data: {
        submission_id: submission.id, question_id: essay.id, answer_value: "…",
        points_awarded: 6, marked_by: educatorUser.id, marked_at: new Date(Date.UTC(2026, 8, 20, 10, i)),
      },
    }));
    await prisma.results.create({ data: { round_id: round.id, entrant_id: entrant.id, total_points: 6 } });
  }
  return { ...world, round, essay, answers, organiserApi: as(world.organiser), otherOrganiserApi: as(await f.createOrganiser()) };
};

describe("GET /rounds/:roundId/review-sample", () => {
  it("shows a hand-marked answer with its learner, question and review count", async () => {
    const { round, answers, organiserApi } = await setup();

    const { sample } = expectOk(await organiserApi.get(`/rounds/${round.id}/review-sample`));
    expect(sample).toEqual([
      expect.objectContaining({
        id: answers[0].id,
        points_awarded: "6",
        questions: { prompt: "Prove there are infinitely many primes.", max_points: "10" },
        submissions: { entrants: { full_name: "Learner 0" } },
        marking_reviews: [],
      }),
    ]);
  });

  it("samples every tenth answer, newest first, and the same ones on every load", async () => {
    const { round, answers, organiserApi } = await setup({ count: 21 });

    const first = expectOk(await organiserApi.get(`/rounds/${round.id}/review-sample`)).sample.map((a) => a.id);
    const again = expectOk(await organiserApi.get(`/rounds/${round.id}/review-sample`)).sample.map((a) => a.id);
    // Newest first: answers[20], answers[10], answers[0]
    expect(first).toEqual([answers[20].id, answers[10].id, answers[0].id]);
    expect(again).toEqual(first);
  });

  it("leaves out answers nobody has marked by hand", async () => {
    const { round, answers, organiserApi } = await setup();
    await prisma.answers.update({ where: { id: answers[0].id }, data: { marked_by: null } });
    expect(expectOk(await organiserApi.get(`/rounds/${round.id}/review-sample`))).toEqual({ sample: [] });
  });

  it("is only for the round's organiser", async () => {
    const { round, otherOrganiserApi, organiserApi } = await setup();
    expectError(await otherOrganiserApi.get(`/rounds/${round.id}/review-sample`), 403, "Not your round");
    expectError(await organiserApi.get(`/rounds/${MISSING}/review-sample`), 404, "Round not found");
  });
});

describe("PATCH /rounds/:roundId/review-sample/:answerId", () => {
  it("revises the mark, records the review, and recalculates the learner's result", async () => {
    const { round, answers, organiser, organiserApi } = await setup();

    expectOk(await organiserApi.patch(`/rounds/${round.id}/review-sample/${answers[0].id}`).send({ points_awarded: 8, comment: "Marked too harshly" }));

    expect(Number((await prisma.answers.findUnique({ where: { id: answers[0].id } })).points_awarded)).toBe(8);
    expect(await prisma.marking_reviews.findMany()).toEqual([
      expect.objectContaining({ answer_id: answers[0].id, reviewer_id: organiser.id, comment: "Marked too harshly" }),
    ]);
    const [review] = await prisma.marking_reviews.findMany();
    expect([Number(review.original_points), Number(review.revised_points)]).toEqual([6, 8]);
    expect(Number((await prisma.results.findFirst()).total_points)).toBe(8);
    expect(expectOk(await organiserApi.get(`/rounds/${round.id}/review-sample`)).sample[0].marking_reviews).toHaveLength(1);
  });

  it("won't let a marker moderate their own marking", async () => {
    const { round, answers, organiser, organiserApi } = await setup();
    await prisma.answers.update({ where: { id: answers[0].id }, data: { marked_by: organiser.id } });

    expectError(
      await organiserApi.patch(`/rounds/${round.id}/review-sample/${answers[0].id}`).send({ points_awarded: 8, comment: "Second look" }),
      403,
      "A marker cannot moderate their own marking",
    );
    expect(await prisma.marking_reviews.count()).toBe(0);
  });

  it("needs points within the question's maximum and a comment", async () => {
    const { round, answers, organiserApi } = await setup();
    const url = `/rounds/${round.id}/review-sample/${answers[0].id}`;
    const message = "Valid points and a review comment are required";

    expectError(await organiserApi.patch(url).send({ points_awarded: 11, comment: "Too high" }), 400, message);
    expectError(await organiserApi.patch(url).send({ points_awarded: -1, comment: "Negative" }), 400, message);
    expectError(await organiserApi.patch(url).send({ points_awarded: 8, comment: "   " }), 400, message);
    expectError(await organiserApi.patch(url).send({ comment: "No points" }), 400, message);
    expect(Number((await prisma.answers.findUnique({ where: { id: answers[0].id } })).points_awarded)).toBe(6);
  });

  it("only reviews marked answers from this round", async () => {
    const { round, answers, olympiad, organiserApi } = await setup();
    const otherRound = await f.createRound({ olympiad });
    const message = "Marked answer not found";

    expectError(await organiserApi.patch(`/rounds/${otherRound.id}/review-sample/${answers[0].id}`).send({ points_awarded: 8, comment: "Wrong round" }), 404, message);
    await prisma.answers.update({ where: { id: answers[0].id }, data: { marked_at: null } });
    expectError(await organiserApi.patch(`/rounds/${round.id}/review-sample/${answers[0].id}`).send({ points_awarded: 8, comment: "Unmarked" }), 404, message);
  });

  it("is only for the round's organiser", async () => {
    const { round, answers, otherOrganiserApi } = await setup();
    expectError(await otherOrganiserApi.patch(`/rounds/${round.id}/review-sample/${answers[0].id}`).send({ points_awarded: 8, comment: "Not mine" }), 403, "Not your round");
  });

  it("moderates an answer marked by an educator and recalculates results", async () => {
    const { round, essay, school, educatorUser, organiserApi } = await setup();
    const educatorApi = as(educatorUser);

    const entrant = await f.createEntrant({ school, full_name: "Educator Student" });
    const submission = await prisma.submissions.create({
      data: { round_id: round.id, entrant_id: entrant.id, route: "online", status: "queued_for_marking", idempotency_key: `k-${entrant.id}`, round_close_snapshot: round.closes_at },
    });
    const answer = await prisma.answers.create({
      data: {
        submission_id: submission.id,
        question_id: essay.id,
        answer_value: "My solution",
        points_awarded: null,
        marked_by: null,
        marked_at: null,
      },
    });

    // 1. Educator marks the answer
    expectOk(await educatorApi.patch(`/rounds/${round.id}/answers/${answer.id}`).send({
      is_correct: true,
      points_awarded: 7,
    }));

    // 2. Organiser sees the educator-marked answer in the moderation sample
    const { sample } = expectOk(await organiserApi.get(`/rounds/${round.id}/review-sample`));
    const sampledAnswer = sample.find((a) => a.id === answer.id);
    expect(sampledAnswer).toBeDefined();
    expect(sampledAnswer.marked_by).toBe(educatorUser.id);
    expect(sampledAnswer.users.id).toBe(educatorUser.id);

    // 3. Organiser moderates the educator's mark
    expectOk(
      await organiserApi.patch(`/rounds/${round.id}/review-sample/${answer.id}`).send({
        points_awarded: 9,
        comment: "Excellent proof, giving higher marks.",
      }),
    );

    // 4. Verify points updated and review recorded
    const updated = await prisma.answers.findUnique({ where: { id: answer.id } });
    expect(Number(updated.points_awarded)).toBe(9);

    const reviews = await prisma.marking_reviews.findMany({ where: { answer_id: answer.id } });
    expect(reviews).toHaveLength(1);
    expect(reviews[0].comment).toBe("Excellent proof, giving higher marks.");
  });
});
