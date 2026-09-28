jest.mock("../../../src/config/database", () => ({
  __esModule: true,
  default: require("../helpers/prismaMock").prisma,
}));

const { prisma, resetPrismaMock } = require("../helpers/prismaMock");
const {
  createSubmission,
  listSubmissions,
  getSubmission,
} = require("../../../src/services/submissionService");

beforeEach(resetPrismaMock);

const questions = [
  { id: "q-mcq", type: "mcq", correct_option: "0", negative_pct: 0, max_points: 3 },
  { id: "q-essay", type: "essay", correct_option: null, max_points: 10 },
];

const openRound = (overrides = {}) => ({
  id: "round-1",
  state: "open",
  closes_at: new Date("2026-05-01T12:00:00Z"),
  olympiads: { organiser_id: "org-1" },
  papers: [{ id: "paper-1", questions }],
  ...overrides,
});

// Programs the lookups createSubmission makes before its transaction.
const arrangeValidSubmission = ({ round = openRound(), existing = null } = {}) => {
  prisma.rounds.findUnique.mockResolvedValue(round);
  prisma.educators.findUnique.mockResolvedValue({ id: "edu-1", school_id: "school-1" });
  prisma.entrants.findUnique.mockResolvedValue({ id: "ent-1", school_id: "school-1" });
  prisma.entrant_registrations.findFirst.mockResolvedValue({ id: "reg-1" });
  prisma.submissions.findUnique.mockResolvedValue(existing);
  prisma.submissions.create.mockResolvedValue({ id: "sub-1" });
  prisma.answers.create.mockImplementation(async ({ data }) => ({ id: `row-${data.question_id}`, ...data }));
};

