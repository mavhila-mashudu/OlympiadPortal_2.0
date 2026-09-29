// Organiser endpoints: olympiads, their rounds, schools, archive and
// notification rules, and managing a single round (edit, state, delete,
// paper upload).
const prisma = require("../../src/config/database").default;
const f = require("../integration/helpers/factories");
const { supabase } = require("../integration/helpers/externalMocks");
const { as, expectError, expectOk } = require("./helpers/api");

const iso = (hours) => f.hoursFromNow(hours).toISOString();

describe("POST /olympiads", () => {
  it("creates an olympiad owned by the organiser with the default timezone", async () => {
    const organiser = await f.createOrganiser();
    const { olympiad } = expectOk(await as(organiser).post("/olympiads").send({ name: "  Maths Olympiad 2026  " }), 201);
    expect(olympiad).toMatchObject({ id: expect.any(String), name: "Maths Olympiad 2026", organiser_id: organiser.id, timezone: "Africa/Johannesburg" });
  });

  it("accepts a timezone", async () => {
    const organiser = await f.createOrganiser();
    const { olympiad } = expectOk(await as(organiser).post("/olympiads").send({ name: "Global", timezone: "UTC" }), 201);
    expect(olympiad.timezone).toBe("UTC");
  });

  it("ignores an attempt to set another owner", async () => {
    const organiser = await f.createOrganiser();
    const other = await f.createOrganiser();
    const { olympiad } = expectOk(await as(organiser).post("/olympiads").send({ name: "Mine", organiser_id: other.id }), 201);
    expect(olympiad.organiser_id).toBe(organiser.id);
  });

  it.each([{}, { name: "   " }])("responds 422 without a name (%o)", async (body) => {
    expectError(await as(await f.createOrganiser()).post("/olympiads").send(body), 422, "Olympiad name is required");
  });

  // Round times are entered and shown in this zone, so it must be a real one
  it.each(["Mars/Olympus", "+02:00", "SAST", ""])("responds 422 for a timezone that isn't an IANA name (%p)", async (timezone) => {
    const organiser = await f.createOrganiser();
    expectError(
      await as(organiser).post("/olympiads").send({ name: "Maths", timezone }),
      422,
      "timezone must be an IANA timezone such as Africa/Johannesburg",
    );
    expect(await prisma.olympiads.count()).toBe(0);
  });
});

describe("GET /olympiads", () => {
  it("lists only the organiser's olympiads, newest first, with counts", async () => {
    const organiser = await f.createOrganiser();
    const older = await f.createOlympiad({ organiser, name: "2025", created_at: new Date("2025-01-01") });
    const newer = await f.createOlympiad({ organiser, name: "2026", created_at: new Date("2026-01-01") });
    await f.createRound({ olympiad: newer });
    await f.registerSchool(await f.createSchool(), newer);
    await f.createOlympiad({ name: "Someone else's" });

    const { olympiads } = expectOk(await as(organiser).get("/olympiads"));

    expect(olympiads.map((o) => [o.id, o._count])).toEqual([
      [newer.id, { rounds: 1, school_registrations: 1 }],
      [older.id, { rounds: 0, school_registrations: 0 }],
    ]);
  });
});

describe("GET /olympiads/:id", () => {
  it("returns the olympiad with its rounds in opening order", async () => {
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser });
    const later = await f.createRound({ olympiad, opens_at: f.hoursFromNow(48), closes_at: f.hoursFromNow(50) });
    const sooner = await f.createRound({ olympiad, opens_at: f.hoursFromNow(1), closes_at: f.hoursFromNow(2) });

    const data = expectOk(await as(organiser).get(`/olympiads/${olympiad.id}`));

    expect(data.olympiad.rounds.map((r) => r.id)).toEqual([sooner.id, later.id]);
    expect(data.olympiad._count).toEqual({ school_registrations: 0 });
  });

  it("responds 403 for another organiser's olympiad and 404 for an unknown one", async () => {
    const olympiad = await f.createOlympiad();
    const organiser = await f.createOrganiser();
    expectError(await as(organiser).get(`/olympiads/${olympiad.id}`), 403, "Not your olympiad");
    expectError(await as(organiser).get("/olympiads/00000000-0000-4000-8000-000000000000"), 404, "Olympiad not found");
  });
});

