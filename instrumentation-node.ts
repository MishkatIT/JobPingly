/**
 * Server start-up (Node.js runtime only):
 * - validates configuration, so a production process with a missing secret
 *   fails at boot rather than on the first sign-in;
 * - starts the background worker inside the web server when WORKER_MODE=inline.
 */
import { assertRuntimeConfig, env } from '@/lib/env';

for (const warning of assertRuntimeConfig()) console.warn(`[config] ${warning}`);

if (env.worker.mode === 'inline' && process.env.NEXT_PHASE !== 'phase-production-build') {
  const { startWorkerLoop } = await import('@/lib/monitoring/scheduler');
  const handle = startWorkerLoop({ workerId: `${env.worker.id}-inline` });
  const stop = () => {
    void handle.stop();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
