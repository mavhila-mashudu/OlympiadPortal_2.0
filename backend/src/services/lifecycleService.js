// @ts-nocheck
const prisma = require("../config/database").default;

// ─────────────────────────────────────────
// RUN ONE LIFECYCLE PASS
// Called on a timer (see jobs/roundLifecycleJob.js).
// Two transitions only, for now:
//   scheduled -> open     (once opens_at has passed)
//   open      -> closed   (once closes_at has passed)
// Marking / results_released are separate pieces of work
// (auto-marking, results release) that build on top of this.
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

    toClose.forEach((r) =>
      console.log(`[lifecycle] round "${r.name}" (${r.id}) closed`),
    );
    // Future hook: this is the point where auto-marking (B14)
    // would kick off for each round in toClose.
  }

  return { opened: toOpen.length, closed: toClose.length };
};

module.exports = { runLifecycleTick };
