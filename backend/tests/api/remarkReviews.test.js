// Educator remark reviews: the organiser assigns a student's remark request
// to an educator from another school, who re-marks the answers. A re-mark
// recalculates the whole round, just as an organiser's decision does.
const prisma = require("../../src/config/database").default;
const f = require("../integration/helpers/factories");
const { as, expectError, expectOk } = require("./helpers/api");

const REASON = "My proof was complete but I only got half marks";

// A released round (qualifying at 8) with an essay out of 10 and two
// students of the home school: Ayanda on 5, ranked second, and Lerato on 7,
// ranked first. A later round is open for entry. A second registered school
// has its own educator, who can review the home school's remarks.
const setup = async () => {
  const world = await f.createOlympiadWithSchool();
  const { olympiad, school, educator } = world;
  const round = await f.createRound({ olympiad, state: "results_released", qualifying_threshold: 8, opens_at: f.hoursFromNow(-48), closes_at: f.hoursFromNow(-24) });
  const nextRound = await f.createRound({ olympiad, state: "scheduled", opens_at: f.hoursFromNow(24), closes_at: f.hoursFromNow(26) });
  const { questions: [essay] } = await f.createPaper({ round, questions: [{ type: "essay", max_points: 10 }] });

  const sat = async (points, rank) => {
    const { user, entrant } = await f.createStudent({ school });
    await f.registerEntrant({ entrant, round, educator });
    const submission = await prisma.submissions.create({
      data: { round_id: round.id, entrant_id: entrant.id, route: "online", status: "marked", idempotency_key: `k-${entrant.id}`, round_close_snapshot: round.closes_at },
    });
    const answer = await prisma.answers.create({
      data: { submission_id: submission.id, question_id: essay.id, answer_value: "…", points_awarded: points, marked_at: new Date() },
    });
    const result = await prisma.results.create({
      data: { round_id: round.id, entrant_id: entrant.id, total_points: points, rank, qualified: false, finalised_at: new Date() },
    });
    return { user, entrant, answer, result, api: as(user) };
  };

  const otherSchool = await f.createSchool();
  await f.registerSchool(otherSchool, olympiad);
  const { user: otherEducatorUser } = await f.createEducator({ school: otherSchool });

  const ayanda = await sat(5, 2);
  const lerato = await sat(7, 1);
  const remark = expectOk(await ayanda.api.post(`/rounds/${round.id}/remark`).send({ reason: REASON }), 201).remark;

  return {
    ...world,
    round,
    nextRound,
    ayanda,
    lerato,
    remark,
    homeEducatorApi: as(world.educatorUser),
    otherEducatorUser,
    otherEducatorApi: as(otherEducatorUser),
    organiserApi: as(world.organiser),
  };
};

describe("assigning a remark", () => {
  it("never goes to an educator from the learner's own school", async () => {
    const { remark, educatorUser, otherEducatorUser, organiserApi } = await setup();

    expectError(
      await organiserApi.patch(`/organiser/remarks/${remark.id}/assign`).send({ reviewerId: educatorUser.id }),
      400, "An educator cannot review a remark from a learner at their own school",
    );
    expect((await prisma.remark_requests.findFirst()).reviewer_id).toBeNull();

    expectOk(await organiserApi.patch(`/organiser/remarks/${remark.id}/assign`).send({ reviewerId: otherEducatorUser.id }));
    expect((await prisma.remark_requests.findFirst()).reviewer_id).toBe(otherEducatorUser.id);
  });

  it("auto-assigns only to educators from another school", async () => {
    const { round, otherEducatorUser, organiserApi } = await setup();

    expect(expectOk(await organiserApi.post(`/organiser/remarks/rounds/${round.id}/auto-assign`)))
      .toMatchObject({ assignedCount: 1, skippedCount: 0 });
    expect((await prisma.remark_requests.findFirst()).reviewer_id).toBe(otherEducatorUser.id);
  });

  it("leaves a remark unassigned when only the learner's own school could review it", async () => {
    const { round, otherEducatorUser, organiserApi } = await setup();
    await prisma.school_memberships.deleteMany({ where: { user_id: otherEducatorUser.id } });
    await prisma.educators.deleteMany({ where: { user_id: otherEducatorUser.id } });

    expect(expectOk(await organiserApi.post(`/organiser/remarks/rounds/${round.id}/auto-assign`)))
      .toMatchObject({ assignedCount: 0, skippedCount: 1 });
    expect((await prisma.remark_requests.findFirst()).reviewer_id).toBeNull();
  });
});

describe("an educator's re-mark", () => {
  const assigned = async () => {
    const world = await setup();
    await prisma.remark_requests.update({ where: { id: world.remark.id }, data: { reviewer_id: world.otherEducatorUser.id } });
    return world;
  };

  it("recalculates ranks, qualification and next-round entry, and records the review", async () => {
    const { remark, ayanda, lerato, nextRound, otherEducatorUser, otherEducatorApi } = await assigned();

    const data = expectOk(await otherEducatorApi.patch(`/educator/remarks/${remark.id}/answers/${ayanda.answer.id}`).send({ points_awarded: 9 }));
    expect(data).toMatchObject({ pointsAwarded: 9, totalPoints: 9 });

    const results = await prisma.results.findMany({ orderBy: { rank: "asc" } });
    expect(results.map((r) => [r.entrant_id, Number(r.total_points), r.rank, r.qualified])).toEqual([
      [ayanda.entrant.id, 9, 1, true],
      [lerato.entrant.id, 7, 2, false],
    ]);
    const entered = await prisma.entrant_registrations.findMany({ where: { round_id: nextRound.id } });
    expect(entered.map((r) => r.entrant_id)).toEqual([ayanda.entrant.id]);
    expect(await prisma.marking_reviews.findMany()).toEqual([
      expect.objectContaining({ answer_id: ayanda.answer.id, reviewer_id: otherEducatorUser.id }),
    ]);
  });

  it("is shown to the student as reviewed, without reading the note as an organiser decision", async () => {
    const { round, remark, ayanda, otherEducatorApi } = await assigned();

    expectOk(await otherEducatorApi.patch(`/educator/remarks/${remark.id}`).send({ status: "reviewed", review_note: "approved: full marks were deserved" }));

    expect(expectOk(await ayanda.api.get(`/rounds/${round.id}/my-remark`)).remark)
      .toMatchObject({ status: "reviewed", decision: null, review_note: "approved: full marks were deserved" });
  });

  it("can only be concluded once", async () => {
    const { remark, ayanda, otherEducatorApi } = await assigned();
    expectOk(await otherEducatorApi.patch(`/educator/remarks/${remark.id}`).send({ status: "reviewed" }));

    expectError(await otherEducatorApi.patch(`/educator/remarks/${remark.id}`).send({ status: "reviewed" }), 400, "This remark has already been reviewed");
    expectError(
      await otherEducatorApi.patch(`/educator/remarks/${remark.id}/answers/${ayanda.answer.id}`).send({ points_awarded: 9 }),
      400, "Cannot adjust marks on an already reviewed remark",
    );
  });
});