describe("createSubmission", () => {
  const body = (overrides = {}) => ({
    entrant_id: "ent-1",
    route: "offline",
    answers: [{ question_id: "q-mcq", answer_value: "0" }],
    ...overrides,
  });

  it("rejects an unknown round", async () => {
    prisma.rounds.findUnique.mockResolvedValue(null);
    await expect(createSubmission("round-x", "edu-user", body())).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects a round that isn't open", async () => {
    prisma.rounds.findUnique.mockResolvedValue(openRound({ state: "closed" }));
    await expect(createSubmission("round-1", "edu-user", body())).rejects.toMatchObject({
      statusCode: 400,
      message: 'Submissions are not accepted — round is "closed"',
    });
  });

  it("rejects a user without an educator profile", async () => {
    prisma.rounds.findUnique.mockResolvedValue(openRound());
    prisma.educators.findUnique.mockResolvedValue(null);
    await expect(createSubmission("round-1", "u", body())).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects an unknown entrant", async () => {
    arrangeValidSubmission();
    prisma.entrants.findUnique.mockResolvedValue(null);
    await expect(createSubmission("round-1", "u", body())).rejects.toMatchObject({
      statusCode: 404,
      message: "Entrant not found",
    });
  });

  it("rejects an entrant from another school", async () => {
    arrangeValidSubmission();
    prisma.entrants.findUnique.mockResolvedValue({ id: "ent-1", school_id: "school-2" });
    await expect(createSubmission("round-1", "u", body())).rejects.toMatchObject({
      statusCode: 403,
      message: "Entrant does not belong to your school",
    });
  });

  it("rejects an entrant who isn't registered for the round", async () => {
    arrangeValidSubmission();
    prisma.entrant_registrations.findFirst.mockResolvedValue(null);
    await expect(createSubmission("round-1", "u", body())).rejects.toMatchObject({
      statusCode: 403,
      message: "Entrant is not registered for this round",
    });
    expect(prisma.entrant_registrations.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { entrant_id: "ent-1", round_id: "round-1" } }),
    );
    expect(prisma.submissions.create).not.toHaveBeenCalled();
  });

  it("checks for a duplicate under the default route when none is given", async () => {
    arrangeValidSubmission({ existing: { id: "sub-old" } });
    await expect(createSubmission("round-1", "u", body({ route: undefined }))).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.submissions.findUnique).toHaveBeenCalledWith({
      where: { idempotency_key: "round-1:ent-1:offline" },
    });
  });

  it("rejects a capture for a learner who already sat the round online", async () => {
    arrangeValidSubmission();
    prisma.submissions.findFirst.mockResolvedValue({ id: "sub-online", route: "online", status: "automarked" });
    await expect(createSubmission("round-1", "u", body())).rejects.toMatchObject({
      statusCode: 409,
      message: "This entrant already has a submission for this round",
    });
    expect(prisma.submissions.findFirst).toHaveBeenCalledWith({
      where: { round_id: "round-1", entrant_id: "ent-1", route: { not: "offline" } },
      select: { id: true, route: true, status: true },
    });
    expect(prisma.submissions.deleteMany).not.toHaveBeenCalled();
    expect(prisma.submissions.create).not.toHaveBeenCalled();
  });

  // A9: the learner opened the exam online, lost their connection and
  // finished on paper
  it("replaces an online attempt the learner never submitted", async () => {
    arrangeValidSubmission();
    prisma.submissions.findFirst.mockResolvedValue({ id: "sub-online", route: "online", status: "received" });
    prisma.submissions.deleteMany.mockResolvedValue({ count: 1 });

    await createSubmission("round-1", "u", body());

    expect(prisma.submissions.deleteMany).toHaveBeenCalledWith({ where: { id: "sub-online", status: "received" } });
    expect(prisma.submissions.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(prisma.submissions.create.mock.invocationCallOrder[0]);
    expect(prisma.submissions.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ route: "offline" }) }));
  });

  it("keeps the online exam if the learner submitted it while the school was capturing", async () => {
    arrangeValidSubmission();
    prisma.submissions.findFirst.mockResolvedValue({ id: "sub-online", route: "online", status: "received" });
    prisma.submissions.deleteMany.mockResolvedValue({ count: 0 });

    await expect(createSubmission("round-1", "u", body())).rejects.toMatchObject({
      statusCode: 409,
      message: "This entrant already has a submission for this round",
    });
    expect(prisma.submissions.create).not.toHaveBeenCalled();
  });

  // The learner started online after the checks above but before the insert;
  // the database's one-submission-per-round index refuses the second row
  it("reports a learner's online sitting that lands mid-capture as a conflict", async () => {
    arrangeValidSubmission();
    prisma.submissions.create.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    await expect(createSubmission("round-1", "u", body())).rejects.toMatchObject({
      statusCode: 409,
      message: "This entrant already has a submission for this round",
    });
    expect(prisma.answers.create).not.toHaveBeenCalled();
  });

  it("passes other database failures through unchanged", async () => {
    arrangeValidSubmission();
    const failure = Object.assign(new Error("connection lost"), { code: "P1001" });
    prisma.submissions.create.mockRejectedValue(failure);
    await expect(createSubmission("round-1", "u", body())).rejects.toBe(failure);
  });

  it("rejects a duplicate for the same round, entrant and route", async () => {
    arrangeValidSubmission({ existing: { id: "sub-old" } });
    await expect(createSubmission("round-1", "u", body())).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.submissions.findUnique).toHaveBeenCalledWith({
      where: { idempotency_key: "round-1:ent-1:offline" },
    });
  });

  it("rejects answers when the round has no paper", async () => {
    arrangeValidSubmission({ round: openRound({ papers: [] }) });
    await expect(createSubmission("round-1", "u", body())).rejects.toMatchObject({
      statusCode: 400,
      message: "No paper exists for this round",
    });
  });

  it("rejects a question that isn't on this round's paper", async () => {
    arrangeValidSubmission();
    await expect(
      createSubmission("round-1", "u", body({ answers: [{ question_id: "q-other", answer_value: "1" }] })),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Question q-other does not belong to this round's paper",
    });
    expect(prisma.submissions.create).not.toHaveBeenCalled();
  });

  it("creates the submission with the round's close time as a snapshot", async () => {
    arrangeValidSubmission();
    await createSubmission("round-1", "u", body());
    expect(prisma.submissions.create).toHaveBeenCalledWith({
      data: {
        round_id: "round-1",
        entrant_id: "ent-1",
        submitted_by: "edu-1",
        route: "offline",
        status: "received",
        idempotency_key: "round-1:ent-1:offline",
        round_close_snapshot: new Date("2026-05-01T12:00:00Z"),
      },
    });
  });

  it("defaults the route to offline", async () => {
    arrangeValidSubmission();
    await createSubmission("round-1", "u", body({ route: undefined }));
    expect(prisma.submissions.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ route: "offline" }) }),
    );
  });

  it("auto-marks MCQ answers immediately and totals the points", async () => {
    arrangeValidSubmission();

    const result = await createSubmission("round-1", "u", body());

    expect(prisma.answers.create).toHaveBeenCalledWith({
      data: {
        submission_id: "sub-1",
        question_id: "q-mcq",
        answer_value: "0",
        is_correct: true,
        points_awarded: 3,
        marked_at: expect.any(Date),
      },
    });
    expect(prisma.submissions.update).toHaveBeenCalledWith({ where: { id: "sub-1" }, data: { status: "automarked" } });
    expect(prisma.results.upsert).toHaveBeenCalledWith({
      where: { round_id_entrant_id: { round_id: "round-1", entrant_id: "ent-1" } },
      create: { round_id: "round-1", entrant_id: "ent-1", total_points: 3 },
      update: { total_points: 3 },
    });
    expect(result).toMatchObject({ submission: { id: "sub-1" }, totalPoints: 3, allAutoMarked: true });
  });

  it("stores essay answers unmarked and keeps the submission 'received'", async () => {
    arrangeValidSubmission();

    const result = await createSubmission(
      "round-1",
      "u",
      body({ answers: [{ question_id: "q-mcq", answer_value: "1" }, { question_id: "q-essay", answer_value: "text" }] }),
    );

    expect(prisma.answers.create).toHaveBeenCalledWith({
      data: {
        submission_id: "sub-1",
        question_id: "q-essay",
        answer_value: "text",
        is_correct: null,
        points_awarded: null,
        marked_at: null,
      },
    });
    expect(prisma.submissions.update).toHaveBeenCalledWith({ where: { id: "sub-1" }, data: { status: "received" } });
    expect(result).toMatchObject({ totalPoints: 0, allAutoMarked: false });
  });

  it("stores a missing answer value as null", async () => {
    arrangeValidSubmission();
    await createSubmission("round-1", "u", body({ answers: [{ question_id: "q-essay" }] }));
    expect(prisma.answers.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ answer_value: null }) }),
    );
  });

  it("creates no result row for a submission without answers", async () => {
    arrangeValidSubmission();
    const result = await createSubmission("round-1", "u", body({ answers: [] }));
    expect(prisma.submissions.update).toHaveBeenCalledWith({ where: { id: "sub-1" }, data: { status: "received" } });
    expect(prisma.results.upsert).not.toHaveBeenCalled();
    expect(result.answers).toEqual([]);
    // Nothing was marked, so it must not be reported as auto-marked
    expect(result.allAutoMarked).toBe(false);
  });
});

