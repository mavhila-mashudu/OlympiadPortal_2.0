jest.mock("../../../src/config/database", () => ({
  __esModule: true,
  default: require("../helpers/prismaMock").prisma,
}));

const { prisma, resetPrismaMock } = require("../helpers/prismaMock");
const {
  listRules,
  createRule,
  updateRule,
  deleteRule,
} = require("../../../src/services/notificationRuleService");

beforeEach(() => {
  resetPrismaMock();
  prisma.olympiads.findUnique.mockResolvedValue({ id: "oly-1", organiser_id: "org-1" });
});

const validRule = (overrides = {}) => ({
  name: "Round opening reminder",
  trigger: "round_opens",
  recipient: "registered_educators",
  offset_minutes: 60,
  ...overrides,
});

describe("listRules", () => {
  it("lists the olympiad's rules for its owner, newest first", async () => {
    prisma.notification_rules.findMany.mockResolvedValue([{ id: "rule-1" }]);
    await expect(listRules("oly-1", "org-1")).resolves.toEqual([{ id: "rule-1" }]);
    expect(prisma.notification_rules.findMany).toHaveBeenCalledWith({
      where: { olympiad_id: "oly-1" },
      orderBy: { created_at: "desc" },
    });
  });

  it("rejects an organiser who doesn't own the olympiad", async () => {
    await expect(listRules("oly-1", "org-2")).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("createRule", () => {
  const create = (data) => createRule({ olympiadId: "oly-1", organiserId: "org-1", data });

  it("creates an email rule with trimmed text", async () => {
    prisma.notification_rules.create.mockResolvedValue({ id: "rule-1" });

    await expect(
      create(validRule({ name: "  Reminder  ", condition: "  grade >= 10 ", enabled: false })),
    ).resolves.toEqual({ id: "rule-1" });
    expect(prisma.notification_rules.create).toHaveBeenCalledWith({
      data: {
        olympiad_id: "oly-1",
        name: "Reminder",
        trigger: "round_opens",
        offset_minutes: 60,
        recipient: "registered_educators",
        channel: "email",
        condition: "grade >= 10",
        enabled: false,
      },
    });
  });

  it("defaults the offset to 0, the condition to null and enabled to true", async () => {
    await create(validRule({ offset_minutes: undefined, condition: "   " }));
    expect(prisma.notification_rules.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ offset_minutes: 0, condition: null, enabled: true }),
    });
  });

  it.each([
    [{ trigger: "round_deleted" }, "Invalid notification trigger"],
    [{ recipient: "everyone" }, "Invalid notification recipient"],
    [{ offset_minutes: -5 }, "offset_minutes must be a non-negative integer"],
    [{ offset_minutes: 2.5 }, "offset_minutes must be a non-negative integer"],
    [{ offset_minutes: "60" }, "offset_minutes must be a non-negative integer"],
    [{ name: "   " }, "Rule name is required"],
    [{ name: undefined }, "Rule name is required"],
  ])("rejects %p", async (overrides, message) => {
    await expect(create(validRule(overrides))).rejects.toMatchObject({ statusCode: 400, message });
    expect(prisma.notification_rules.create).not.toHaveBeenCalled();
  });

  it.each(["round_opens", "round_closes", "results_released"])("accepts the %s trigger", async (trigger) => {
    await expect(create(validRule({ trigger }))).resolves.toBeUndefined();
  });

  it.each(["registered_educators", "registered_schools", "qualifying_entrants"])(
    "accepts the %s recipient",
    async (recipient) => {
      await expect(create(validRule({ recipient }))).resolves.toBeUndefined();
    },
  );

  it("checks ownership before validating", async () => {
    await expect(
      createRule({ olympiadId: "oly-1", organiserId: "org-2", data: validRule({ trigger: "bad" }) }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("updateRule", () => {
  const update = (data) => updateRule({ ruleId: "rule-1", organiserId: "org-1", data });

  beforeEach(() => {
    prisma.notification_rules.findUnique.mockResolvedValue({ id: "rule-1", olympiad_id: "oly-1" });
  });

  it("rejects an unknown rule", async () => {
    prisma.notification_rules.findUnique.mockResolvedValue(null);
    await expect(update({ name: "x" })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects an organiser who doesn't own the rule's olympiad", async () => {
    await expect(
      updateRule({ ruleId: "rule-1", organiserId: "org-2", data: {} }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("updates only the fields that were sent", async () => {
    prisma.notification_rules.update.mockResolvedValue({ id: "rule-1" });
    await update({ name: " Final reminder ", enabled: false });
    expect(prisma.notification_rules.update).toHaveBeenCalledWith({
      where: { id: "rule-1" },
      data: { name: "Final reminder", enabled: false },
    });
  });

  it("updates trigger, recipient and offset together", async () => {
    await update({ trigger: "round_closes", recipient: "registered_schools", offset_minutes: 0 });
    expect(prisma.notification_rules.update).toHaveBeenCalledWith({
      where: { id: "rule-1" },
      data: { trigger: "round_closes", recipient: "registered_schools", offset_minutes: 0 },
    });
  });

  it.each([
    ["  qualified only ", "qualified only"],
    ["   ", null],
    [null, null],
  ])("stores condition %p as %p", async (condition, stored) => {
    await update({ condition });
    expect(prisma.notification_rules.update).toHaveBeenCalledWith({
      where: { id: "rule-1" },
      data: { condition: stored },
    });
  });

  it("rejects a blank name", async () => {
    await expect(update({ name: "  " })).rejects.toMatchObject({ message: "Rule name is required" });
  });

  it("validates changed fields", async () => {
    await expect(update({ recipient: "nobody" })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("deleteRule", () => {
  it("rejects an unknown rule", async () => {
    prisma.notification_rules.findUnique.mockResolvedValue(null);
    await expect(deleteRule("rule-x", "org-1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects an organiser who doesn't own it", async () => {
    prisma.notification_rules.findUnique.mockResolvedValue({ id: "rule-1", olympiad_id: "oly-1" });
    await expect(deleteRule("rule-1", "org-2")).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.notification_rules.delete).not.toHaveBeenCalled();
  });

  it("deletes the owner's rule", async () => {
    prisma.notification_rules.findUnique.mockResolvedValue({ id: "rule-1", olympiad_id: "oly-1" });
    await deleteRule("rule-1", "org-1");
    expect(prisma.notification_rules.delete).toHaveBeenCalledWith({ where: { id: "rule-1" } });
  });
});
