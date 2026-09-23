// Organiser tools: the schools list, notification rules, paper uploads,
// viewing links and the paper archive, against the real database.
jest.mock("../../src/config/supabase", () => require("./helpers/externalMocks").supabase);

const prisma = require("../../src/config/database").default;
const schoolService = require("../../src/services/schoolService");
const notificationRuleService = require("../../src/services/notificationRuleService");
const paperService = require("../../src/services/paperService");
const { supabase, resetExternalMocks } = require("./helpers/externalMocks");
const f = require("./helpers/factories");

beforeEach(resetExternalMocks);

describe("schools list", () => {
  it("shows participating schools and outstanding educator invitations with statuses", async () => {
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser });

    // Invited, no answer yet
    const pendingSchool = await f.createSchool({ name: "Pending High" });
    const pendingHead = await f.createEducator({
      school: pendingSchool,
      userOverrides: { full_name: "Head Teacher", email: "p@school.test" },
    });
    await f.createInvite({
      olympiad,
      invitee: pendingHead.user,
      invitedBy: organiser,
      school: pendingSchool,
    });

    // Invited and turned down
    const declinedSchool = await f.createSchool({ name: "Declined High" });
    const declinedHead = await f.createEducator({ school: declinedSchool });
    await f.createInvite({
      olympiad,
      invitee: declinedHead.user,
      invitedBy: organiser,
      school: declinedSchool,
      status: "rejected",
    });

    // Invited and accepted: registered, so listed as a participant
    const accepted = await f.createSchool({ name: "Accepted High" });
    const head = await f.createEducator({
      school: accepted,
      userOverrides: { full_name: "Ms Naidoo", email: "naidoo@accepted.test" },
    });
    await f.createInvite({
      olympiad,
      invitee: head.user,
      invitedBy: organiser,
      school: accepted,
      status: "accepted",
    });
    await f.registerSchool(accepted, olympiad);
    await f.createEntrant({ school: accepted });

    // Another olympiad's invitation must not leak in
    const elsewhere = await f.createOlympiad();
    const otherHead = await f.createEducator();
    await f.createInvite({
      olympiad: elsewhere,
      invitee: otherHead.user,
      invitedBy: organiser,
      school: otherHead.school,
    });

    const rows = await schoolService.listSchools(olympiad.id, organiser.id);
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));

    expect(Object.keys(byName).sort()).toEqual(["Accepted High", "Declined High", "Pending High"]);
    expect(byName["Pending High"]).toMatchObject({
      status: "pending",
      contactEmail: "p@school.test",
      entrants: 0,
    });
    expect(byName["Declined High"].status).toBe("declined");
    expect(byName["Accepted High"]).toMatchObject({
      status: "accepted",
      entrants: 1,
      educators: [{ name: "Ms Naidoo", email: "naidoo@accepted.test" }],
    });
  });
});

describe("notification rules", () => {
  it("creates, updates, lists and deletes an olympiad's rules", async () => {
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser });

    const rule = await notificationRuleService.createRule({
      olympiadId: olympiad.id,
      organiserId: organiser.id,
      data: { name: "  Opening reminder ", trigger: "round_opens", recipient: "registered_educators", offset_minutes: 60 },
    });
    expect(await prisma.notification_rules.findUnique({ where: { id: rule.id } })).toMatchObject({
      name: "Opening reminder",
      channel: "email",
      enabled: true,
      offset_minutes: 60,
      condition: null,
    });

    const before = rule.updated_at;
    await new Promise((r) => setTimeout(r, 5));
    const updated = await notificationRuleService.updateRule({
      ruleId: rule.id,
      organiserId: organiser.id,
      data: { enabled: false, condition: " grade 12 only " },
    });
    expect(updated).toMatchObject({ enabled: false, condition: "grade 12 only", name: "Opening reminder" });
    expect(updated.updated_at.getTime()).toBeGreaterThan(before.getTime());

    expect(await notificationRuleService.listRules(olympiad.id, organiser.id)).toHaveLength(1);
    await notificationRuleService.deleteRule(rule.id, organiser.id);
    expect(await prisma.notification_rules.count()).toBe(0);
  });

  it("saves nothing for an invalid rule", async () => {
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser });
    await expect(
      notificationRuleService.createRule({
        olympiadId: olympiad.id,
        organiserId: organiser.id,
        data: { name: "Bad", trigger: "every_hour", recipient: "registered_schools" },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await prisma.notification_rules.count()).toBe(0);
  });

  it("won't let another organiser change or remove a rule", async () => {
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser });
    const rule = await prisma.notification_rules.create({
      data: { olympiad_id: olympiad.id, name: "Rule", trigger: "results_released", recipient: "qualifying_entrants" },
    });
    const intruder = await f.createOrganiser();

    await expect(notificationRuleService.deleteRule(rule.id, intruder.id)).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      notificationRuleService.updateRule({ ruleId: rule.id, organiserId: intruder.id, data: { enabled: false } }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(await prisma.notification_rules.findUnique({ where: { id: rule.id } })).toMatchObject({ enabled: true });
  });
});

