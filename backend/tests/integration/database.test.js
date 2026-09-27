// The schema as the migrations actually build it: defaults, unique
// constraints and delete rules that the services depend on.
const prisma = require("../../src/config/database").default;
const errorHandler = require("../../src/middlewares/errorHandler");
const f = require("./helpers/factories");

const expectUniqueViolation = (promise) => expect(promise).rejects.toMatchObject({ code: "P2002" });

describe("migrations", () => {
  it("build every table the Prisma schema expects", async () => {
    const rows = await prisma.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    expect(rows.map((r) => r.tablename).sort()).toEqual([
      "answers",
      "educators",
      "entrant_registrations",
      "entrants",
      "marking_reviews",
      "notification_rules",
      "olympiad_invites",
      "olympiads",
      "papers",
      "portal_notifications",
      "portal_remark_requests",
      "questions",
      "remark_requests",
      "results",
      "rounds",
      "school_memberships",
      "school_registrations",
      "schools",
      "sent_notifications",
      "submissions",
      "users",
    ]);
  });
});

describe("defaults", () => {
  it("gives new rows ids, timestamps and starting states", async () => {
    const olympiad = await f.createOlympiad();
    const round = await f.createRound({ olympiad });
    const school = await f.createSchool();
    const registration = await f.registerSchool(school, olympiad);

    expect(olympiad).toMatchObject({ id: expect.any(String), timezone: "Africa/Johannesburg", created_at: expect.any(Date) });
    expect(round).toMatchObject({ state: "scheduled", exam_status: "draft", approved_by: null, qualifying_threshold: null });
    expect(registration.status).toBe("approved");
  });

  it("stores decimals exactly", async () => {
    const olympiad = await f.createOlympiad();
    const round = await f.createRound({ olympiad, qualifying_threshold: "62.5" });
    const { questions } = await f.createPaper({
      round,
      questions: [{ type: "mcq", options: ["a", "b"], correct_option: "0", max_points: "2.5", negative_pct: "12.5" }],
    });

    const [q] = questions;
    expect(String(round.qualifying_threshold)).toBe("62.5");
    expect([String(q.max_points), String(q.negative_pct)]).toEqual(["2.5", "12.5"]);
    expect(q.options).toEqual(["a", "b"]);
  });

  it("defaults a question to 1 point with no negative marking", async () => {
    const olympiad = await f.createOlympiad();
    const round = await f.createRound({ olympiad });
    const { questions } = await f.createPaper({ round, questions: [{ type: "essay" }] });
    expect([String(questions[0].max_points), String(questions[0].negative_pct)]).toEqual(["1", "0"]);
  });
});

describe("unique constraints", () => {
  it("allows one account per email", async () => {
    await f.createUser("organiser", { email: "dup@olympiad.test" });
    await expectUniqueViolation(f.createUser("educator", { email: "dup@olympiad.test" }));
  });

  it("allows one educator profile per user", async () => {
    const { user, school } = await f.createEducator();
    await expectUniqueViolation(prisma.educators.create({ data: { user_id: user.id, school_id: school.id } }));
  });

  it("allows one membership per user per school", async () => {
    const { user, school } = await f.createEducator();
    await expectUniqueViolation(
      prisma.school_memberships.create({ data: { user_id: user.id, school_id: school.id, role: "educator" } }),
    );
  });

  it("registers a school for an olympiad only once", async () => {
    const olympiad = await f.createOlympiad();
    const school = await f.createSchool();
    await f.registerSchool(school, olympiad);
    await expectUniqueViolation(f.registerSchool(school, olympiad));
  });

  it("invites a person to an olympiad only once", async () => {
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser });
    const { user: invitee, school } = await f.createEducator();
    const args = { olympiad, invitee, invitedBy: organiser, school };
    await f.createInvite(args);
    await expectUniqueViolation(f.createInvite(args));
  });

  it("registers an entrant for a round only once", async () => {
    const { olympiad, school, educator } = await f.createOlympiadWithSchool();
    const round = await f.createRound({ olympiad });
    const entrant = await f.createEntrant({ school });
    await f.registerEntrant({ entrant, round, educator });
    await expectUniqueViolation(f.registerEntrant({ entrant, round, educator }));
  });

  it("allows one submission per entrant and round, whichever route it came by", async () => {
    const { olympiad, school } = await f.createOlympiadWithSchool();
    const round = await f.createRound({ olympiad, state: "open" });
    const entrant = await f.createEntrant({ school });
    const submission = (key, route = "online") =>
      prisma.submissions.create({
        data: {
          round_id: round.id,
          entrant_id: entrant.id,
          route,
          idempotency_key: key,
          round_close_snapshot: round.closes_at,
        },
      });

    await submission("key-1");
    await expectUniqueViolation(submission("key-1"));
    await expectUniqueViolation(submission("key-2"));
    // Paper results for a learner who already sat online would count them twice
    await expectUniqueViolation(submission("key-3", "offline"));
    expect(await prisma.submissions.count()).toBe(1);
  });

  it("allows one result per entrant per round", async () => {
    const { olympiad, school } = await f.createOlympiadWithSchool();
    const round = await f.createRound({ olympiad });
    const entrant = await f.createEntrant({ school });
    await prisma.results.create({ data: { round_id: round.id, entrant_id: entrant.id } });
    await expectUniqueViolation(prisma.results.create({ data: { round_id: round.id, entrant_id: entrant.id } }));
  });

  it("is reported to the client as a 409 by the error handler", async () => {
    await f.createUser("organiser", { email: "taken@olympiad.test" });
    const err = await f.createUser("organiser", { email: "taken@olympiad.test" }).catch((e) => e);

    const res = { status: jest.fn(() => res), json: jest.fn() };
    jest.spyOn(console, "error").mockImplementation(() => {});
    errorHandler(err, { url: "/auth/register", method: "POST" }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: "A record with that value already exists" });
  });
});

