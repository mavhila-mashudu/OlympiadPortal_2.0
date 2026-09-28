// Remark requests (I8): a student asks for a released mark to be looked at
// again, and the organiser rejects it or approves a revised mark, which
// recalculates totals, ranks and who qualifies for the next round.
const prisma = require("../../src/config/database").default;
const f = require("../integration/helpers/factories");
const { as, expectError, expectOk } = require("./helpers/api");

const MISSING = "00000000-0000-4000-8000-000000000000";
const REASON = "My proof was complete but I only got half marks";

// A released round (qualifying at 8) with an essay out of 10, and two
// students: Ayanda on 5, ranked second and not qualified, and Lerato on 7,
// ranked first and not qualified either. A later round is open for entry.
const setup = async ({ state = "results_released" } = {}) => {
  const world = await f.createOlympiadWithSchool();
  const { olympiad, school, educator } = world;
  const round = await f.createRound({ olympiad, state, qualifying_threshold: 8, opens_at: f.hoursFromNow(-48), closes_at: f.hoursFromNow(-24) });
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

  return {
    ...world,
    round,
    nextRound,
    ayanda: await sat(5, 2),
    lerato: await sat(7, 1),
    organiserApi: as(world.organiser),
    otherOrganiserApi: as(await f.createOrganiser()),
  };
};

const requestRemark = async (student, round, reason = REASON) =>
  expectOk(await student.api.post(`/rounds/${round.id}/remark`).send({ reason }), 201).remark;

describe("POST /rounds/:roundId/remark", () => {
  it("records a pending request against the student's released result", async () => {
    const { round, ayanda } = await setup();

    const remark = await requestRemark(ayanda, round);
    expect(remark).toMatchObject({ round_id: round.id, entrant_id: ayanda.entrant.id, reason: REASON, status: "pending", decision: null });
  });

  it("allows one request per student per round", async () => {
    const { round, ayanda } = await setup();
    await requestRemark(ayanda, round);

    expectError(await ayanda.api.post(`/rounds/${round.id}/remark`).send({ reason: REASON }), 409, "You already requested a remark for this round");
    expect(await prisma.remark_requests.count()).toBe(1);
  });

  it("needs a reason of 10 to 2000 characters", async () => {
    const { round, ayanda } = await setup();
    const message = "Provide a reason of 10 to 2000 characters";

    expectError(await ayanda.api.post(`/rounds/${round.id}/remark`).send({ reason: "unfair" }), 400, message);
    expectError(await ayanda.api.post(`/rounds/${round.id}/remark`).send({ reason: "   too short   " }), 400, message);
    expectError(await ayanda.api.post(`/rounds/${round.id}/remark`).send({ reason: "x".repeat(2001) }), 400, message);
    expectError(await ayanda.api.post(`/rounds/${round.id}/remark`).send({}), 400, message);
    expect(await prisma.remark_requests.count()).toBe(0);
  });

  it("is only possible once results are released, and only for a round the student sat", async () => {
    const { round, ayanda, school } = await setup({ state: "marking" });
    const message = "Result not released for this student";
    expectError(await ayanda.api.post(`/rounds/${round.id}/remark`).send({ reason: REASON }), 403, message);

    const bystander = await f.createStudent({ school });
    await prisma.rounds.update({ where: { id: round.id }, data: { state: "results_released" } });
    expectError(await as(bystander.user).post(`/rounds/${round.id}/remark`).send({ reason: REASON }), 403, message);
    expect(await prisma.remark_requests.count()).toBe(0);
  });

  it("needs a student account linked to a learner", async () => {
    const { round } = await setup();
    const unlinked = await f.createUser("student");
    expectError(await as(unlinked).post(`/rounds/${round.id}/remark`).send({ reason: REASON }), 403, "No linked entrant profile");
  });
});

describe("GET /rounds/:roundId/my-remark", () => {
  it("shows the student their own request and its outcome, or null", async () => {
    const { round, ayanda, lerato, organiserApi } = await setup();
    expect(expectOk(await ayanda.api.get(`/rounds/${round.id}/my-remark`))).toEqual({ remark: null });

    const { id } = await requestRemark(ayanda, round);
    expect(expectOk(await ayanda.api.get(`/rounds/${round.id}/my-remark`)).remark).toMatchObject({ id, status: "pending", decision: null });
    // Another student doesn't see it
    expect(expectOk(await lerato.api.get(`/rounds/${round.id}/my-remark`))).toEqual({ remark: null });

    expectOk(await organiserApi.patch(`/rounds/${round.id}/remarks/${id}`).send({ status: "rejected", decision: "Marked correctly against the memo" }));
    expect(expectOk(await ayanda.api.get(`/rounds/${round.id}/my-remark`)).remark).toMatchObject({ status: "rejected", decision: "Marked correctly against the memo" });
  });
});

describe("GET /rounds/:roundId/remarks", () => {
  it("lists the round's requests, oldest first, with the answers the organiser may revise", async () => {
    const { round, ayanda, lerato, organiserApi } = await setup();
    await requestRemark(ayanda, round);
    await requestRemark(lerato, round, "Please check question one again");

    const { remarks } = expectOk(await organiserApi.get(`/rounds/${round.id}/remarks`));
    expect(remarks.map((r) => r.entrant_id)).toEqual([ayanda.entrant.id, lerato.entrant.id]);
    expect(remarks[0].entrants.submissions[0].answers).toEqual([
      expect.objectContaining({ id: ayanda.answer.id, points_awarded: "5", questions: { prompt: expect.any(String), max_points: "10" } }),
    ]);
  });

  it("is only for the round's organiser", async () => {
    const { round, otherOrganiserApi, organiserApi } = await setup();
    expectError(await otherOrganiserApi.get(`/rounds/${round.id}/remarks`), 403, "Not your round");
    expectError(await organiserApi.get(`/rounds/${MISSING}/remarks`), 404, "Round not found");
  });
});

