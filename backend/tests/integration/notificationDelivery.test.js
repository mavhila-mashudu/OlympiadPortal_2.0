// In-app notification delivery (I11 reminders, I12 missing submissions,
// I13 results released) against the real database. The lifecycle job calls
// deliverDueNotifications() on every tick; these tests call it directly with
// a fixed clock.
const prisma = require("../../src/config/database").default;
const { deliverDueNotifications } = require("../../src/services/notificationDeliveryService");
const f = require("./helpers/factories");

const MINUTE = 60_000;
const NOW = new Date("2026-10-01T10:00:00.000Z");
const minutesFrom = (base, n) => new Date(base.getTime() + n * MINUTE);

const createRule = (olympiad, overrides = {}) =>
  prisma.notification_rules.create({
    data: {
      olympiad_id: olympiad.id,
      name: "Round opens soon",
      trigger: "round_opens",
      offset_minutes: 60,
      recipient: "registered_educators",
      ...overrides,
    },
  });

const inboxOf = (user) =>
  prisma.portal_notifications.findMany({ where: { user_id: user.id }, orderBy: { created_at: "asc" } });

const recipientsOf = async (rule) =>
  (await prisma.portal_notifications.findMany({ where: { rule_id: rule.id }, select: { user_id: true } }))
    .map((n) => n.user_id)
    .sort();

// An olympiad with one approved school (a coordinator and an educator) and a
// round opening/closing an hour from NOW, so a 60-minute reminder is due now.
const setup = async (roundOverrides = {}) => {
  const world = await f.createOlympiadWithSchool();
  const colleague = await f.createEducator({ school: world.school, membershipRole: "educator" });
  const round = await f.createRound({
    olympiad: world.olympiad,
    name: "Qualifier",
    opens_at: minutesFrom(NOW, 60),
    closes_at: minutesFrom(NOW, 120),
    ...roundOverrides,
  });
  return { ...world, colleague: colleague.user, round };
};