describe("olympiad rounds", () => {
  const roundBody = (overrides = {}) => ({ name: "Round 1", opens_at: iso(24), closes_at: iso(26), ...overrides });

  describe("POST /olympiads/:olympiadId/rounds", () => {
    it("creates a scheduled draft round", async () => {
      const organiser = await f.createOrganiser();
      const olympiad = await f.createOlympiad({ organiser });
      const body = roundBody({ notes: "Calculators allowed", qualifying_threshold: 62.5 });

      const { round } = expectOk(await as(organiser).post(`/olympiads/${olympiad.id}/rounds`).send(body), 201);

      expect(round).toMatchObject({
        olympiad_id: olympiad.id,
        name: "Round 1",
        notes: "Calculators allowed",
        state: "scheduled",
        exam_status: "draft",
        qualifying_threshold: "62.5",
        opens_at: body.opens_at,
        closes_at: body.closes_at,
      });
    });

    it("stores no threshold when it's null", async () => {
      const organiser = await f.createOrganiser();
      const olympiad = await f.createOlympiad({ organiser });
      const { round } = expectOk(await as(organiser).post(`/olympiads/${olympiad.id}/rounds`).send(roundBody({ qualifying_threshold: null })), 201);
      expect(round.qualifying_threshold).toBeNull();
    });

    it.each([
      [{ name: "" }, "Round name is required"],
      [{ opens_at: "tomorrow" }, "opens_at must be a valid date"],
      [{ closes_at: undefined }, "closes_at must be a valid date"],
      [{ qualifying_threshold: -1 }, "qualifying_threshold must be a percentage from 0 to 100"],
      [{ qualifying_threshold: 120 }, "qualifying_threshold must be a percentage from 0 to 100"],
    ])("responds 422 for %o", async (overrides, message) => {
      const organiser = await f.createOrganiser();
      const olympiad = await f.createOlympiad({ organiser });
      expectError(await as(organiser).post(`/olympiads/${olympiad.id}/rounds`).send(roundBody(overrides)), 422, message);
    });

    it("responds 400 when the round closes before it opens", async () => {
      const organiser = await f.createOrganiser();
      const olympiad = await f.createOlympiad({ organiser });
      const res = await as(organiser).post(`/olympiads/${olympiad.id}/rounds`).send(roundBody({ opens_at: iso(26), closes_at: iso(24) }));
      expectError(res, 400, "closes_at must be after opens_at");
    });

    it("responds 403 for another organiser's olympiad, creating nothing", async () => {
      const olympiad = await f.createOlympiad();
      const res = await as(await f.createOrganiser()).post(`/olympiads/${olympiad.id}/rounds`).send(roundBody());
      expectError(res, 403, "Not your olympiad");
      expect(await prisma.rounds.count()).toBe(0);
    });
  });

  describe("GET /olympiads/:olympiadId/rounds", () => {
    it("lists the rounds in opening order with submission and registration counts", async () => {
      const { organiser, olympiad, school, educator } = await f.createOlympiadWithSchool();
      const round2 = await f.createRound({ olympiad, opens_at: f.hoursFromNow(48), closes_at: f.hoursFromNow(50) });
      const round1 = await f.createRound({ olympiad, opens_at: f.hoursFromNow(1), closes_at: f.hoursFromNow(2) });
      await f.registerEntrant({ entrant: await f.createEntrant({ school }), round: round1, educator });

      const { rounds } = expectOk(await as(organiser).get(`/olympiads/${olympiad.id}/rounds`));

      expect(rounds.map((r) => [r.id, r._count])).toEqual([
        [round1.id, { submissions: 0, entrant_registrations: 1 }],
        [round2.id, { submissions: 0, entrant_registrations: 0 }],
      ]);
    });

    it("responds 403 for another organiser's olympiad", async () => {
      const olympiad = await f.createOlympiad();
      expectError(await as(await f.createOrganiser()).get(`/olympiads/${olympiad.id}/rounds`), 403, "Not your olympiad");
    });
  });
});