describe("PATCH /rounds/:roundId/remarks/:remarkId", () => {
  const withRequest = async () => {
    const world = await setup();
    const remark = await requestRemark(world.ayanda, world.round);
    return { ...world, remark, url: `/rounds/${world.round.id}/remarks/${remark.id}` };
  };

  it("rejects a request without touching any marks", async () => {
    const { url, organiserApi, organiser, ayanda } = await withRequest();

    expectOk(await organiserApi.patch(url).send({ status: "rejected", decision: "Marked correctly against the memo" }));
    const remark = await prisma.remark_requests.findFirst();
    expect(remark).toMatchObject({ status: "rejected", decision: "Marked correctly against the memo", reviewer_id: organiser.id });
    expect(remark.decided_at).toBeInstanceOf(Date);
    expect(Number((await prisma.results.findUnique({ where: { id: ayanda.result.id } })).total_points)).toBe(5);
    expect(await prisma.marking_reviews.count()).toBe(0);
  });

  it("approves a revised mark: re-marks the answer, recalculates totals and ranks, and records the review", async () => {
    const { url, organiserApi, organiser, ayanda, lerato } = await withRequest();

    expectOk(await organiserApi.patch(url).send({ status: "approved", decision: "The proof was complete", answer_id: ayanda.answer.id, points_awarded: 9 }));

    expect(Number((await prisma.answers.findUnique({ where: { id: ayanda.answer.id } })).points_awarded)).toBe(9);
    const results = await prisma.results.findMany({ orderBy: { rank: "asc" } });
    expect(results.map((r) => [r.entrant_id, Number(r.total_points), r.rank])).toEqual([
      [ayanda.entrant.id, 9, 1],
      [lerato.entrant.id, 7, 2],
    ]);
    expect(await prisma.marking_reviews.findMany()).toEqual([
      expect.objectContaining({ answer_id: ayanda.answer.id, reviewer_id: organiser.id, comment: "The proof was complete" }),
    ]);
    expect((await prisma.remark_requests.findFirst()).status).toBe("approved");
  });

  it("qualifies a student whose revised total reaches the threshold, and enters them for the next round", async () => {
    const { url, organiserApi, ayanda, lerato, nextRound } = await withRequest();

    expectOk(await organiserApi.patch(url).send({ status: "approved", decision: "The proof was complete", answer_id: ayanda.answer.id, points_awarded: 8 }));

    expect((await prisma.results.findUnique({ where: { id: ayanda.result.id } })).qualified).toBe(true);
    expect((await prisma.results.findUnique({ where: { id: lerato.result.id } })).qualified).toBe(false);
    const entered = await prisma.entrant_registrations.findMany({ where: { round_id: nextRound.id } });
    expect(entered.map((r) => r.entrant_id)).toEqual([ayanda.entrant.id]);
  });

  it("can only be decided once", async () => {
    const { url, organiserApi } = await withRequest();
    expectOk(await organiserApi.patch(url).send({ status: "rejected", decision: "Marked correctly" }));
    expectError(await organiserApi.patch(url).send({ status: "rejected", decision: "Marked correctly" }), 409, "Remark has already been decided");
  });

  it("needs a status and an explanation", async () => {
    const { url, organiserApi } = await withRequest();
    const message = "Decision and approved/rejected status required";
    expectError(await organiserApi.patch(url).send({ status: "maybe", decision: "Not sure yet" }), 400, message);
    expectError(await organiserApi.patch(url).send({ status: "rejected", decision: "no" }), 400, message);
    expect((await prisma.remark_requests.findFirst()).status).toBe("pending");
  });

  it("only revises the requesting student's own answer, within the question's points", async () => {
    const { url, organiserApi, ayanda, lerato } = await withRequest();
    const message = "Select an answer from this entrant and valid revised points";
    const approve = (body) => organiserApi.patch(url).send({ status: "approved", decision: "Revised on review", ...body });

    expectError(await approve({ answer_id: lerato.answer.id, points_awarded: 9 }), 400, message);
    expectError(await approve({ answer_id: ayanda.answer.id, points_awarded: 11 }), 400, message);
    expectError(await approve({ answer_id: ayanda.answer.id, points_awarded: -1 }), 400, message);
    expectError(await approve({ answer_id: ayanda.answer.id }), 400, message);
    expect(Number((await prisma.answers.findUnique({ where: { id: lerato.answer.id } })).points_awarded)).toBe(7);
    expect((await prisma.remark_requests.findFirst()).status).toBe("pending");
  });

  it("is only for the round's organiser, and only for a request in that round", async () => {
    const { url, remark, olympiad, otherOrganiserApi, organiserApi } = await withRequest();
    const otherRound = await f.createRound({ olympiad });

    expectError(await otherOrganiserApi.patch(url).send({ status: "rejected", decision: "Marked correctly" }), 403, "Not your round");
    expectError(await organiserApi.patch(`/rounds/${otherRound.id}/remarks/${remark.id}`).send({ status: "rejected", decision: "Marked correctly" }), 404, "Remark not found");
    expect((await prisma.remark_requests.findFirst()).status).toBe("pending");
  });
});