describe("round reminders (I11)", () => {
  it("tells the educators of every approved school that a round opens soon, once", async () => {
    const { olympiad, educatorUser, colleague, round } = await setup();
    const rule = await createRule(olympiad);

    expect(await deliverDueNotifications(NOW)).toBe(2);
    expect(await recipientsOf(rule)).toEqual([educatorUser.id, colleague.id].sort());

    const [note] = await inboxOf(educatorUser);
    expect(note).toMatchObject({
      title: "Round opens soon",
      // 11:00 UTC, written in the olympiad's timezone (South Africa by default)
      body: "Qualifier opens at 01 Oct 2026, 13:00 SAST.",
      round_id: round.id,
      read_at: null,
    });

    // Every later tick in the window finds the same reminder already sent
    expect(await deliverDueNotifications(minutesFrom(NOW, 0.5))).toBe(0);
    expect(await deliverDueNotifications(minutesFrom(NOW, 4))).toBe(0);
    expect(await prisma.portal_notifications.count()).toBe(2);
  });

  it("writes the time in the olympiad's own timezone", async () => {
    const { olympiad, educatorUser } = await setup();
    await prisma.olympiads.update({ where: { id: olympiad.id }, data: { timezone: "Asia/Kolkata" } });
    await createRule(olympiad);

    await deliverDueNotifications(NOW);
    expect((await inboxOf(educatorUser))[0].body).toBe("Qualifier opens at 01 Oct 2026, 16:30 GMT+5:30.");
  });

  it("reminds before closing time with the round_closes trigger", async () => {
    const { olympiad, educatorUser } = await setup({ opens_at: minutesFrom(NOW, -60), closes_at: minutesFrom(NOW, 30) });
    await createRule(olympiad, { name: "Round closes soon", trigger: "round_closes", offset_minutes: 30 });

    expect(await deliverDueNotifications(NOW)).toBe(2);
    expect((await inboxOf(educatorUser))[0].body).toBe("Qualifier closes at 01 Oct 2026, 12:30 SAST.");
  });

  it("waits until the reminder is due, and never sends one more than five minutes late", async () => {
    const { olympiad } = await setup();
    await createRule(olympiad);

    expect(await deliverDueNotifications(minutesFrom(NOW, -1))).toBe(0);
    // A server that was down when the reminder fell due doesn't send it late
    expect(await deliverDueNotifications(minutesFrom(NOW, 6))).toBe(0);
    expect(await prisma.portal_notifications.count()).toBe(0);
  });

  it("reaches only this olympiad's approved schools and their active, undeleted members", async () => {
    const { olympiad, organiser, school, educatorUser, colleague } = await setup();
    const rule = await createRule(olympiad);

    // A school whose registration is still pending
    const pending = await f.createSchool();
    await f.registerSchool(pending, olympiad, { status: "pending" });
    await f.createEducator({ school: pending });
    // A school in someone else's olympiad
    const elsewhere = await f.createSchool();
    await f.registerSchool(elsewhere, await f.createOlympiad());
    await f.createEducator({ school: elsewhere });
    // Former and deleted members of the registered school
    const left = await f.createEducator({ school, membershipRole: "educator" });
    await prisma.school_memberships.updateMany({ where: { user_id: left.user.id }, data: { status: "removed" } });
    const deleted = await f.createEducator({ school, membershipRole: "educator" });
    await prisma.users.update({ where: { id: deleted.user.id }, data: { deleted_at: NOW } });

    await deliverDueNotifications(NOW);
    expect(await recipientsOf(rule)).toEqual([educatorUser.id, colleague.id].sort());
    expect(await inboxOf(organiser)).toEqual([]);
  });

  it("sends nothing for a disabled rule", async () => {
    const { olympiad } = await setup();
    await createRule(olympiad, { enabled: false });

    expect(await deliverDueNotifications(NOW)).toBe(0);
  });

  it("applies the rule's condition to the round", async () => {
    const { olympiad, round, school, educator } = await setup({ opens_at: minutesFrom(NOW, -60), closes_at: minutesFrom(NOW, 60) });
    const onlyWith = await createRule(olympiad, { name: "With", trigger: "round_closes", condition: "Only rounds with submissions" });
    const onlyWithout = await createRule(olympiad, { name: "Without", trigger: "round_closes", condition: "Only rounds without submissions" });

    await deliverDueNotifications(NOW);
    expect(await recipientsOf(onlyWith)).toEqual([]);
    expect(await recipientsOf(onlyWithout)).toHaveLength(2);

    // Once a submission arrives, the other rule's reminder applies instead
    const entrant = await f.createEntrant({ school });
    await prisma.submissions.create({
      data: { round_id: round.id, entrant_id: entrant.id, submitted_by: educator.id, route: "offline", idempotency_key: `k-${entrant.id}`, round_close_snapshot: round.closes_at },
    });
    await prisma.portal_notifications.deleteMany();
    await deliverDueNotifications(NOW);
    expect(await recipientsOf(onlyWith)).toHaveLength(2);
    expect(await recipientsOf(onlyWithout)).toEqual([]);
  });

  it("alerts only the organiser when the rule's action is alert_organiser", async () => {
    const { olympiad, organiser } = await setup();
    const rule = await createRule(olympiad, { action: "alert_organiser" });

    expect(await deliverDueNotifications(NOW)).toBe(1);
    expect(await recipientsOf(rule)).toEqual([organiser.id]);
  });
});

describe("missing submissions (I12)", () => {
  // Three participating schools and one that entered nobody. Only the round's
  // participating schools can owe results.
  const missingSetup = async () => {
    const world = await setup({ opens_at: minutesFrom(NOW, -120), closes_at: minutesFrom(NOW, 60) });
    const { olympiad, round } = world;

    const school = async (name) => {
      const s = await f.createSchool({ name });
      await f.registerSchool(s, olympiad);
      const { user, educator } = await f.createEducator({ school: s });
      const entrant = await f.createEntrant({ school: s });
      await f.registerEntrant({ entrant, round, educator });
      return { school: s, user, educator, entrant };
    };
    const submit = ({ entrant, educator }, overrides) =>
      prisma.submissions.create({
        data: {
          round_id: round.id,
          entrant_id: entrant.id,
          submitted_by: educator.id,
          route: "offline",
          idempotency_key: `k-${entrant.id}`,
          round_close_snapshot: round.closes_at,
          ...overrides,
        },
      });

    const paperSent = await school("Paper Sent High");
    await submit(paperSent);
    const onlineDone = await school("Online Done High");
    await submit(onlineDone, { route: "online", submitted_by: null, status: "automarked" });
    // A learner who opened the online exam but never submitted it
    const onlineStarted = await school("Online Started High");
    await submit(onlineStarted, { route: "online", submitted_by: null, status: "received" });
    const nothing = await school("Nothing Yet High");
    // world.school is registered for the olympiad but entered nobody this round

    const rule = await createRule(olympiad, { name: "Submission still missing", trigger: "missing_submission", recipient: "registered_schools" });
    return { ...world, rule, paperSent, onlineDone, onlineStarted, nothing };
  };

  it("chases only participating schools whose results haven't arrived", async () => {
    const { rule, onlineStarted, nothing } = await missingSetup();

    expect(await deliverDueNotifications(NOW)).toBe(2);
    expect(await recipientsOf(rule)).toEqual([onlineStarted.user.id, nothing.user.id].sort());
  });

  it("says which round is outstanding and when it closes", async () => {
    const { nothing } = await missingSetup();

    await deliverDueNotifications(NOW);
    expect((await inboxOf(nothing.user))[0].body).toBe(
      "Your school's results for Qualifier have not arrived. This round closes at 01 Oct 2026, 13:00 SAST.",
    );
  });
});

