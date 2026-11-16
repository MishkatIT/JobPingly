import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { client, db } from '@/lib/db/client';
import { careerPages, monitorTasks, type MonitorTask } from '@/lib/db/schema';
import type { TaskTrigger } from '@/lib/constants';

/**
 * Scan queue.
 *
 * A row in `monitor_tasks` is one request to scan one source. Workers claim
 * rows with `FOR UPDATE SKIP LOCKED`, which lets any number of workers run at
 * once (the in-process loop, a cron-triggered tick, a manual run from the
 * admin panel) without ever scanning the same source twice. A partial unique
 * index allows at most one queued-or-running task per source.
 *
 * A claimed task holds a lease. If the worker dies, the lease expires and the
 * task is put back in the queue (or failed once it has run out of attempts),
 * so a crash can never strand a source.
 */

export const LEASE_MINUTES = 10;

const PRIORITY: Record<TaskTrigger, number> = {
  manual: 100,
  onboarding: 80,
  retry: 50,
  schedule: 0,
};

export interface EnqueueOptions {
  trigger: TaskTrigger;
  force?: boolean;
  requestedBy?: string | null;
  priority?: number;
  /** Delay before the task becomes claimable. */
  delaySeconds?: number;
}

export interface EnqueueResult {
  task: MonitorTask | null;
  /** True when a task for this source was already queued or running. */
  alreadyQueued: boolean;
}

/** Queues a scan for one source. Idempotent: a second request while one is pending is a no-op. */
export async function enqueueScan(careerPageId: string, options: EnqueueOptions): Promise<EnqueueResult> {
  const runAfter = new Date(Date.now() + (options.delaySeconds ?? 0) * 1000);
  const [task] = await db
    .insert(monitorTasks)
    .values({
      careerPageId,
      trigger: options.trigger,
      priority: options.priority ?? PRIORITY[options.trigger],
      force: options.force ?? false,
      requestedBy: options.requestedBy ?? null,
      runAfter,
    })
    .onConflictDoNothing()
    .returning();

  if (task) return { task, alreadyQueued: false };

  // A manual request should jump the queue even if a scheduled task already exists.
  if (options.trigger === 'manual' || options.trigger === 'onboarding') {
    await db
      .update(monitorTasks)
      .set({ priority: PRIORITY[options.trigger], runAfter: new Date(), force: options.force ? true : sql`${monitorTasks.force}` })
      .where(and(eq(monitorTasks.careerPageId, careerPageId), eq(monitorTasks.status, 'queued')));
  }
  return { task: null, alreadyQueued: true };
}

/**
 * Queues every source whose next check is due. One statement, no per-source
 * round trips. Returns the number of tasks created.
 */
