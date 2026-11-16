import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { workerHeartbeat } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { processNotificationQueue } from '@/lib/notifications/processor';
import { getSettings, invalidateSettingsCache } from '@/lib/settings/store';
import { toScanError } from './errors';
import { pendingMigrations } from '@/lib/db/migrate';
import { backfillMatchesIfEmpty, closeExpiredJobs, runDailyHousekeeping, sendDueReminders } from './housekeeping';
import { runScan } from './pipeline';
import { claimTasks, completeTask, enqueueDueSources, failTask, recoverExpiredLeases, type ClaimedTask } from './queue';

/**
 * The worker cycle.
 *
 * One cycle:
 *   1. record a heartbeat
 *   2. recover tasks abandoned by a crashed worker
 *   3. queue every source that is due (unless monitoring is switched off)
 *   4. claim tasks and scan them with bounded concurrency
 *   5. deliver due email alerts
 *   6. light housekeeping
 *
 * The same function backs three ways of running the worker, which can be
 * mixed freely because the queue is the only coordination point:
 *   - `startWorkerLoop()`  a long-running loop (own process, or inside the web server)
 *   - `runCycle()` once    from `npm run worker:once` (cron, GitHub Actions)
 *   - `runCycle()` once    from POST /api/cron/tick (an external scheduler)
 */

export interface CycleOptions {
  workerId?: string;
  /** Stop claiming new tasks once this much time has passed. */
  budgetMs?: number;
  /** Maximum tasks to run in this cycle. */
  maxTasks?: number;
  concurrency?: number;
  /** Run tasks but skip email delivery (used by tests). */
  skipNotifications?: boolean;
  mode?: 'loop' | 'once' | 'cron' | 'manual';
}

export interface CycleReport {
  workerId: string;
  mode: string;
  monitoringEnabled: boolean;
  enqueued: number;
  recovered: number;
  claimed: number;
  succeeded: number;
  failed: number;
  jobsAdded: number;
  jobsRemoved: number;
  emailsSent: number;
  durationMs: number;
  error?: string;
  /** Set when the cycle deliberately did nothing, e.g. while migrations are pending. */
  skipped?: string;
  /** Matches computed by the one-time catch-up after an upgrade. */
  matchesBackfilled?: number;
}

declare global {
  var __jpSchemaReady: boolean | undefined;
  var __jpMatchesChecked: boolean | undefined;
  var __jpCycleRunning: boolean | undefined;
  var __jpLastHousekeeping: number | undefined;
  var __jpWorkerStartedAt: Date | undefined;
}

async function heartbeat(workerId: string, fields: { cycleStart?: boolean; lastError?: string | null; stats?: Record<string, unknown> }): Promise<void> {
  const now = new Date();
  globalThis.__jpWorkerStartedAt ??= now;
  await db
    .insert(workerHeartbeat)
    .values({
      id: workerId,
      heartbeatAt: now,
      cycleStartedAt: now,
      lastError: fields.lastError ?? null,
      stats: fields.stats ?? null,
      startedAt: globalThis.__jpWorkerStartedAt,
    })
    .onConflictDoUpdate({
      target: workerHeartbeat.id,
      set: {
        heartbeatAt: now,
        ...(fields.cycleStart ? { cycleStartedAt: now } : {}),
        ...(fields.lastError !== undefined ? { lastError: fields.lastError } : {}),
        ...(fields.stats ? { stats: fields.stats } : {}),
        startedAt: globalThis.__jpWorkerStartedAt,
      },
    });
}

async function runTask(task: ClaimedTask, workerId: string): Promise<{ ok: boolean; added: number; removed: number }> {
  try {
    const result = await runScan(task.careerPageId, { trigger: task.trigger, force: task.force, taskId: task.id, workerId });
    const summary = {
      outcome: result.outcome,
      adapter: result.adapter,
      jobsFound: result.jobsFound,
      jobsAdded: result.jobsAdded,
      jobsRemoved: result.jobsRemoved,
      jobsUpdated: result.jobsUpdated,
      durationMs: result.durationMs,
    };
    if (result.outcome === 'failed') {
      await failTask(task.id, result.errorMessage ?? 'Scan failed', result.errorClass ?? null, summary);
      return { ok: false, added: 0, removed: 0 };
    }
    await completeTask(task.id, summary);
    return { ok: true, added: result.jobsAdded, removed: result.jobsRemoved };
  } catch (error) {
    // runScan records ordinary scan failures itself. Reaching here means
    // something unexpected (for example the database was unavailable).
    const scanError = toScanError(error);
    console.error(`[worker] Task ${task.id} crashed:`, error);
    await failTask(task.id, scanError.message, scanError.errorClass).catch(() => {});
    return { ok: false, added: 0, removed: 0 };
  }
}

