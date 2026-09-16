// Module 12: what makes "periodically improve" actually periodic, instead
// of a button someone has to remember to press. A plain setInterval — no
// external job queue, no cron daemon — which is an honest scope, not a
// shortcut: it only runs for as long as this Node process stays alive, and
// resets if the process restarts. Good enough for a single backend
// instance; a multi-instance deployment would need a real scheduler (or a
// DB lock) so it doesn't fire once per instance.
//
// Deliberately NOT started from app.js. app.js is imported by the test
// suite via supertest, and a background timer that outlives a test file
// would leak between tests and keep the process alive after `vitest run`
// finishes. server.js is the only file that ever calls app.listen(), so
// it's the only place a background loop belongs too.
import { runSelfImprovement } from "./selfImprove.js";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export function startSelfImprovementScheduler() {
  if (process.env.SELF_IMPROVE_ENABLED !== "true") {
    console.log("Self-improvement scheduler disabled (set SELF_IMPROVE_ENABLED=true to turn it on).");
    return null;
  }

  const intervalMs = Number(process.env.SELF_IMPROVE_INTERVAL_MS) || DEFAULT_INTERVAL_MS;

  const tick = async () => {
    try {
      const run = await runSelfImprovement({ trigger: "scheduled" });
      console.log(`Self-improvement run ${run.id}: ${run.status}`);
    } catch (err) {
      // runSelfImprovement already catches its own errors into an
      // ImprovementRun row — this only catches something going wrong
      // outside that (e.g. the DB itself unreachable), so the interval
      // keeps ticking rather than dying silently.
      console.error("Self-improvement scheduler tick failed:", err.message);
    }
  };

  console.log(`Self-improvement scheduler enabled: running every ${intervalMs}ms.`);
  const handle = setInterval(tick, intervalMs);
  // Don't hold the process open just for this timer — a graceful shutdown
  // (Ctrl+C, the host's SIGTERM) shouldn't have to wait on it.
  handle.unref();
  return handle;
}
