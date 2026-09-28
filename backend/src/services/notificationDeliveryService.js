// In-app delivery. The unique dedupe key makes repeated scheduler ticks safe.
const prisma = require("../config/database").default;
const { formatInTimeZone } = require("../utils/timezones");

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

// When a rule should fire for a round, or null if the round has no such time
// yet. Reminders fire offset_minutes before the round opens or closes.
// "Results released" is an event, not a deadline: results_release_at is only
// set at the moment of release, so the notice goes out then, whatever the
// offset. (Subtracting the offset would schedule it before the release, so it
// would never be sent.)
function dueAt(rule, round) {
  const source = rule.trigger === "round_opens" ? round.opens_at
    : rule.trigger === "results_released" ? round.results_release_at : round.closes_at;
  if (!source) return null;
  const offset = rule.trigger === "results_released" ? 0 : rule.offset_minutes;
  return new Date(new Date(source).getTime() - offset * 60_000);
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
      select: { id: true, name: true, olympiad_id: true, opens_at: true, closes_at: true, results_release_at: true, submissions: { select: { id: true } }, olympiads: { select: { timezone: true } } },
    });
    for (const round of rounds) {
      const due = dueAt(rule, round);
      if (!due) continue;
      // Only send within five minutes of the intended delivery time. Never send
      // historical reminders after a restart or during initial deployment.
      if (due.getTime() > now.getTime() || due.getTime() <= now.getTime() - 5 * 60_000) continue;
      if (!conditionMatches(rule.condition, round)) continue;
      const recipients = rule.action === "alert_organiser"
        ? [(await prisma.olympiads.findUnique({ where: { id: rule.olympiad_id }, select: { organiser_id: true } }))?.organiser_id].filter(Boolean)
        : await resolveRecipients(rule, round);
      if (!recipients.length) continue;
      // Times read in the olympiad's own timezone, e.g. "01 Oct 2026, 14:00 SAST"
      const at = (date) => formatInTimeZone(date, round.olympiads?.timezone);
      const message = rule.trigger === "missing_submission"
        ? `Your school's results for ${round.name} have not arrived. This round closes at ${at(round.closes_at)}.`
        : rule.trigger === "results_released"
          ? `Results for ${round.name} are available in the portal.`
          : `${round.name} ${rule.trigger === "round_opens" ? "opens" : "closes"} at ${at(rule.trigger === "round_opens" ? round.opens_at : round.closes_at)}.`;
      const result = await prisma.portal_notifications.createMany({
        data: recipients.map((userId) => ({
          user_id: userId, rule_id: rule.id, round_id: round.id,
          dedupe_key: `${rule.id}:${round.id}:${userId}`,
          title: rule.name, body: message,
        })),
        skipDuplicates: true,
      });
      delivered += result.count;
    }
  }
  return delivered;
}

module.exports = { defaultRules, resolveRecipients, conditionMatches, dueAt, deliverDueNotifications };
