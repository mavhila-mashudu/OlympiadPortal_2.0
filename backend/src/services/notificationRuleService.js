const prisma = require("../config/database").default;
const { assertOwnsOlympiad } = require("./olympiadService");
const { NotFoundError, BadRequestError } = require("../errors/AppError");

const triggers = new Set(["round_opens", "round_closes", "results_released"]);
const recipients = new Set([
  "registered_educators",
  "registered_schools",
  "qualifying_entrants",
]);

function validateRule({ trigger, offset_minutes, recipient }) {
  if (trigger !== undefined && !triggers.has(trigger)) {
    throw new BadRequestError("Invalid notification trigger");
  }
  if (recipient !== undefined && !recipients.has(recipient)) {
    throw new BadRequestError("Invalid notification recipient");
  }
  if (offset_minutes !== undefined && (!Number.isInteger(offset_minutes) || offset_minutes < 0)) {
    throw new BadRequestError("offset_minutes must be a non-negative integer");
  }
}

const listRules = async (olympiadId, organiserId) => {
  await assertOwnsOlympiad(olympiadId, organiserId);
  return prisma.notification_rules.findMany({
    where: { olympiad_id: olympiadId },
    orderBy: { created_at: "desc" },
  });
};

const createRule = async ({ olympiadId, organiserId, data }) => {
  await assertOwnsOlympiad(olympiadId, organiserId);
  validateRule(data);
  if (!data.name?.trim()) throw new BadRequestError("Rule name is required");
  // Required columns — without them the insert itself would fail
  if (data.trigger === undefined) throw new BadRequestError("trigger is required");
  if (data.recipient === undefined) throw new BadRequestError("recipient is required");

  return prisma.notification_rules.create({
    data: {
      olympiad_id: olympiadId,
      name: data.name.trim(),
      trigger: data.trigger,
      offset_minutes: data.offset_minutes ?? 0,
      recipient: data.recipient,
      channel: "email",
      condition: data.condition?.trim() || null,
      enabled: data.enabled ?? true,
    },
  });
};

// A rule outside the olympiad named in the request is reported as missing
const isOutside = (rule, olympiadId) =>
  olympiadId !== undefined && rule.olympiad_id !== olympiadId;

const updateRule = async ({ ruleId, organiserId, data, olympiadId }) => {
  const rule = await prisma.notification_rules.findUnique({
    where: { id: ruleId },
    include: { olympiads: true },
  });
  if (!rule || isOutside(rule, olympiadId)) {
    throw new NotFoundError("Notification rule not found");
  }
  await assertOwnsOlympiad(rule.olympiad_id, organiserId);
  validateRule(data);

  const update = {};
  if (data.name !== undefined) {
    if (!data.name.trim()) throw new BadRequestError("Rule name is required");
    update.name = data.name.trim();
  }
  for (const field of ["trigger", "recipient", "condition", "enabled"]) {
    if (data[field] !== undefined) update[field] = field === "condition" ? data[field]?.trim() || null : data[field];
  }
  if (data.offset_minutes !== undefined) update.offset_minutes = data.offset_minutes;

  return prisma.notification_rules.update({ where: { id: ruleId }, data: update });
};

const deleteRule = async (ruleId, organiserId, olympiadId) => {
  const rule = await prisma.notification_rules.findUnique({ where: { id: ruleId } });
  if (!rule || isOutside(rule, olympiadId)) {
    throw new NotFoundError("Notification rule not found");
  }
  await assertOwnsOlympiad(rule.olympiad_id, organiserId);
  await prisma.notification_rules.delete({ where: { id: ruleId } });
};

module.exports = { listRules, createRule, updateRule, deleteRule };