describe("GET /olympiads/:olympiadId/schools", () => {
  it("lists participating schools alongside outstanding invitations", async () => {
    const { organiser, olympiad, school, educatorUser } = await f.createOlympiadWithSchool();
    await f.createEntrant({ school });

    const invitedSchool = await f.createSchool({ name: "Northview College" });
    const head = await f.createEducator({
      school: invitedSchool,
      userOverrides: { full_name: "Mr Pillay", email: "p@n.test" },
    });
    await f.createInvite({ olympiad, invitee: head.user, invitedBy: organiser, school: invitedSchool });

    const { schools } = expectOk(await as(organiser).get(`/olympiads/${olympiad.id}/schools`));

    expect(schools).toEqual(
      expect.arrayContaining([
        {
          id: expect.any(String),
          name: "Northview College",
          address: null,
          entrants: 0,
          educators: [{ name: "Mr Pillay", email: "p@n.test" }],
          contactEmail: "p@n.test",
          status: "pending",
        },
        {
          id: school.id,
          name: school.name,
          address: null,
          entrants: 1,
          educators: [{ name: educatorUser.full_name, email: educatorUser.email }],
          contactEmail: null,
          status: "accepted",
        },
      ]),
    );
    expect(schools).toHaveLength(2);
  });

  it("responds 403 for another organiser's olympiad", async () => {
    const olympiad = await f.createOlympiad();
    expectError(await as(await f.createOrganiser()).get(`/olympiads/${olympiad.id}/schools`), 403, "Not your olympiad");
  });
});

describe("GET /olympiads/:olympiadId/archive", () => {
  it("lists released rounds with archived papers, most recently closed first", async () => {
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser });
    const released = async (name, closesIn) => {
      const round = await f.createRound({ olympiad, name, state: "results_released", opens_at: f.hoursFromNow(closesIn - 2), closes_at: f.hoursFromNow(closesIn) });
      await f.createPaper({ round, file_url: `rounds/${name}.pdf`, is_archived: true });
      return round;
    };
    const old = await released("Old", -100);
    const recent = await released("Recent", -10);
    const unarchived = await f.createRound({ olympiad, state: "results_released" });
    await f.createPaper({ round: unarchived, is_archived: false });
    await f.createRound({ olympiad, state: "marking" });

    const { rounds } = expectOk(await as(organiser).get(`/olympiads/${olympiad.id}/archive`));

    expect(rounds.map((r) => r.id)).toEqual([recent.id, old.id]);
    expect(rounds[0].papers).toEqual([expect.objectContaining({ file_url: "rounds/Recent.pdf", is_archived: true })]);
  });

  it("responds 403 for another organiser's olympiad", async () => {
    const olympiad = await f.createOlympiad();
    expectError(await as(await f.createOrganiser()).get(`/olympiads/${olympiad.id}/archive`), 403, "Not your olympiad");
  });
});

