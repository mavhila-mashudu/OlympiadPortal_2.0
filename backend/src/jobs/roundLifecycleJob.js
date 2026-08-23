// @ts-nocheck
const { runLifecycleTick } = require("../services/lifecycleService");

// How often to check for rounds that need to change state.
// Overridable via env var; defaults to every 30 seconds.
const INTERVAL_MS = parseInt(process.env.LIFECYCLE_INTERVAL_MS) || 30_000;

let timer = null;

// ─────────────────────────────────────────
// START THE JOB
// Call once, when the server boots (see server.ts).
// A failed tick is logged, not thrown — one bad tick
// (e.g. a dropped DB connection) shouldn't kill the loop.
// ─────────────────────────────────────────
const start = () => {
  if (timer) return; // already running — don't double-start

  console.log(
    `[lifecycle] round lifecycle job started (checking every ${INTERVAL_MS / 1000}s)`,
  );

  timer = setInterval(async () => {
    try {
      await runLifecycleTick();
    } catch (err) {
      console.error("[lifecycle] tick failed:", err.message);
    }
  }, INTERVAL_MS);

  // Don't let this timer keep the process alive on its own
  // during graceful shutdown.
  timer.unref?.();
};

// ─────────────────────────────────────────
// STOP THE JOB
// Useful for tests, or a clean shutdown.
// ─────────────────────────────────────────
const stop = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

module.exports = { start, stop };