describe("listSubmissions", () => {
  it("rejects an unknown round", async () => {
    prisma.rounds.findUnique.mockResolvedValue(null);
    await expect(listSubmissions("x", "org-1", "organiser")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects an organiser who doesn't own the round", async () => {
    prisma.rounds.findUnique.mockResolvedValue(openRound());
    await expect(listSubmissions("round-1", "org-2", "organiser")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("returns every submission for the owning organiser, newest first", async () => {
    prisma.rounds.findUnique.mockResolvedValue(openRound());
    prisma.submissions.findMany.mockResolvedValue([{ id: "s1" }]);

    await expect(listSubmissions("round-1", "org-1", "organiser")).resolves.toEqual([{ id: "s1" }]);
    expect(prisma.submissions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { round_id: "round-1" }, orderBy: { received_at: "desc" } }),
    );
  });

  it("limits an educator to their school's entrants", async () => {
    prisma.rounds.findUnique.mockResolvedValue(openRound());
    prisma.educators.findUnique.mockResolvedValue({ school_id: "school-5" });
    prisma.submissions.findMany.mockResolvedValue([]);

    await listSubmissions("round-1", "edu", "educator");
    expect(prisma.submissions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { round_id: "round-1", entrants: { school_id: "school-5" } } }),
    );
  });

  it("rejects any other role", async () => {
    prisma.rounds.findUnique.mockResolvedValue(openRound());
    await expect(listSubmissions("round-1", "s", "student")).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("getSubmission", () => {
  const stored = {
    id: "sub-1",
    round_id: "round-1",
    rounds: { olympiads: { organiser_id: "org-1" } },
    entrants: { school_id: "school-1" },
    answers: [],
  };

  it("rejects an unknown submission", async () => {
    prisma.submissions.findUnique.mockResolvedValue(null);
    await expect(getSubmission("x", "org-1", "organiser")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("reports a submission from a different round as not found", async () => {
    prisma.submissions.findUnique.mockResolvedValue(stored);
    await expect(getSubmission("sub-1", "org-1", "organiser", "round-2")).rejects.toMatchObject({
      statusCode: 404,
      message: "Submission not found",
    });
    await expect(getSubmission("sub-1", "org-1", "organiser", "round-1")).resolves.toBe(stored);
  });

  it("returns the submission to the owning organiser", async () => {
    prisma.submissions.findUnique.mockResolvedValue(stored);
    await expect(getSubmission("sub-1", "org-1", "organiser")).resolves.toBe(stored);
  });

  it("rejects an organiser from another olympiad", async () => {
    prisma.submissions.findUnique.mockResolvedValue(stored);
    await expect(getSubmission("sub-1", "org-2", "organiser")).rejects.toMatchObject({
      message: "Not your submission",
    });
  });

  it("returns the submission to an educator at the same school", async () => {
    prisma.submissions.findUnique.mockResolvedValue(stored);
    prisma.educators.findUnique.mockResolvedValue({ school_id: "school-1" });
    await expect(getSubmission("sub-1", "edu", "educator")).resolves.toBe(stored);
  });

  it("rejects an educator from another school", async () => {
    prisma.submissions.findUnique.mockResolvedValue(stored);
    prisma.educators.findUnique.mockResolvedValue({ school_id: "school-2" });
    await expect(getSubmission("sub-1", "edu", "educator")).rejects.toMatchObject({
      message: "Not your school's submission",
    });
  });

  it("rejects any other role", async () => {
    prisma.submissions.findUnique.mockResolvedValue(stored);
    await expect(getSubmission("sub-1", "s", "student")).rejects.toMatchObject({ statusCode: 403 });
  });
});