// A16: one archive of past papers shared by all of the organiser's olympiads
describe("GET /olympiads/archive", () => {
  const released = async (olympiad, name, closesIn) => {
    const round = await f.createRound({ olympiad, name, state: "results_released", opens_at: f.hoursFromNow(closesIn - 2), closes_at: f.hoursFromNow(closesIn) });
    await f.createPaper({ round, file_url: `rounds/${name}.pdf`, memo_file_url: `rounds/${name}-memo.pdf`, is_archived: true });
    return round;
  };

  it("lists archived papers from every one of the organiser's olympiads, most recently closed first", async () => {
    const organiser = await f.createOrganiser();
    const maths = await f.createOlympiad({ organiser, name: "Maths Olympiad" });
    const science = await f.createOlympiad({ organiser, name: "Science Olympiad", timezone: "UTC" });
    const mathsHeats = await released(maths, "Maths heats", -100);
    const scienceFinal = await released(science, "Science final", -10);
    const mathsFinal = await released(maths, "Maths final", -50);

    const { rounds } = expectOk(await as(organiser).get("/olympiads/archive"));

    expect(rounds.map((r) => r.id)).toEqual([scienceFinal.id, mathsFinal.id, mathsHeats.id]);
    // Each round says which olympiad it belongs to, with that olympiad's timezone
    expect(rounds[0].olympiads).toEqual({ id: science.id, name: "Science Olympiad", timezone: "UTC" });
    expect(rounds[0].papers).toEqual([
      expect.objectContaining({ file_url: "rounds/Science final.pdf", memo_file_url: "rounds/Science final-memo.pdf", is_archived: true }),
    ]);
  });

  it("leaves out other organisers' papers and rounds whose papers aren't archived yet", async () => {
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser });
    const archived = await released(olympiad, "Archived", -10);
    // Results released but the paper not archived, and a round still being marked
    const unarchived = await f.createRound({ olympiad, state: "results_released" });
    await f.createPaper({ round: unarchived, is_archived: false });
    await f.createPaper({ round: await f.createRound({ olympiad, state: "marking" }), is_archived: false });
    // Another organiser's archived paper
    await released(await f.createOlympiad(), "Someone else's", -5);

    const { rounds } = expectOk(await as(organiser).get("/olympiads/archive"));

    expect(rounds.map((r) => r.id)).toEqual([archived.id]);
  });

  it("is empty for an organiser with nothing archived, and for organisers only", async () => {
    const organiser = await f.createOrganiser();
    expect(expectOk(await as(organiser).get("/olympiads/archive"))).toEqual({ rounds: [] });

    const { educatorUser } = await f.createOlympiadWithSchool();
    expectError(await as(educatorUser).get("/olympiads/archive"), 403, "Insufficient permissions");
  });
});

