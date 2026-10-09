// @ts-nocheck
const prisma = require('../config/database').default;
const { frontend } = require('../config/env');
const { sendNotificationEmail, isMailerConfigured } = require('../lib/mailer');

// ─────────────────────────────────────────
// NOTIFICATION DISPATCH (I11 / I13)
//
// Runs on every lifecycle tick and emails
// educators about the rounds they care about:
//   • before a round opens  (reminder)
//   • before a round closes (reminder)
//   • when a round opens / closes
//   • when results are released
//
// Only rules whose channel is "email" are dispatched from here; rules
// on other channels (in_app) are delivered by notificationDeliveryService.
//
// Two kinds of notification:
//   1. Organiser-configured rules (notification_rules) — these honour the
//      rule's trigger, offset, recipient and condition.
//   2. Built-in educator notices — one per trigger, sent to every educator
//      of a registered school at event time, so educators are informed even
//      when no organiser rule exists.  An enabled rule aimed at registered
//      educators replaces the built-in notice for its trigger.
//
// Every email is claimed in sent_notifications, keyed by (dedup_key, round,
// recipient), before it is sent, so a notification is never sent twice — not
// across ticks, restarts, retries or dispatches running at the same time. An
// email EmailJS did not accept has its claim released, so later ticks retry
// it for as long as it is still due.
// ─────────────────────────────────────────

// Event notifications stop being due once the event is older than this,
// so a deploy (or a newly created rule) never spams stale announcements.
const STALENESS_MS = 24 * 60 * 60 * 1000;

const TRIGGERS = ['round_opens', 'round_closes', 'results_released'];

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

const formatDateTime = (date, timeZone) => {
    try {
        return new Intl.DateTimeFormat('en-ZA', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone,
        }).format(new Date(date));
    } catch {
        // Unknown timezone string — fall back to the server's locale
        return new Date(date).toLocaleString('en-ZA');
    }
};

const humanizeOffset = (minutes) => {
    if (minutes >= 1440 && minutes % 1440 === 0) {
        const days = minutes / 1440;
        return days === 1 ? 'in 1 day' : `in ${days} days`;
    }
    if (minutes >= 60 && minutes % 60 === 0) {
        const hours = minutes / 60;
        return hours === 1 ? 'in 1 hour' : `in ${hours} hours`;
    }
    return minutes === 1 ? 'in 1 minute' : `in ${minutes} minutes`;
};

const portalLink = (url) =>
    `<p><a href="${url}">Open the Olympiad Portal</a></p>` +
    `<p>If the link does not work, copy this address into your browser:<br />${url}</p>`;

// The time the trigger is about: opens_at / closes_at / results_release_at.
// results_release_at is only set at the moment results are actually
// released (see markingService / roundService), so a null value simply
// means "results have never been released".
const triggerEventTime = (trigger, round) => {
    if (trigger === 'round_opens') {
        return round.opens_at ? new Date(round.opens_at) : null;
    }
    if (trigger === 'round_closes') {
        return round.closes_at ? new Date(round.closes_at) : null;
    }
    return round.results_release_at ? new Date(round.results_release_at) : null;
};

// Whether a notification for this round is due right now.
//   • Reminders (offset > 0) fire strictly before their event and only
//     while the round is still in the pre-event state.
//   • Event notices (offset 0) fire once the event has actually happened
//     (the lifecycle tick transitions states before dispatching) and stop
//     being due after the staleness window.
const isDue = (trigger, offsetMinutes, round, now) => {
    const eventTime = triggerEventTime(trigger, round);
    if (!eventTime) return false;

    const firesAt = new Date(eventTime.getTime() - offsetMinutes * 60 * 1000);

    if (trigger === 'round_opens') {
        if (offsetMinutes > 0) {
            return (
                round.state === 'scheduled' && firesAt <= now && now < eventTime
            );
        }
        return (
            round.state === 'open' &&
            now >= eventTime &&
            now <= new Date(eventTime.getTime() + STALENESS_MS)
        );
    }

    if (trigger === 'round_closes') {
        if (offsetMinutes > 0) {
            return round.state === 'open' && firesAt <= now && now < eventTime;
        }
        return (
            ['closed', 'marking', 'results_released'].includes(round.state) &&
            now >= eventTime &&
            now <= new Date(eventTime.getTime() + STALENESS_MS)
        );
    }

    // results_released — releasing results is a manual organiser action with
    // no pre-announced time, so the offset is effectively zero: notify as
    // soon as the results are out.
    return (
        round.state === 'results_released' &&
        now >= firesAt &&
        now <= new Date(eventTime.getTime() + STALENESS_MS)
    );
};