describe("results released (I13)", () => {
  const release = (round, at = NOW) =>
    prisma.rounds.update({ where: { id: round.id }, data: { state: "results_released", results_release_at: at } });

  it("tells the schools once results are released, and not before", async () => {
    const { olympiad, round, educatorUser } = await setup();
    await createRule(olympiad, { name: "Results released", trigger: "results_released", offset_minutes: 0, recipient: "registered_schools" });

    expect(await deliverDueNotifications(NOW)).toBe(0);

    await release(round);
    expect(await deliverDueNotifications(minutesFrom(NOW, 0.5))).toBe(2);
    expect((await inboxOf(educatorUser))[0]).toMatchObject({ title: "Results released", body: "Results for Qualifier are available in the portal." });
  });

  it("still announces results when the rule has an offset", async () => {
    // Results can't be announced before they exist, so an offset on this
    // trigger must not push the notification to before the release.
    const { olympiad, round } = await setup();
    const rule = await createRule(olympiad, { name: "Results released", trigger: "results_released", offset_minutes: 60 });
    await release(round);

    expect(await deliverDueNotifications(minutesFrom(NOW, 0.5))).toBe(2);
    expect(await recipientsOf(rule)).toHaveLength(2);
  });

  it("previews the same send time the scheduler uses", async () => {
    const { testRule } = require("../../src/services/notificationRuleService");
    const { olympiad, organiser, round } = await setup();
    const reminder = await createRule(olympiad);
    const results = await createRule(olympiad, { name: "Results released", trigger: "results_released", offset_minutes: 60 });
    await release(round);

    const preview = (rule) => testRule({ ruleId: rule.id, organiserId: organiser.id, roundId: round.id });
    expect((await preview(reminder)).trigger.fires_at).toEqual(NOW);
    expect((await preview(results)).trigger.fires_at).toEqual(NOW);
  });

  it("can congratulate just the learners who qualified", async () => {
    const { olympiad, round, school } = await setup();
    const rule = await createRule(olympiad, { name: "You qualified", trigger: "results_released", offset_minutes: 0, recipient: "qualifying_entrants" });

    const qualified = await f.createStudent({ school });
    const notQualified = await f.createStudent({ school });
    const noLogin = await f.createEntrant({ school });
    await prisma.results.createMany({
      data: [
        { round_id: round.id, entrant_id: qualified.entrant.id, total_points: 80, qualified: true },
        { round_id: round.id, entrant_id: notQualified.entrant.id, total_points: 20, qualified: false },
        { round_id: round.id, entrant_id: noLogin.id, total_points: 90, qualified: true },
      ],
    });
    await release(round);

    expect(await deliverDueNotifications(NOW)).toBe(1);
    expect(await recipientsOf(rule)).toEqual([qualified.user.id]);
  });
});

describe("default rules", () => {
  it("gives every new olympiad the four standard rules, which then deliver", async () => {
    const olympiadService = require("../../src/services/olympiadService");
    const organiser = await f.createOrganiser();
    const olympiad = await olympiadService.createOlympiad({ name: "Maths 2026", organiserId: organiser.id });

    const rules = await prisma.notification_rules.findMany({ where: { olympiad_id: olympiad.id } });
    expect(rules.map((r) => r.trigger).sort()).toEqual(["missing_submission", "results_released", "round_closes", "round_opens"]);
    expect(rules.every((r) => r.enabled && r.channel === "in_app")).toBe(true);

    const school = await f.createSchool();
    await f.registerSchool(school, olympiad);
    const { user } = await f.createEducator({ school });
    await f.createRound({ olympiad, name: "Heat 1", opens_at: minutesFrom(NOW, 60), closes_at: minutesFrom(NOW, 180) });

    expect(await deliverDueNotifications(NOW)).toBe(1);
    expect((await inboxOf(user))[0].title).toBe("Round opens soon");
  });
});