describe("notification rules", () => {
  const base = (olympiad) => `/olympiads/${olympiad.id}/notification-rules`;
  const ruleBody = (overrides = {}) => ({
    name: "Opening reminder",
    trigger: "round_opens",
    offset_minutes: 60,
    recipient: "registered_educators",
    ...overrides,
  });
  const owned = async () => {
    const organiser = await f.createOrganiser();
    return { organiser, olympiad: await f.createOlympiad({ organiser }) };
  };

  it("creates, lists, updates and deletes a rule", async () => {
    const { organiser, olympiad } = await owned();
    const client = as(organiser);

    const { rule } = expectOk(await client.post(base(olympiad)).send(ruleBody({ name: "  Opening reminder ", condition: "  " })), 201);
    expect(rule).toMatchObject({ olympiad_id: olympiad.id, name: "Opening reminder", channel: "in_app", condition: null, enabled: true, offset_minutes: 60 });

    expect(expectOk(await client.get(base(olympiad))).rules.map((r) => r.id)).toEqual([rule.id]);

    const updated = expectOk(await client.patch(`${base(olympiad)}/${rule.id}`).send({ enabled: false, trigger: "round_closes", condition: " Only rounds with submissions " }));
    expect(updated.rule).toMatchObject({ enabled: false, trigger: "round_closes", condition: "Only rounds with submissions", name: "Opening reminder" });

    expect(expectOk(await client.delete(`${base(olympiad)}/${rule.id}`))).toEqual({ message: "Notification rule deleted" });
    expect(expectOk(await client.get(base(olympiad))).rules).toEqual([]);
  });

  it("lists rules newest first and only for that olympiad", async () => {
    const { organiser, olympiad } = await owned();
    const other = await f.createOlympiad({ organiser });
    const first = expectOk(await as(organiser).post(base(olympiad)).send(ruleBody({ name: "First" })), 201).rule;
    const second = expectOk(await as(organiser).post(base(olympiad)).send(ruleBody({ name: "Second" })), 201).rule;
    expectOk(await as(organiser).post(base(other)).send(ruleBody({ name: "Elsewhere" })), 201);

    expect(expectOk(await as(organiser).get(base(olympiad))).rules.map((r) => r.id)).toEqual([second.id, first.id]);
  });

  it.each([
    [{ trigger: "round_deleted" }, "trigger must be one of: round_opens, round_closes, results_released, missing_submission"],
    [{ recipient: "everyone" }, "recipient must be one of: registered_educators, registered_schools, qualifying_entrants"],
    [{ offset_minutes: -5 }, "offset_minutes must be a non-negative integer"],
    [{ enabled: "sometimes" }, "enabled must be true or false"],
    [{ name: 42 }, "name must be text"],
  ])("responds 422 for %o", async (overrides, message) => {
    const { organiser, olympiad } = await owned();
    expectError(await as(organiser).post(base(olympiad)).send(ruleBody(overrides)), 422, message);
  });

  it.each([
    [{ name: "  " }, "Rule name is required"],
    [{ trigger: undefined }, "trigger is required"],
    [{ recipient: undefined }, "recipient is required"],
  ])("responds 400 when creating a rule with %o", async (overrides, message) => {
    const { organiser, olympiad } = await owned();
    expectError(await as(organiser).post(base(olympiad)).send(ruleBody(overrides)), 400, message);
    expect(await prisma.notification_rules.count()).toBe(0);
  });

  it("responds 400 when renaming a rule to blank", async () => {
    const { organiser, olympiad } = await owned();
    const { rule } = expectOk(await as(organiser).post(base(olympiad)).send(ruleBody()), 201);
    expectError(await as(organiser).patch(`${base(olympiad)}/${rule.id}`).send({ name: " " }), 400, "Rule name is required");
  });

  it("keeps rules private to the organiser who owns the olympiad", async () => {
    const { organiser, olympiad } = await owned();
    const { rule } = expectOk(await as(organiser).post(base(olympiad)).send(ruleBody()), 201);
    const intruder = as(await f.createOrganiser());

    expectError(await intruder.get(base(olympiad)), 403, "Not your olympiad");
    expectError(await intruder.post(base(olympiad)).send(ruleBody()), 403, "Not your olympiad");
    expectError(await intruder.patch(`${base(olympiad)}/${rule.id}`).send({ enabled: false }), 403, "Not your olympiad");
    expectError(await intruder.delete(`${base(olympiad)}/${rule.id}`), 403, "Not your olympiad");
    expect((await prisma.notification_rules.findUnique({ where: { id: rule.id } })).enabled).toBe(true);
  });

  it("responds 404 for a rule addressed through a different olympiad", async () => {
    const { organiser, olympiad } = await owned();
    const other = await f.createOlympiad({ organiser });
    const { rule } = expectOk(await as(organiser).post(base(olympiad)).send(ruleBody()), 201);

    expectError(await as(organiser).patch(`${base(other)}/${rule.id}`).send({ enabled: false }), 404, "Notification rule not found");
    expectError(await as(organiser).delete(`${base(other)}/${rule.id}`), 404, "Notification rule not found");
    expect(await prisma.notification_rules.findUnique({ where: { id: rule.id } })).toMatchObject({ enabled: true });
  });

  it("responds 404 for a rule that doesn't exist", async () => {
    const { organiser, olympiad } = await owned();
    const missing = "00000000-0000-4000-8000-000000000000";
    expectError(await as(organiser).patch(`${base(olympiad)}/${missing}`).send({ enabled: false }), 404, "Notification rule not found");
    expectError(await as(organiser).delete(`${base(olympiad)}/${missing}`), 404, "Notification rule not found");
  });
});