describe("delete rules", () => {
  it("removes an organiser's olympiads, rounds, rules and invitations with the account", async () => {
    const { user: invitee, school } = await f.createEducator();
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser });
    await f.createRound({ olympiad });
    await prisma.notification_rules.create({
      data: { olympiad_id: olympiad.id, name: "Reminder", trigger: "round_opens", recipient: "registered_schools" },
    });
    await f.createInvite({ olympiad, invitee, invitedBy: organiser, school });

    await prisma.users.delete({ where: { id: organiser.id } });

    expect(await prisma.olympiads.count()).toBe(0);
    expect(await prisma.rounds.count()).toBe(0);
    expect(await prisma.notification_rules.count()).toBe(0);
    expect(await prisma.olympiad_invites.count()).toBe(0);
  });

  it("removes an educator's profile and memberships with the account", async () => {
    const { user, school } = await f.createEducator();
    await prisma.users.delete({ where: { id: user.id } });
    expect(await prisma.educators.count()).toBe(0);
    expect(await prisma.school_memberships.count()).toBe(0);
    expect(await prisma.schools.count({ where: { id: school.id } })).toBe(1);
  });

  it("removes a paper's questions with the paper", async () => {
    const olympiad = await f.createOlympiad();
    const round = await f.createRound({ olympiad });
    const { paper } = await f.createPaper({ round, questions: [{ type: "essay" }, { type: "essay" }] });

    await prisma.papers.delete({ where: { id: paper.id } });
    expect(await prisma.questions.count()).toBe(0);
  });

  it("removes a submission's answers with the submission", async () => {
    const { olympiad, school } = await f.createOlympiadWithSchool();
    const round = await f.createRound({ olympiad, state: "open" });
    const { questions } = await f.createPaper({ round, questions: [{ type: "essay" }] });
    const entrant = await f.createEntrant({ school });
    const submission = await prisma.submissions.create({
      data: {
        round_id: round.id,
        entrant_id: entrant.id,
        idempotency_key: "k",
        round_close_snapshot: round.closes_at,
        answers: { create: [{ question_id: questions[0].id, answer_value: "text" }] },
      },
    });

    await prisma.submissions.delete({ where: { id: submission.id } });
    expect(await prisma.answers.count()).toBe(0);
  });

  it("refuses to delete a question that students have answered", async () => {
    const { olympiad, school } = await f.createOlympiadWithSchool();
    const round = await f.createRound({ olympiad, state: "open" });
    const { questions } = await f.createPaper({ round, questions: [{ type: "essay" }] });
    const entrant = await f.createEntrant({ school });
    await prisma.submissions.create({
      data: {
        round_id: round.id,
        entrant_id: entrant.id,
        idempotency_key: "k",
        round_close_snapshot: round.closes_at,
        answers: { create: [{ question_id: questions[0].id }] },
      },
    });

    // Prisma 7 reports Postgres' RESTRICT violation (23001) as P2039
    await expect(prisma.questions.delete({ where: { id: questions[0].id } })).rejects.toMatchObject({
      code: "P2039",
      meta: { driverAdapterError: { cause: { originalCode: "23001" } } },
    });
  });
});
