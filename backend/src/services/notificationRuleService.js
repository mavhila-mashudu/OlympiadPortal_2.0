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

const testRule = async ({ ruleId, organiserId, roundId }) => {
  const rule = await prisma.notification_rules.findUnique({
    where: { id: ruleId },
  });
  if (!rule) throw new NotFoundError("Notification rule not found");

  await assertOwnsOlympiad(rule.olympiad_id, organiserId);
  if (!roundId) throw new BadRequestError("round_id is required");

  const round = await prisma.rounds.findFirst({
    where: { id: roundId, olympiad_id: rule.olympiad_id },
    include: {
      _count: { select: { submissions: true, entrant_registrations: true } },
      results: { where: { qualified: true }, select: { id: true } },
      olympiads: {
        include: {
          school_registrations: {
            where: { status: "approved" },
            include: { schools: { select: { id: true, educators: { select: { id: true } } } } },
          },
        },
      },
    },
  });
  if (!round) throw new NotFoundError("Round not found for this olympiad");

  const triggerAt = {
    round_opens: round.opens_at,
    round_closes: round.closes_at,
    results_released: round.results_release_at,
  }[rule.trigger];
  const warnings = [];
  if (!triggerAt) warnings.push("This round has no results release time configured.");

  const condition = rule.condition?.trim().toLowerCase() || null;
  let conditionMatched = true;
  if (condition) {
    if (/no submissions?/.test(condition)) conditionMatched = round._count.submissions === 0;
    else if (/submissions?/.test(condition)) conditionMatched = round._count.submissions > 0;
    else warnings.push("The condition was not evaluated because it uses an unsupported phrase.");
  }
  if (!conditionMatched) warnings.push("The configured condition does not match this round.");

  const recipientCount = rule.recipient === "registered_schools"
    ? round.olympiads.school_registrations.length
    : rule.recipient === "registered_educators"
      ? new Set(round.olympiads.school_registrations.flatMap(({ schools }) => schools.educators.map(({ id }) => id))).size
      : round.results.length;

  return {
    rule: { id: rule.id, name: rule.name, enabled: rule.enabled },
    round: { id: round.id, name: round.name, state: round.state },
    trigger: {
      type: rule.trigger,
      fires_at: triggerAt ? new Date(new Date(triggerAt).getTime() - rule.offset_minutes * 60 * 1000) : null,
      source_time: triggerAt,
      offset_minutes: rule.offset_minutes,
    },
    condition: { expression: rule.condition, matched: conditionMatched },
    recipients: { type: rule.recipient, count: recipientCount },
    would_send: Boolean(triggerAt) && conditionMatched && recipientCount > 0,
    warnings,
  };
};

module.exports = { listRules, createRule, updateRule, deleteRule, testRule };