describe("a single round", () => {
  const owned = async (roundOverrides = {}) => {
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser });
    const round = await f.createRound({ olympiad, ...roundOverrides });
    return { organiser, olympiad, round, client: as(organiser), intruder: as(await f.createOrganiser()) };
  };
  const MISSING = "00000000-0000-4000-8000-000000000000";

  describe("GET /rounds/:id", () => {
    it("returns the round with its olympiad and papers", async () => {
      const { round, olympiad, client } = await owned();
      await f.createPaper({ round, file_url: "rounds/x/paper.pdf" });
      const data = expectOk(await client.get(`/rounds/${round.id}`));
      expect(data.round).toMatchObject({ id: round.id, olympiads: expect.objectContaining({ id: olympiad.id }) });
    });

    it("responds 403 to another organiser and 404 for an unknown round", async () => {
      const { round, intruder, client } = await owned();
      expectError(await intruder.get(`/rounds/${round.id}`), 403, "Not your round");
      expectError(await client.get(`/rounds/${MISSING}`), 404, "Round not found");
    });
  });

  describe("PATCH /rounds/:id", () => {
    it("edits a scheduled round's name, times and threshold", async () => {
      const { round, client } = await owned();
      const opens_at = iso(72);
      const closes_at = iso(74);

      const data = expectOk(await client.patch(`/rounds/${round.id}`).send({ name: "Round 1 — Regional", opens_at, closes_at, qualifying_threshold: 40 }));

      expect(data.round).toMatchObject({ name: "Round 1 — Regional", opens_at, closes_at, qualifying_threshold: "40" });
    });

    it("can clear the qualifying threshold", async () => {
      const { round, client } = await owned({ qualifying_threshold: 50 });
      expect(expectOk(await client.patch(`/rounds/${round.id}`).send({ qualifying_threshold: null })).round.qualifying_threshold).toBeNull();
    });

    it("responds 400 once the round has opened", async () => {
      const { round, client } = await owned({ state: "open" });
      expectError(await client.patch(`/rounds/${round.id}`).send({ name: "Renamed" }), 400, "Only a round that hasn't opened yet can be edited");
    });

    it("responds 400 when the new times are out of order", async () => {
      const { round, client } = await owned();
      // Only moving the close time is checked against the stored open time
      expectError(await client.patch(`/rounds/${round.id}`).send({ closes_at: iso(1) }), 400, "closes_at must be after opens_at");
    });

    it.each([
      [{ name: "" }, "Round name can't be empty"],
      [{ opens_at: "not a date" }, "opens_at must be a valid date"],
      [{ qualifying_threshold: "high" }, "qualifying_threshold must be a percentage from 0 to 100"],
      [{ qualifying_threshold: -1 }, "qualifying_threshold must be a percentage from 0 to 100"],
      [{ qualifying_threshold: 100.5 }, "qualifying_threshold must be a percentage from 0 to 100"],
    ])("responds 422 for %o", async (body, message) => {
      const { round, client } = await owned();
      expectError(await client.patch(`/rounds/${round.id}`).send(body), 422, message);
    });

    it("responds 403 to another organiser", async () => {
      const { round, intruder } = await owned();
      expectError(await intruder.patch(`/rounds/${round.id}`).send({ name: "Hijacked" }), 403, "Not your round");
    });
  });

  describe("PATCH /rounds/:id/state", () => {
    it.each([
      ["scheduled", "open"],
      ["open", "closed"],
      ["closed", "marking"],
      ["marking", "results_released"],
    ])("moves a %s round to %s", async (from, to) => {
      const { round, client } = await owned({ state: from });
      if (to === "results_released") {
        const school = await f.createSchool();
        const entrant = await f.createEntrant({ school });
        await prisma.results.create({
          data: { round_id: round.id, entrant_id: entrant.id, total_points: 0 },
        });
      }
      expect(expectOk(await client.patch(`/rounds/${round.id}/state`).send({ state: to })).round.state).toBe(to);
    });

    it.each([
      ["scheduled", "closed"],
      ["open", "scheduled"],
      ["results_released", "marking"],
    ])("responds 400 for %s → %s", async (from, to) => {
      const { round, client } = await owned({ state: from });
      if (to === "results_released") {
        const school = await f.createSchool();
        const entrant = await f.createEntrant({ school });
        await prisma.results.create({
          data: { round_id: round.id, entrant_id: entrant.id, total_points: 0 },
        });
      }
      expectError(await client.patch(`/rounds/${round.id}/state`).send({ state: to }), 400, `Cannot transition from "${from}" to "${to}"`);
    });

    it("archives the paper when results are released", async () => {
      const { round, client } = await owned({ state: "marking" });
      const { paper } = await f.createPaper({ round });
      const school = await f.createSchool();
      const entrant = await f.createEntrant({ school });
      await prisma.results.create({
        data: { round_id: round.id, entrant_id: entrant.id, total_points: 0 },
      });
      expectOk(await client.patch(`/rounds/${round.id}/state`).send({ state: "results_released" }));
      expect(await prisma.papers.findUnique({ where: { id: paper.id } })).toMatchObject({ is_archived: true, released_at: expect.any(Date) });
    });

    it("auto-marks received submissions when the round is closed", async () => {
      const { olympiad, school, educator } = await f.createOlympiadWithSchool();
      const organiser = await prisma.users.findUnique({ where: { id: olympiad.organiser_id } });
      const round = await f.createRound({ olympiad, state: "open" });
      const { questions } = await f.createPaper({ round, questions: [{ type: "mcq", options: ["a", "b"], correct_option: "1", max_points: 2 }] });
      const entrant = await f.createEntrant({ school });
      const submission = await prisma.submissions.create({
        data: { round_id: round.id, entrant_id: entrant.id, submitted_by: educator.id, route: "offline", idempotency_key: "k", round_close_snapshot: round.closes_at, answers: { create: [{ question_id: questions[0].id, answer_value: "1" }] } },
      });

      expectOk(await as(organiser).patch(`/rounds/${round.id}/state`).send({ state: "closed" }));

      expect((await prisma.submissions.findUnique({ where: { id: submission.id } })).status).toBe("automarked");
    });

    it.each([[{}, "state is required, state must be a valid round state"], [{ state: "archived" }, "state must be a valid round state"]])(
      "responds 422 for %o",
      async (body, message) => {
        const { round, client } = await owned();
        expectError(await client.patch(`/rounds/${round.id}/state`).send(body), 422, message);
      },
    );

    it("responds 403 to another organiser", async () => {
      const { round, intruder } = await owned();
      expectError(await intruder.patch(`/rounds/${round.id}/state`).send({ state: "open" }), 403, "Not your round");
      expect((await prisma.rounds.findUnique({ where: { id: round.id } })).state).toBe("scheduled");
    });
  });

  describe("DELETE /rounds/:id", () => {
    it("deletes a scheduled round together with its paper and registrations", async () => {
      const { organiser, olympiad, school, educator } = await f.createOlympiadWithSchool();
      const round = await f.createRound({ olympiad });
      await f.createPaper({ round, questions: [{ type: "essay" }] });
      await f.registerEntrant({ entrant: await f.createEntrant({ school }), round, educator });

      expect(expectOk(await as(organiser).delete(`/rounds/${round.id}`))).toEqual({ message: "Round deleted" });
      expect(await prisma.rounds.count()).toBe(0);
      expect(await prisma.papers.count()).toBe(0);
      expect(await prisma.entrant_registrations.count()).toBe(0);
    });

    it("responds 400 once the round has opened", async () => {
      const { round, client } = await owned({ state: "open" });
      expectError(await client.delete(`/rounds/${round.id}`), 400, "Only a round that hasn't opened yet can be deleted");
    });

    it("responds 403 to another organiser and 404 for an unknown round", async () => {
      const { round, intruder, client } = await owned();
      expectError(await intruder.delete(`/rounds/${round.id}`), 403, "Not your round");
      expectError(await client.delete(`/rounds/${MISSING}`), 404, "Round not found");
      expect(await prisma.rounds.count()).toBe(1);
    });
  });

  describe("POST /rounds/:id/papers", () => {
    const PDF = Buffer.from("%PDF-1.4 test");

    it("uploads the paper and memo to storage and records their paths", async () => {
      const { round, client } = await owned();

      const res = await client
        .post(`/rounds/${round.id}/papers`)
        .attach("paper", PDF, { filename: "paper.pdf", contentType: "application/pdf" })
        .attach("memo", PDF, { filename: "memo.pdf", contentType: "application/pdf" });

      const { paper } = expectOk(res, 201);
      expect(paper).toMatchObject({
        round_id: round.id,
        title: round.name,
        file_url: expect.stringMatching(/^shared\/[a-f0-9]{64}$/),
        memo_file_url: expect.stringMatching(/^shared\/[a-f0-9]{64}$/),
      });
      expect(paper.file_url).toBe(paper.memo_file_url);
      expect(supabase.storage.from).toHaveBeenCalledWith("papers");
      expect(supabase.storage.bucket.upload).toHaveBeenCalledWith(paper.file_url, PDF, { contentType: "application/pdf", upsert: true });
    });

    it("replaces the paper file on the round's existing paper", async () => {
      const { round, client } = await owned();
      const { paper: existing } = await f.createPaper({ round, file_url: "rounds/old.pdf", memo_file_url: "rounds/memo.pdf" });

      const res = await client.post(`/rounds/${round.id}/papers`).attach("paper", PDF, "new.pdf");

      const { paper } = expectOk(res, 201);
      expect(paper).toMatchObject({ id: existing.id, file_url: expect.stringMatching(/^shared\/[a-f0-9]{64}$/), memo_file_url: "rounds/memo.pdf" });
      expect(await prisma.papers.count()).toBe(1);
    });

    it("responds 400 without any file", async () => {
      const { round, client } = await owned();
      expectError(await client.post(`/rounds/${round.id}/papers`).field("note", "nothing attached"), 400, "At least one of paper or memo file is required");
    });

    it("responds 400 for an unexpected file field", async () => {
      const { round, client } = await owned();
      expectError(await client.post(`/rounds/${round.id}/papers`).attach("answers", PDF, "answers.pdf"), 400, "Upload rejected: Unexpected field");
    });

    it("responds 413 for a file over 20MB", async () => {
      const { round, client } = await owned();
      const res = await client.post(`/rounds/${round.id}/papers`).attach("paper", Buffer.alloc(20 * 1024 * 1024 + 1), "huge.pdf");
      expectError(res, 413, "File is too large (maximum 20MB)");
      expect(supabase.storage.bucket.upload).not.toHaveBeenCalled();
    });

    it("responds 400 when storage rejects the upload, saving nothing", async () => {
      const { round, client } = await owned();
      supabase.storage.bucket.upload.mockResolvedValueOnce({ data: null, error: { message: "Bucket not found" } });
      expectError(await client.post(`/rounds/${round.id}/papers`).attach("paper", PDF, "p.pdf"), 400, "Paper upload failed: Bucket not found");
      expect(await prisma.papers.count()).toBe(0);
    });

    it("responds 403 to another organiser without uploading", async () => {
      const { round, intruder } = await owned();
      expectError(await intruder.post(`/rounds/${round.id}/papers`).attach("paper", PDF, "p.pdf"), 403, "Not your round");
      expect(supabase.storage.bucket.upload).not.toHaveBeenCalled();
    });
  });
});