/** Runs tasks with a fixed number in flight; one slow or failing source never blocks the others. */
async function drainQueue(workerId: string, options: Required<Pick<CycleOptions, 'budgetMs' | 'maxTasks' | 'concurrency'>>, startedAt: number) {
  const totals = { claimed: 0, succeeded: 0, failed: 0, jobsAdded: 0, jobsRemoved: 0 };
  const inFlight = new Set<Promise<void>>();

  const launch = (task: ClaimedTask) => {
    const promise = runTask(task, workerId)
      .then(result => {
        if (result.ok) totals.succeeded++;
        else totals.failed++;
        totals.jobsAdded += result.added;
        totals.jobsRemoved += result.removed;
      })
      .finally(() => {
        inFlight.delete(promise);
      });
    inFlight.add(promise);
  };

  for (;;) {
    const withinBudget = Date.now() - startedAt < options.budgetMs;
    const capacity = Math.min(options.concurrency - inFlight.size, options.maxTasks - totals.claimed);

    if (withinBudget && capacity > 0) {
      const tasks = await claimTasks(workerId, capacity);
      totals.claimed += tasks.length;
      tasks.forEach(launch);
      if (tasks.length === 0 && inFlight.size === 0) break;
    } else if (inFlight.size === 0) {
      break;
    }

    if (inFlight.size > 0) await Promise.race(inFlight);
  }
  return totals;
}

export async function runCycle(options: CycleOptions = {}): Promise<CycleReport> {
  const workerId = options.workerId ?? env.worker.id;
  const mode = options.mode ?? 'once';
  const startedAt = Date.now();
  const report: CycleReport = {
    workerId,
    mode,
    monitoringEnabled: true,
    enqueued: 0,
    recovered: 0,
    claimed: 0,
    succeeded: 0,
    failed: 0,
    jobsAdded: 0,
    jobsRemoved: 0,
    emailsSent: 0,
    durationMs: 0,
  };

  // Two overlapping cycles in one process would only compete for the same
  // tasks. Separate processes are safe (the queue arbitrates).
  if (globalThis.__jpCycleRunning) {
    report.error = 'A cycle is already running in this process.';
    return report;
  }
  globalThis.__jpCycleRunning = true;

  try {
    // Never run against a database the code does not match yet (for example a
    // separate worker service that starts before the web service migrated).
    if (!globalThis.__jpSchemaReady) {
      const pending = await pendingMigrations(env.databaseUrl).catch(error => {
        console.warn('[worker] Could not check for pending migrations:', (error as Error).message);
        return [] as string[];
      });
      if (pending.length > 0) {
        report.skipped = `Database migrations pending (${pending.join(', ')}). Run "npm run db:migrate"; "npm start" does this automatically.`;
        console.warn(`[worker] ${report.skipped}`);
        report.durationMs = Date.now() - startedAt;
        return report;
      }
      globalThis.__jpSchemaReady = true;
    }

    await heartbeat(workerId, { cycleStart: true, lastError: null });

    if (!globalThis.__jpMatchesChecked) {
      globalThis.__jpMatchesChecked = true;
      const backfilled = await backfillMatchesIfEmpty().catch(error => {
        console.error('[worker] Match backfill failed:', (error as Error).message);
        globalThis.__jpMatchesChecked = false;
        return null;
      });
      if (backfilled !== null) {
        report.matchesBackfilled = backfilled;
        console.log(`[worker] Computed ${backfilled} matches for existing alerts (one-time catch-up).`);
      }
    }

    // Settings can be changed from another process (the web server).
    invalidateSettingsCache();
    const settings = await getSettings(['scraper.enabled', 'monitoring.scan_unwatched_sources']);
    report.monitoringEnabled = settings['scraper.enabled'];

    const recovered = await recoverExpiredLeases();
    report.recovered = recovered.requeued + recovered.failed;

    if (report.monitoringEnabled) {
      report.enqueued = await enqueueDueSources(Math.max(50, (options.maxTasks ?? env.worker.batchSize) * 2), settings['monitoring.scan_unwatched_sources']);
    }

    // Manually requested scans still run while scheduled monitoring is paused.
    const totals = await drainQueue(
      workerId,
      {
        budgetMs: options.budgetMs ?? 4 * 60_000,
        maxTasks: options.maxTasks ?? env.worker.batchSize,
        concurrency: options.concurrency ?? env.worker.concurrency,
      },
      startedAt,
    );
    Object.assign(report, totals);

    await closeExpiredJobs().catch(error => console.error('[worker] closeExpiredJobs failed:', error.message));
    await sendDueReminders().catch(error => console.error('[worker] sendDueReminders failed:', error.message));

    if (!options.skipNotifications) {
      const delivery = await processNotificationQueue();
      report.emailsSent = delivery.emailsSent;
      if (delivery.errors.length > 0) console.warn('[worker] Email delivery issues:', delivery.errors.slice(0, 5).join(' | '));
    }

    const lastHousekeeping = globalThis.__jpLastHousekeeping ?? 0;
    if (Date.now() - lastHousekeeping > 24 * 60 * 60 * 1000) {
      globalThis.__jpLastHousekeeping = Date.now();
      const housekeeping = await runDailyHousekeeping().catch(error => {
        console.error('[worker] Housekeeping failed:', error.message);
        return null;
      });
      if (housekeeping) console.log('[worker] Housekeeping:', JSON.stringify(housekeeping));
    }

    report.durationMs = Date.now() - startedAt;
    await heartbeat(workerId, { stats: { ...report, finishedAt: new Date().toISOString() } });
    return report;
  } catch (error) {
    report.error = (error as Error).message;
    report.durationMs = Date.now() - startedAt;
    console.error('[worker] Cycle failed:', error);
    await heartbeat(workerId, { lastError: report.error.slice(0, 500) }).catch(() => {});
    return report;
  } finally {
    globalThis.__jpCycleRunning = false;
  }
}