// Same condition phrases testRule understands: "no submissions" / "submissions".
// Unsupported phrases never block delivery.
const conditionMatches = (condition, submissionCount) => {
    const c = condition?.trim().toLowerCase();
    if (!c) return true;
    if (/no submissions?/.test(c)) return submissionCount === 0;
    if (/submissions?/.test(c)) return submissionCount > 0;
    return true;
};

// Resolve the email addresses for a recipient type.
const resolveRecipientEmails = async (recipient, round) => {
    const emails = new Set();
    const addUser = (user) => {
        if (user?.email && !user.deleted_at) emails.add(user.email);
    };

    if (
        recipient === 'registered_educators' ||
        recipient === 'registered_schools'
    ) {
        const registrations = await prisma.school_registrations.findMany({
            where: { olympiad_id: round.olympiad_id, status: 'approved' },
            select: { school_id: true },
        });
        const schoolIds = registrations.map((r) => r.school_id);
        if (schoolIds.length === 0) return [];

        if (recipient === 'registered_educators') {
            const educators = await prisma.educators.findMany({
                where: { school_id: { in: schoolIds } },
                select: {
                    users: { select: { email: true, deleted_at: true } },
                },
            });
            educators.forEach((e) => addUser(e.users));
        } else {
            // A school has no email address of its own, so a notice aimed at
            // "registered schools" goes to every active member of the school.
            const memberships = await prisma.school_memberships.findMany({
                where: { school_id: { in: schoolIds }, status: 'active' },
                select: {
                    users: { select: { email: true, deleted_at: true } },
                },
            });
            memberships.forEach((m) => addUser(m.users));
        }
        return [...emails];
    }

    // qualifying_entrants — only entrants who have claimed a portal login
    // have an email address to receive the notice.
    const qualified = await prisma.results.findMany({
        where: { round_id: round.id, qualified: true },
        select: {
            entrants: {
                select: {
                    users: { select: { email: true, deleted_at: true } },
                },
            },
        },
    });
    qualified.forEach((q) => addUser(q.entrants?.users));
    return [...emails];
};

const buildNotificationEmail = ({
    trigger,
    offsetMinutes,
    recipient,
    round,
    olympiad,
}) => {
    const tz = olympiad.timezone || 'Africa/Johannesburg';
    const opensAt = formatDateTime(round.opens_at, tz);
    const closesAt = formatDateTime(round.closes_at, tz);
    const roundLabel = `<strong>${round.name}</strong> (${olympiad.name})`;
    const isReminder = offsetMinutes > 0;

    let subject;
    let heading;
    let body;
    let link;

    if (trigger === 'round_opens') {
        link = `${frontend.url}/educator/rounds/${round.id}`;
        if (isReminder) {
            subject = `Reminder: ${round.name} opens soon`;
            heading = 'Round opening soon';
            body =
                `<p>${roundLabel} opens ${humanizeOffset(offsetMinutes)} — on ${opensAt}.</p>` +
                `<p>Make sure your entrants are registered and ready; the paper becomes downloadable once the round opens.</p>`;
        } else {
            subject = `${round.name} is now open`;
            heading = 'Round open';
            body =
                `<p>${roundLabel} is now open and closes on ${closesAt}.</p>` +
                `<p>Download the paper and capture your entrants' answers from the round page before it closes.</p>`;
        }
    } else if (trigger === 'round_closes') {
        link = `${frontend.url}/educator/rounds/${round.id}`;
        if (isReminder) {
            subject = `Reminder: ${round.name} closes soon`;
            heading = 'Round closing soon';
            body =
                `<p>${roundLabel} closes ${humanizeOffset(offsetMinutes)} — on ${closesAt}.</p>` +
                `<p>Submit any outstanding entries before the round closes; late entries are not accepted.</p>`;
        } else {
            subject = `${round.name} has closed`;
            heading = 'Round closed';
            body =
                `<p>${roundLabel} closed on ${closesAt}. Submissions are no longer accepted.</p>` +
                `<p>Results will be announced once marking is complete — you will receive an email when they are out.</p>`;
        }
    } else {
        link =
            recipient === 'qualifying_entrants'
                ? `${frontend.url}/student/results`
                : `${frontend.url}/educator/results`;
        subject = `Results are out: ${round.name}`;
        heading = 'Results released';
        body =
            `<p>Results for ${roundLabel} have been released.</p>` +
            `<p>View scores, ranks and qualification status in the portal.</p>`;
    }

    return {
        subject,
        html: `<h2>${heading}</h2>${body}${portalLink(link)}`,
    };
};