export async function enqueueDueSources(limit: number, scanUnwatched: boolean): Promise<number> {
  const rows = await client<{ id: string }[]>`
    INSERT INTO monitor_tasks (career_page_id, trigger, priority)
    SELECT cp.id, 'schedule', cp.priority
    FROM career_pages cp
    WHERE cp.status <> 'paused'
      AND (cp.next_check_at IS NULL OR cp.next_check_at <= now())
      AND (
        ${scanUnwatched}
        OR EXISTS (
          SELECT 1
          FROM list_career_pages lcp
          JOIN lists l ON l.id = lcp.list_id
          WHERE lcp.career_page_id = cp.id AND lcp.is_paused = false AND l.deleted_at IS NULL
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM monitor_tasks t
        WHERE t.career_page_id = cp.id AND t.status IN ('queued', 'running')
      )
    ORDER BY cp.priority DESC, cp.next_check_at ASC NULLS FIRST
    LIMIT ${limit}
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  return rows.length;
}

export interface ClaimedTask {
  id: string;
  careerPageId: string;
  trigger: TaskTrigger;
  force: boolean;
  attempts: number;
  maxAttempts: number;
  enqueuedAt: Date;
}

/** Atomically claims up to `limit` runnable tasks for this worker. */
export async function claimTasks(workerId: string, limit: number): Promise<ClaimedTask[]> {
  if (limit <= 0) return [];
  const rows = await client<
    { id: string; career_page_id: string; trigger: TaskTrigger; force: boolean; attempts: number; max_attempts: number; enqueued_at: Date }[]
  >`
    UPDATE monitor_tasks
    SET status = 'running',
        started_at = now(),
        locked_by = ${workerId},
        lease_expires_at = now() + make_interval(mins => ${LEASE_MINUTES}),
        attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM monitor_tasks
      WHERE status = 'queued' AND run_after <= now()
      ORDER BY priority DESC, run_after ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, career_page_id, trigger, force, attempts, max_attempts, enqueued_at
  `;
  return rows.map(row => ({
    id: row.id,
    careerPageId: row.career_page_id,
    trigger: row.trigger,
    force: row.force,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    enqueuedAt: row.enqueued_at,
  }));
}

export async function completeTask(taskId: string, result: Record<string, unknown>): Promise<void> {
  await db
    .update(monitorTasks)
    .set({ status: 'succeeded', finishedAt: new Date(), lockedBy: null, leaseExpiresAt: null, result, error: null, errorClass: null })
    .where(eq(monitorTasks.id, taskId));
}

export async function failTask(taskId: string, error: string, errorClass: string | null, result?: Record<string, unknown>): Promise<void> {
  await db
    .update(monitorTasks)
    .set({
      status: 'failed',
      finishedAt: new Date(),
      lockedBy: null,
      leaseExpiresAt: null,
      error: error.slice(0, 500),
      errorClass,
      result: result ?? null,
    })
    .where(eq(monitorTasks.id, taskId));
}

/**
 * Returns tasks whose worker stopped responding to the queue, or fails them
 * when they have used all their attempts.
 */
export async function recoverExpiredLeases(): Promise<{ requeued: number; failed: number }> {
  const requeued = await client<{ id: string }[]>`
    UPDATE monitor_tasks
    SET status = 'queued', locked_by = NULL, lease_expires_at = NULL, started_at = NULL,
        run_after = now() + interval '1 minute',
        error = 'Worker stopped before finishing; task returned to the queue.'
    WHERE status = 'running' AND lease_expires_at < now() AND attempts < max_attempts
    RETURNING id
  `;
  const failed = await client<{ id: string }[]>`
    UPDATE monitor_tasks
    SET status = 'failed', finished_at = now(), locked_by = NULL, lease_expires_at = NULL,
        error = 'Worker stopped before finishing and the task ran out of attempts.', error_class = 'timeout'
    WHERE status = 'running' AND lease_expires_at < now() AND attempts >= max_attempts
    RETURNING id
  `;
  return { requeued: requeued.length, failed: failed.length };
}

/** Cancels a queued task. Running tasks cannot be cancelled: the scan is already in flight. */
export async function cancelTask(taskId: string): Promise<boolean> {
  const rows = await db
    .update(monitorTasks)
    .set({ status: 'cancelled', finishedAt: new Date(), error: 'Cancelled by an administrator.' })
    .where(and(eq(monitorTasks.id, taskId), eq(monitorTasks.status, 'queued')))
    .returning({ id: monitorTasks.id });
  return rows.length > 0;
}

export async function cancelQueuedTasks(trigger?: TaskTrigger): Promise<number> {
  const rows = await db
    .update(monitorTasks)
    .set({ status: 'cancelled', finishedAt: new Date(), error: 'Cancelled by an administrator.' })
    .where(and(eq(monitorTasks.status, 'queued'), trigger ? eq(monitorTasks.trigger, trigger) : undefined))
    .returning({ id: monitorTasks.id });
  return rows.length;
}

/** Re-queues a failed or cancelled task's source as a fresh, high-priority task. */
export async function retryTask(taskId: string, requestedBy: string | null): Promise<EnqueueResult | null> {
  const [task] = await db
    .select({ careerPageId: monitorTasks.careerPageId, status: monitorTasks.status })
    .from(monitorTasks)
    .where(eq(monitorTasks.id, taskId));
  if (!task || !['failed', 'cancelled'].includes(task.status)) return null;
  await resumeSourceIfAutoPaused(task.careerPageId);
  return enqueueScan(task.careerPageId, { trigger: 'retry', force: true, requestedBy });
}

/** A manual retry of a source that was auto-paused puts it back into rotation. */
export async function resumeSourceIfAutoPaused(careerPageId: string): Promise<void> {
  await db
    .update(careerPages)
    .set({ status: 'degraded', pausedReason: null, nextCheckAt: new Date(), updatedAt: new Date() })
    .where(and(eq(careerPages.id, careerPageId), eq(careerPages.status, 'paused'), sql`${careerPages.pausedReason} LIKE 'Paused automatically%'`));
}

export interface QueueStats {
  queued: number;
  running: number;
  dueNow: number;
  succeeded24h: number;
  failed24h: number;
  cancelled24h: number;
  oldestQueuedSeconds: number | null;
  avgWaitSeconds24h: number | null;
  avgDurationSeconds24h: number | null;
  p95DurationSeconds24h: number | null;
}

export async function getQueueStats(): Promise<QueueStats> {
  const [row] = await client<
    {
      queued: number;
      running: number;
      due_now: number;
      succeeded: number;
      failed: number;
      cancelled: number;
      oldest: number | null;
      avg_wait: number | null;
      avg_duration: number | null;
      p95_duration: number | null;
    }[]
  >`
    SELECT
      count(*) FILTER (WHERE status = 'queued')::int AS queued,
      count(*) FILTER (WHERE status = 'running')::int AS running,
      count(*) FILTER (WHERE status = 'queued' AND run_after <= now())::int AS due_now,
      count(*) FILTER (WHERE status = 'succeeded' AND finished_at > now() - interval '24 hours')::int AS succeeded,
      count(*) FILTER (WHERE status = 'failed' AND finished_at > now() - interval '24 hours')::int AS failed,
      count(*) FILTER (WHERE status = 'cancelled' AND finished_at > now() - interval '24 hours')::int AS cancelled,
      extract(epoch FROM now() - min(run_after) FILTER (WHERE status = 'queued' AND run_after <= now()))::float AS oldest,
      avg(extract(epoch FROM started_at - run_after)) FILTER (WHERE started_at > now() - interval '24 hours')::float AS avg_wait,
      avg(extract(epoch FROM finished_at - started_at)) FILTER (WHERE status IN ('succeeded', 'failed') AND finished_at > now() - interval '24 hours')::float AS avg_duration,
      (percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM finished_at - started_at))
        FILTER (WHERE status IN ('succeeded', 'failed') AND finished_at > now() - interval '24 hours'))::float AS p95_duration
    FROM monitor_tasks
    WHERE status IN ('queued', 'running') OR finished_at > now() - interval '24 hours'
  `;
  const round = (value: number | null) => (value === null || value === undefined ? null : Math.max(0, Math.round(value * 10) / 10));
  return {
    queued: row?.queued ?? 0,
    running: row?.running ?? 0,
    dueNow: row?.due_now ?? 0,
    succeeded24h: row?.succeeded ?? 0,
    failed24h: row?.failed ?? 0,
    cancelled24h: row?.cancelled ?? 0,
    oldestQueuedSeconds: round(row?.oldest ?? null),
    avgWaitSeconds24h: round(row?.avg_wait ?? null),
    avgDurationSeconds24h: round(row?.avg_duration ?? null),
    p95DurationSeconds24h: round(row?.p95_duration ?? null),
  };
}

/** Housekeeping: finished tasks are only useful for a short while. */
export async function pruneFinishedTasks(olderThanDays = 7): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const rows = await db
    .delete(monitorTasks)
    .where(and(inArray(monitorTasks.status, ['succeeded', 'failed', 'cancelled']), lt(monitorTasks.finishedAt, cutoff)))
    .returning({ id: monitorTasks.id });
  return rows.length;
}