export interface WorkerHandle {
  stop(): Promise<void>;
}

/** Starts the long-running loop. Returns a handle whose stop() waits for the current cycle. */
export function startWorkerLoop(options: { intervalMs?: number; workerId?: string } = {}): WorkerHandle {
  const intervalMs = options.intervalMs ?? env.worker.pollIntervalMs;
  const workerId = options.workerId ?? env.worker.id;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: Promise<unknown> = Promise.resolve();

  console.log(`[worker] ${workerId} started. Cycle every ${Math.round(intervalMs / 1000)}s, concurrency ${env.worker.concurrency}.`);

  const tick = async () => {
    if (stopped) return;
    const report = await runCycle({ workerId, mode: 'loop' });
    if (report.claimed > 0 || report.emailsSent > 0 || report.error) {
      console.log(
        `[worker] cycle: ${report.claimed} scanned (${report.succeeded} ok, ${report.failed} failed), +${report.jobsAdded}/-${report.jobsRemoved} jobs, ${report.emailsSent} emails, ${report.durationMs}ms${report.error ? `, error: ${report.error}` : ''}`,
      );
    }
    if (!stopped) {
      // Schedule relative to the end of the cycle so cycles never overlap.
      timer = setTimeout(() => {
        current = tick();
      }, intervalMs);
    }
  };

  // Keep the heartbeat fresh during a long cycle so health checks do not flap.
  const pulse = setInterval(() => {
    heartbeat(workerId, {}).catch(() => {});
  }, Math.min(intervalMs, 30_000));
  pulse.unref?.();

  current = tick();

  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      clearInterval(pulse);
      await current.catch(() => {});
    },
  };
}

export interface WorkerHealth {
  id: string;
  alive: boolean;
  heartbeatAt: Date | null;
  secondsSinceHeartbeat: number | null;
  startedAt: Date | null;
  lastError: string | null;
  lastCycle: Record<string, unknown> | null;
}

/** Liveness of every worker that has reported in. A worker is alive if it reported within three poll intervals. */
export async function getWorkerHealth(): Promise<WorkerHealth[]> {
  const rows = await db.select().from(workerHeartbeat);
  const staleAfterMs = Math.max(env.worker.pollIntervalMs * 3, 5 * 60_000);
  return rows.map(row => {
    const age = Date.now() - row.heartbeatAt.getTime();
    return {
      id: row.id,
      alive: age < staleAfterMs,
      heartbeatAt: row.heartbeatAt,
      secondsSinceHeartbeat: Math.round(age / 1000),
      startedAt: row.startedAt,
      lastError: row.lastError,
      lastCycle: (row.stats as Record<string, unknown> | null) ?? null,
    };
  });
}

export async function removeWorkerRecord(id: string): Promise<void> {
  await db.delete(workerHeartbeat).where(eq(workerHeartbeat.id, id));
}
