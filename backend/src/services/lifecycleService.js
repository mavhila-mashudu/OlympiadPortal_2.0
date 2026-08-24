// @ts-nocheck
const prisma = require("../config/database").default;
const { autoMarkRoundInternal } = require("./markingService");

// ─────────────────────────────────────────
// RUN ONE LIFECYCLE PASS
// Called on a timer (see jobs/roundLifecycleJob.js).
// Two transitions:
//   scheduled -> open     (once opens_at has passed)
//   open      -> closed   (once closes_at has passed)
// On close, auto-marks every received submission
// in that round (B14).  Results release is a
// separate organiser-triggered step.
// ─────────────────────────────────────────
const runLifecycleTick = async () => {
  const now = new Date();

  // ── scheduled -> open ──────────────────────────────
  const toOpen = await prisma.rounds.findMany({
    where: { state: "scheduled", opens_at: { lte: now } },
    select: { id: true, name: true, olympiad_id: true },
  });

  if (toOpen.length > 0) {
    await prisma.rounds.updateMany({
      where: { id: { in: toOpen.map((r) => r.id) } },
      data: { state: "open" },
    });

    toOpen.forEach((r) =>
      console.log(`[lifecycle] round "${r.name}" (${r.id}) opened`),
    );
  }

  // ── open -> closed ─────────────────────────────────
  const toClose = await prisma.rounds.findMany({
    where: { state: "open", closes_at: { lte: now } },
    select: { id: true, name: true, olympiad_id: true },
  });

  if (toClose.length > 0) {
    await prisma.rounds.updateMany({
      where: { id: { in: toClose.map((r) => r.id) } },
      data: { state: "closed" },
    });

    // Auto-mark all received submissions for each
    // round that just closed.  A failure for one
    // round is logged, not thrown — it shouldn't
    // kill the lifecycle loop or block other rounds.
    for (const r of toClose) {
      try {
        const result = await autoMarkRoundInternal(r.id);
        console.log(
          `[lifecycle] round "${r.name}" (${r.id}) closed — ` +
            `auto-marked ${result.total} submission(s)`,
        );
      } catch (err) {
        console.error(
          `[lifecycle] auto-marking failed for round "${r.name}" (${r.id}): ${err.message}`,
        );
      }
    }
  }

  return { opened: toOpen.length, closed: toClose.length };
};

module.exports = { runLifecycleTick };