// The create-round form asks for holiday warnings before saving. Holidays are
// calendar days, so the check reads the dates in the olympiad's timezone.
describe("POST /rounds/check-dates", () => {
  const { checkDatesForHolidays } = require("../../src/services/holidayService");
  const dates = { opens_at: "2026-06-15T22:30:00.000Z", closes_at: "2026-06-16T08:00:00.000Z" };

  it("returns the holiday warnings for the round's dates", async () => {
    checkDatesForHolidays.mockResolvedValueOnce(["2026-06-16 falls on a public holiday: Youth Day"]);
    const organiser = await f.createOrganiser();

    expect(expectOk(await as(organiser).post("/rounds/check-dates").send(dates))).toEqual({
      warnings: ["2026-06-16 falls on a public holiday: Youth Day"],
    });
    expect(checkDatesForHolidays).toHaveBeenCalledWith([new Date(dates.opens_at), new Date(dates.closes_at)], undefined);
  });

  it("checks on the olympiad's calendar when told which olympiad", async () => {
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser, timezone: "Asia/Kolkata" });

    expectOk(await as(organiser).post("/rounds/check-dates").send({ ...dates, olympiad_id: olympiad.id }));
    expect(checkDatesForHolidays).toHaveBeenCalledWith(expect.any(Array), "Asia/Kolkata");
  });

  it("only for the organiser's own olympiad", async () => {
    const olympiad = await f.createOlympiad();
    const intruder = as(await f.createOrganiser());

    expectError(await intruder.post("/rounds/check-dates").send({ ...dates, olympiad_id: olympiad.id }), 403, "Not your olympiad");
    expectError(await intruder.post("/rounds/check-dates").send({ ...dates, olympiad_id: "oly-1" }), 422, "olympiad_id must be a valid UUID");
    expect(checkDatesForHolidays).not.toHaveBeenCalled();
  });

  it("needs valid dates", async () => {
    const organiser = as(await f.createOrganiser());
    expectError(await organiser.post("/rounds/check-dates").send({ ...dates, opens_at: "tomorrow" }), 422, "opens_at must be a valid date");
    expectError(await organiser.post("/rounds/check-dates").send({ opens_at: dates.opens_at }), 422, "closes_at must be a valid date");
  });
});
