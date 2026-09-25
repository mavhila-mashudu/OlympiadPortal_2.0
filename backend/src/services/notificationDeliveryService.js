// In-app delivery. The unique dedupe key makes repeated scheduler ticks safe.
const prisma = require("../config/database").default;
const { recordRoundEvent } = require("./roundAuditService");

const defaultRules = [
  { name: "Round opens soon", trigger: "round_opens", offset_minutes: 60, recipient: "registered_educators" },
  { name: "Round closes soon", trigger: "round_closes", offset_minutes: 60, recipient: "registered_educators" },
  { name: "Submission still missing", trigger: "missing_submission", offset_minutes: 60, recipient: "registered_schools" },
  { name: "Results released", trigger: "results_released", offset_minutes: 0, recipient: "registered_schools" },
];

async function resolveRecipients(rule, round) {
  const registrations = await prisma.school_registrations.findMany({
    where: { olympiad_id: round.olympiad_id, status: "approved" },
    select: { school_id: true },
  });
  let schoolIds = registrations.map((r) => r.school_id);
  if (rule.trigger === "missing_submission") {
    const entered = await prisma.entrant_registrations.findMany({
      where: { round_id: round.id }, select: { entrants: { select: { school_id: true } } },
    });
    const participatingSchools = new Set(entered.map((r) => r.entrants.school_id));
    schoolIds = schoolIds.filter((id) => participatingSchools.has(id));
    const received = await prisma.submissions.findMany({
      where: { round_id: round.id, OR: [{ route: "offline" }, { status: { not: "received" } }] },
      select: { entrants: { select: { school_id: true } } },
    });
    const submittedSchools = new Set(received.map((s) => s.entrants.school_id));
    schoolIds = schoolIds.filter((id) => !submittedSchools.has(id));
  }
  if (rule.recipient === "qualifying_entrants") {
    const results = await prisma.results.findMany({
      where: { round_id: round.id, qualified: true, entrants: { user_id: { not: null } } },
      select: { entrants: { select: { user_id: true } } },
    });
    return [...new Set(results.map((r) => r.entrants.user_id).filter(Boolean))];
  }
  const members = await prisma.school_memberships.findMany({
    where: { school_id: { in: schoolIds }, status: "active", role: { in: ["educator", "coordinator"] }, users: { deleted_at: null } },
    select: { user_id: true },
  });
  return [...new Set(members.map((m) => m.user_id))];
}

function conditionMatches(condition, round) {
  if (!condition) return true;
  const value = condition.trim().toLowerCase();
  if (value === "only rounds with submissions") return round.submissions.length > 0;
  if (value === "only rounds without submissions") return round.submissions.length === 0;
  return false;
}

async function deliverDueNotifications(now = new Date()) {
  const rules = await prisma.notification_rules.findMany({ where: { enabled: true, channel: "in_app" } });
  let delivered = 0;
  for (const rule of rules) {
    const rounds = await prisma.rounds.findMany({
      where: { olympiad_id: rule.olympiad_id },
      select: { id: true, name: true, olympiad_id: true, opens_at: true, closes_at: true, results_release_at: true, submissions: { select: { id: true } } },
    });
    for (const round of rounds) {
      const source = rule.trigger === "round_opens" ? round.opens_at
        : rule.trigger === "results_released" ? round.results_release_at : round.closes_at;
      if (!source) continue;
      const dueAt = new Date(source).getTime() - rule.offset_minutes * 60_000;
      // Only send within five minutes of the intended delivery time. Never send
      // historical reminders after a restart or during initial deployment.
      if (dueAt > now.getTime() || dueAt <= now.getTime() - 5 * 60_000) continue;
      if (!conditionMatches(rule.condition, round)) continue;
      const recipients = rule.action === "alert_organiser"
        ? [(await prisma.olympiads.findUnique({ where: { id: rule.olympiad_id }, select: { organiser_id: true } }))?.organiser_id].filter(Boolean)
        : await resolveRecipients(rule, round);
      if (!recipients.length) continue;
      const message = rule.trigger === "missing_submission"
        ? `Your school's results for ${round.name} have not arrived. This round closes at ${round.closes_at.toISOString()}.`
        : rule.trigger === "results_released"
          ? `Results for ${round.name} are available in the portal.`
          : `${round.name} ${rule.trigger === "round_opens" ? "opens" : "closes"} at ${source.toISOString()}.`;
      const result = await prisma.$transaction(async (tx) => {
        const created = await tx.portal_notifications.createMany({
          data: recipients.map((userId) => ({
            user_id: userId, rule_id: rule.id, round_id: round.id,
            dedupe_key: `${rule.id}:${round.id}:${userId}`,
            title: rule.name, body: message,
          })),
          skipDuplicates: true,
        });
        if (created.count) await recordRoundEvent(round.id, "notifications_delivered", "scheduler", `notify:${rule.id}:${round.id}`,
          { rule_id: rule.id, count: created.count, action: rule.action || "notify_recipients" }, tx, now);
        return created;
      });
      delivered += result.count;
    }
  }
  return delivered;
}

module.exports = { defaultRules, resolveRecipients, conditionMatches, deliverDueNotifications };
