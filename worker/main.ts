/**
 * Background worker entry point.
 *
 *   npm run worker          long-running loop (scans, alerts, housekeeping)
 *   npm run worker:once     a single cycle, then exit (cron / GitHub Actions)
 *
 * The worker and the web server only communicate through the database, so
 * they can run in the same container (`npm start`), in separate services, or
 * the worker can be replaced by periodic `worker:once` runs.
 */
import { loadEnvConfig } from '@next/env';

// Load the same .env files Next.js loads, before anything reads process.env.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');

async function main() {
  const { assertRuntimeConfig } = await import('../lib/env');
  const { closeDb } = await import('../lib/db/client');
  const { runCycle, startWorkerLoop } = await import('../lib/monitoring/scheduler');

  for (const warning of assertRuntimeConfig()) console.warn(`[worker] ${warning}`);

  if (process.argv.includes('--once')) {
    // A one-shot run may take longer than a loop cycle: it is the only chance
    // to work until the next invocation.
    const report = await runCycle({ mode: 'once', budgetMs: 12 * 60_000, maxTasks: 500 });
    if (report.skipped) {
      // Not a failure: the deploy that brings the new schema has not finished.
      if (process.env.GITHUB_ACTIONS) console.log(`::warning::${report.skipped}`);
      console.log('[worker] Cycle skipped:', report.skipped);
    } else {
      console.log('[worker] Cycle complete:', JSON.stringify(report));
    }
    await closeDb();
    process.exit(report.error ? 1 : 0);
  }

  const handle = startWorkerLoop();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] ${signal} received. Finishing the current cycle before exiting...`);
    // Never hang a deploy: give the cycle a bounded time to finish. Any task
    // still running is returned to the queue when its lease expires.
    const timeout = setTimeout(() => {
      console.warn('[worker] Shutdown timed out; exiting.');
      process.exit(0);
    }, 25_000);
    timeout.unref();
    await handle.stop();
    await closeDb().catch(() => {});
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', reason => console.error('[worker] Unhandled rejection:', reason));
}

main().catch(error => {
  console.error('[worker] Fatal:', error);
  process.exit(1);
});