describe("papers", () => {
  const pdf = (name) => ({ originalname: name, buffer: Buffer.from("%PDF-1.4"), mimetype: "application/pdf" });

  it("uploads a paper, then adds the memo to the same paper row", async () => {
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser });
    const round = await f.createRound({ olympiad, name: "Round 1" });

    const first = await paperService.uploadRoundPapers({ roundId: round.id, organiserId: organiser.id, paperFile: pdf("paper.pdf") });
    const second = await paperService.uploadRoundPapers({ roundId: round.id, organiserId: organiser.id, memoFile: pdf("memo.pdf") });

    expect(second.id).toBe(first.id);
    const stored = await prisma.papers.findMany({ where: { round_id: round.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      title: "Round 1",
      file_url: expect.stringMatching(new RegExp(`^rounds/${round.id}/paper-\\d+-paper\\.pdf$`)),
      memo_file_url: expect.stringMatching(new RegExp(`^rounds/${round.id}/memo-\\d+-memo\\.pdf$`)),
    });
    expect(supabase.storage.bucket.upload).toHaveBeenCalledTimes(2);
  });

  it("saves no paper row when the storage upload fails", async () => {
    const organiser = await f.createOrganiser();
    const round = await f.createRound({ olympiad: await f.createOlympiad({ organiser }) });
    supabase.storage.bucket.upload.mockResolvedValue({ error: { message: "bucket full" } });

    await expect(
      paperService.uploadRoundPapers({ roundId: round.id, organiserId: organiser.id, paperFile: pdf("paper.pdf") }),
    ).rejects.toMatchObject({ message: "Paper upload failed: bucket full" });
    expect(await prisma.papers.count()).toBe(0);
  });

  it("gives the organiser both files and a registered school's educator only the paper", async () => {
    // Regression coverage for the viewer endpoint that crashed before
    // questionService exported assertRoundAccess.
    const { organiser, olympiad, educatorUser } = await f.createOlympiadWithSchool();
    const round = await f.createRound({ olympiad });
    await f.createPaper({ round, file_url: "rounds/r/paper.pdf", memo_file_url: "rounds/r/memo.pdf" });

    await expect(paperService.getRoundViewUrl(round.id, organiser.id, "organiser", "memo")).resolves.toBe(
      "https://storage.test/rounds/r/memo.pdf?expires=3600",
    );
    await expect(paperService.getRoundViewUrl(round.id, educatorUser.id, "educator", "paper")).resolves.toBe(
      "https://storage.test/rounds/r/paper.pdf?expires=3600",
    );
    await expect(paperService.getRoundViewUrl(round.id, educatorUser.id, "educator", "memo")).rejects.toMatchObject({
      statusCode: 403,
    });

    const outsider = await f.createEducator();
    await expect(paperService.getRoundViewUrl(round.id, outsider.user.id, "educator", "paper")).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("signs a short-lived organiser download link by paper id", async () => {
    const organiser = await f.createOrganiser();
    const round = await f.createRound({ olympiad: await f.createOlympiad({ organiser }) });
    const { paper } = await f.createPaper({ round, file_url: "rounds/r/paper.pdf" });

    await expect(paperService.getDownloadUrl(paper.id, organiser.id, "paper")).resolves.toBe(
      "https://storage.test/rounds/r/paper.pdf?expires=60",
    );
    await expect(paperService.getDownloadUrl(paper.id, (await f.createOrganiser()).id, "paper")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("archives released rounds that have archived papers", async () => {
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser });
    const released = await f.createRound({ olympiad, state: "results_released", closes_at: f.hoursFromNow(-5), opens_at: f.hoursFromNow(-6) });
    await f.createPaper({ round: released, is_archived: true, released_at: new Date() });
    const notArchived = await f.createRound({ olympiad, state: "results_released" });
    await f.createPaper({ round: notArchived });
    await f.createRound({ olympiad, state: "closed" });

    const archive = await paperService.listArchive(olympiad.id, organiser.id);
    expect(archive.map((r) => r.id)).toEqual([released.id]);
    expect(archive[0].papers).toHaveLength(1);
  });
});