// ─────────────────────────────────────────
// RUN ONE DISPATCH PASS
// Called at the end of every lifecycle tick,
// after state transitions, so event notices
// see the round in its post-event state.
// ─────────────────────────────────────────
let warnedNotConfigured = false;

const processDueNotifications = async (now = new Date()) => {
    // Without EmailJS nothing can be delivered, and every due email would be
    // attempted again on every tick, so the pass is skipped (with one warning).
    if (!isMailerConfigured()) {
        if (!warnedNotConfigured) {
            console.warn(
                '[notifications] EmailJS is not configured; notification emails are not being sent'
            );
            warnedNotConfigured = true;
        }
        return { due: 0, sent: 0, failed: 0 };
    }

    const enabledRules = await prisma.notification_rules.findMany({
        where: { enabled: true, channel: 'email' },
    });

    const rounds = await prisma.rounds.findMany({
        include: {
            olympiads: { select: { id: true, name: true, timezone: true } },
            _count: { select: { submissions: true } },
        },
        orderBy: { opens_at: 'asc' },
    });

    if (rounds.length === 0) return { due: 0, sent: 0, failed: 0 };

    // ── Build the candidate list ──────────────────────
    const candidates = [];

    for (const rule of enabledRules) {
        for (const round of rounds) {
            if (round.olympiad_id !== rule.olympiad_id) continue;
            candidates.push({
                dedupKey: `rule:${rule.id}`,
                trigger: rule.trigger,
                offsetMinutes: rule.offset_minutes,
                recipient: rule.recipient,
                condition: rule.condition,
                round,
            });
        }
    }

    // Built-in educator notices — one per trigger per round, unless an
    // enabled organiser rule already covers that trigger for educators.
    for (const trigger of TRIGGERS) {
        for (const round of rounds) {
            const hasExplicitRule = enabledRules.some(
                (r) =>
                    r.olympiad_id === round.olympiad_id &&
                    r.trigger === trigger &&
                    r.recipient === 'registered_educators'
            );
            if (hasExplicitRule) continue;

            candidates.push({
                dedupKey: `default:${trigger}`,
                trigger,
                offsetMinutes: 0,
                recipient: 'registered_educators',
                condition: null,
                round,
            });
        }
    }

    const dueCandidates = candidates.filter((c) =>
        isDue(c.trigger, c.offsetMinutes, c.round, now)
    );
    if (dueCandidates.length === 0) return { due: 0, sent: 0, failed: 0 };

    // ── Skip anything already sent ────────────────────
    const sentRows = await prisma.sent_notifications.findMany({
        where: {
            round_id: {
                in: [...new Set(dueCandidates.map((c) => c.round.id))],
            },
        },
        select: { dedup_key: true, round_id: true, recipient: true },
    });
    const sentSet = new Set(
        sentRows.map((r) => `${r.dedup_key}|${r.round_id}|${r.recipient}`)
    );

    let sent = 0;
    let failed = 0;

    for (const candidate of dueCandidates) {
        const { round } = candidate;

        if (!conditionMatches(candidate.condition, round._count.submissions)) {
            continue;
        }

        const emails = await resolveRecipientEmails(candidate.recipient, round);
        const pending = emails.filter(
            (email) =>
                !sentSet.has(`${candidate.dedupKey}|${round.id}|${email}`)
        );
        if (pending.length === 0) continue;

        const email = buildNotificationEmail({
            ...candidate,
            olympiad: round.olympiads,
        });

        for (const to of pending) {
            const record = {
                dedup_key: candidate.dedupKey,
                round_id: round.id,
                recipient: to,
            };
            // Claim the email before sending it. Another dispatch running at the
            // same time (a slow tick overlapping the next, or a second app
            // instance) finds it claimed and skips it, so nobody is emailed twice.
            const claim = await prisma.sent_notifications.createMany({
                data: [record],
                skipDuplicates: true,
            });
            if (claim.count === 0) continue;

            let delivered = false;
            try {
                ({ delivered } = await sendNotificationEmail({
                    to,
                    subject: email.subject,
                    html: email.html,
                }));
            } catch (err) {
                console.error(
                    `[notifications] failed to notify ${to} about round "${round.name}": ${err.message}`
                );
            }
            if (delivered) {
                sent += 1;
                continue;
            }
            // Not sent (the mailer logged why): release the claim so a later tick
            // tries again
            failed += 1;
            await prisma.sent_notifications.deleteMany({ where: record });
        }
    }

    return { due: dueCandidates.length, sent, failed };
};

module.exports = { processDueNotifications };
