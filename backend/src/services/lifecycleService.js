// @ts-nocheck
const prisma = require("../config/database").default;
const { autoMarkRoundInternal } = require("./markingService");
const { recordRoundEvent } = require("./roundAuditService");
const { processDueNotifications } = require("./notificationDispatchService");

// ─────────────────────────────────────────
// RUN ONE LIFECYCLE PASS
// Called on a timer (see jobs/roundLifecycleJob.js).
// Three transitions:
//   scheduled -> open     (once opens_at has passed)
//   open      -> closed   (once closes_at has passed)
//   closed    -> auto-marked (immediately after closing)
// Results release stays manual (organiser action).
// After the transitions, due notification emails are dispatched
// (round opening/closing reminders and results-out notices).
// ─────────────────────────────────────────
const runLifecycleTick = async () => {
  const now = new Date();
  let opened = 0;
  let closed = 0;

  // ── scheduled -> open ──────────────────────────────
  const toOpen = await prisma.rounds.findMany({
    where: { state: "scheduled", opens_at: { lte: now } },
    select: { id: true, name: true, olympiad_id: true },
  });

  if (toOpen.length > 0) {
    for (const r of toOpen) {
      const didOpen = await prisma.$transaction(async (tx) => {
        const updated = await tx.rounds.updateMany({
          where: { id: r.id, state: "scheduled", opens_at: { lte: now } }, data: { state: "open" },
        });
        if (updated.count) await recordRoundEvent(r.id, "round_opened", "lifecycle", `open:${r.id}`, { from: "scheduled", to: "open" }, tx, now);
        return Boolean(updated.count);
      });
      if (!didOpen) continue;
      opened++;
      console.log(`[lifecycle] round "${r.name}" (${r.id}) opened`);
    }
  }

  // ── open -> closed ─────────────────────────────────
  const toClose = await prisma.rounds.findMany({
    where: { state: "open", closes_at: { lte: now } },
    select: { id: true, name: true, olympiad_id: true },
  });

  if (toClose.length > 0) {
    const closedRounds = [];
    for (const r of toClose) {
      const didClose = await prisma.$transaction(async (tx) => {
        const updated = await tx.rounds.updateMany({
          where: { id: r.id, state: "open", closes_at: { lte: now } }, data: { state: "closed" },
        });
        if (updated.count) await recordRoundEvent(r.id, "round_closed", "lifecycle", `close:${r.id}`, { from: "open", to: "closed" }, tx, now);
        return Boolean(updated.count);
      });
      if (didClose) closedRounds.push(r);
    }

    closed = closedRounds.length;
    closedRounds.forEach((r) =>
      console.log(`[lifecycle] round "${r.name}" (${r.id}) closed`),
    );

    // ── auto-mark on close ──────────────────────
    // MCQ + short_answer answers are marked
    // automatically; essays remain in the
    // manual marking queue.
    for (const r of closedRounds) {
      try {
        const result = await autoMarkRoundInternal(r.id);
        await recordRoundEvent(r.id, "round_automarked", "lifecycle", `mark:${r.id}`, { submissions: result.total });
        console.log(
          `[lifecycle] auto-marked ${result.total} submission(s) for round "${r.name}"`,
        );
      } catch (err) {
        await recordRoundEvent(r.id, "round_automark_failed", "lifecycle", `mark-failed:${r.id}:${Date.now()}`, { message: err.message });
        console.error(
          `[lifecycle] auto-marking failed for round "${r.name}" (${r.id}): ${err.message}`,
        );
      }
    }
  }

  // Dispatch after round transitions; a delivery error must not stop the lifecycle tick.
  try {
    const notifications = await processDueNotifications(now);
    if (notifications.sent > 0) {
      console.log(`[lifecycle] dispatched ${notifications.sent} notification email(s)`);
    }
    if (notifications.failed > 0) {
      console.warn(`[lifecycle] ${notifications.failed} notification email(s) not delivered; retrying next tick`);
    }
  } catch (err) {
    console.error(`[lifecycle] notification dispatch failed: ${err.message}`);
  }

  return { opened, closed };
};

module.exports = { runLifecycleTick };
