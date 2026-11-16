import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { careerPages, jobEvents, jobs, listCareerPages, lists, scrapeLogs, userJobs, users, type CareerPage } from '@/lib/db/schema';
import type { TaskTrigger } from '@/lib/constants';
import { createNotifications, type NewNotification } from '@/lib/notifications/inapp';
import { getSettings } from '@/lib/settings/store';
import { getAdapter } from './adapters';
import { describeChanges, diffJobs, type StoredJob } from './differ';
import { ScanError, describeErrorClass, toScanError } from './errors';
import { extractSource, type ExtractionResult } from './extract';
import { resultSetHash } from './fingerprint';
import { createHttpClient, type HttpClient } from './http';
import { matchJobsForSource, type JobForMatching } from './matching';
import { normalizeJobs } from './normalize';
import type { NormalizedJob, ScanResult } from './types';

/**
 * One scan of one source, end to end:
 *
 *   extract  ->  normalise  ->  diff against stored jobs  ->  persist  ->  match & notify
 *
 * Everything that changes the database for a scan happens in a single
 * transaction, so a crash can never leave new jobs without their history, a
 * source marked healthy without its scan log, or alerts queued for jobs that
 * were rolled back.
 *
 * A failure is always recorded as a failure. (Before v2, a page that could
 * not be fetched was logged as a successful scan that found zero jobs, which
 * made every source look healthy and silently closed real postings.)
 */

export const SCANNER_VERSION = '2.0.0';

const MIN_BACKOFF_MINUTES = 30;
const MAX_BACKOFF_MINUTES = 24 * 60;
/** Consecutive scans a job must be absent from before it is closed. */
const CLOSE_AFTER_MISSES = { api: 2, html: 3, ai: 3, browser: 3 } as const;
/** A mass disappearance is believed once it has been observed this many scans in a row. */
const ACCEPT_SPIKE_AFTER = 3;

export interface RunScanOptions {
  trigger: TaskTrigger;
  /** Ignore the "nothing changed" shortcuts and re-process everything. */
  force?: boolean;
  taskId?: string;
  workerId?: string;
  /** Injected in tests. */
  http?: HttpClient;
}

function withJitter(minutes: number): number {
  return minutes * (0.9 + Math.random() * 0.2);
}

function nextCheckAfter(minutes: number): Date {
  return new Date(Date.now() + withJitter(minutes) * 60_000);
}

function jobColumns(job: NormalizedJob) {
  return {
    externalId: job.externalId,
    urlKey: job.keys.url,
    dedupeKey: job.keys.titleLocation,
    title: job.title,
    url: job.url,
    location: job.location,
    jobType: job.jobType,
    department: job.department,
    workplaceType: job.workplaceType,
    employmentType: job.employmentType,
    seniority: job.seniority,
    salaryText: job.salaryText,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    description: job.description,
    contentHash: job.contentHash,
    postedAt: job.postedAt,
    deadlineAt: job.deadlineAt,
    rawData: job.rawData,
  };
}

async function effectiveInterval(page: CareerPage): Promise<number> {
  const settings = await getSettings(['scraper.use_global_timer', 'scraper.global_check_interval_minutes']);
  const minutes = settings['scraper.use_global_timer'] ? settings['scraper.global_check_interval_minutes'] : page.checkIntervalMinutes;
  return Math.max(15, Number(minutes) || 180);
}

/**
 * True unless the user switched this kind of in-app notification off in
 * Settings → Notifications (a missing key means "on"). `inApp` covers new
 * matches and is checked in matching.ts.
 */
function notificationEnabled(key: 'sourceFailures' | 'jobChanges') {
  return and(sql`coalesce(${users.notificationSettings}->>${key}, 'true') <> 'false'`, eq(users.isBlocked, false));
}

/** People who should hear when a source breaks or recovers: owners of the lists that include it. */
async function notifyWatchers(page: CareerPage, type: 'source_failed' | 'source_recovered', title: string, body: string): Promise<void> {
  try {
    const owners = await db
      .selectDistinct({ userId: lists.userId })
      .from(listCareerPages)
      .innerJoin(lists, and(eq(lists.id, listCareerPages.listId), isNull(lists.deletedAt)))
      .innerJoin(users, eq(users.id, lists.userId))
      .where(and(eq(listCareerPages.careerPageId, page.id), notificationEnabled('sourceFailures')));
    const day = new Date().toISOString().slice(0, 10);
    await createNotifications(
      owners.map(
        (owner): NewNotification => ({
          userId: owner.userId,
          type,
          title,
          body,
          link: `/dashboard/companies?focus=${page.id}`,
          data: { careerPageId: page.id },
          dedupeKey: `${type}:${page.id}:${day}`,
        }),
      ),
    );
  } catch (error) {
    console.error('[scan] Could not notify watchers:', (error as Error).message);
  }
}

async function recordFailure(
  page: CareerPage,
  error: ScanError,
  context: { options: RunScanOptions; startedAt: number; intervalMinutes: number; maxFailures: number },
): Promise<ScanResult> {
  const durationMs = Date.now() - context.startedAt;
  const failures = page.consecutiveFailures + 1;
  const permanent = !error.retryable;

  let status = page.status;
  let pausedReason: string | null = page.pausedReason;
  if (error.errorClass === 'unsafe_url' || error.errorClass === 'robots_disallowed') {
    status = 'paused';
    pausedReason = describeErrorClass(error.errorClass).label;
  } else if (failures >= context.maxFailures) {
    status = 'paused';
    pausedReason = `Paused automatically after ${failures} consecutive failed scans`;
  } else if (failures >= 7 || (permanent && failures >= 2)) {
    status = 'broken';
  } else if (failures >= 3) {
    status = 'degraded';
  }

  // Exponential backoff: a failing source is retried less and less often, so
  // it cannot monopolise the worker or hammer a struggling site.
  const exponent = Math.min(failures - 1, 5);
  let backoff = Math.min(MAX_BACKOFF_MINUTES, Math.max(MIN_BACKOFF_MINUTES, context.intervalMinutes * 2 ** exponent));
  if (permanent) backoff = Math.max(backoff, 12 * 60);
  if (error.retryAfterSeconds) backoff = Math.max(backoff, Math.ceil(error.retryAfterSeconds / 60));

  const message = error.message.slice(0, 500);

  await db.transaction(async tx => {
    await tx
      .update(careerPages)
      .set({
        consecutiveFailures: failures,
        status,
        pausedReason: status === 'paused' ? pausedReason : null,
        lastScrapedAt: new Date(),
        lastFailureAt: new Date(),
        lastError: message,
        lastErrorClass: error.errorClass,
        lastHttpStatus: error.httpStatus ?? null,
        lastDurationMs: durationMs,
        nextCheckAt: nextCheckAfter(backoff),
        updatedAt: new Date(),
      })
      .where(eq(careerPages.id, page.id));

    await tx.insert(scrapeLogs).values({
      careerPageId: page.id,
      taskId: context.options.taskId ?? null,
      success: false,
      suspicious: false,
      outcome: 'failed',
      trigger: context.options.trigger,
      httpStatus: error.httpStatus ?? null,
      errorClass: error.errorClass,
      errorMessage: message,
      jobsFound: 0,
      jobsAdded: 0,
      jobsRemoved: 0,
      durationMs,
      workerId: context.options.workerId ?? null,
      scraperVersion: SCANNER_VERSION,
    });
  });

  const becameUnhealthy = (status === 'broken' || status === 'paused') && page.status !== status;
  if (becameUnhealthy) {
    const name = page.companyName || new URL(page.url).hostname;
    await notifyWatchers(
      page,
      'source_failed',
      status === 'paused' ? `Monitoring paused for ${name}` : `${name} can no longer be checked`,
      `${describeErrorClass(error.errorClass).label}. ${describeErrorClass(error.errorClass).hint}`,
    );
  }

  return {
    outcome: 'failed',
    adapter: null,
    jobsFound: 0,
    jobsAdded: 0,
    jobsRemoved: 0,
    jobsUpdated: 0,
    jobsReopened: 0,
    durationMs,
    httpStatus: error.httpStatus ?? null,
    errorClass: error.errorClass,
    errorMessage: message,
  };
}

async function recordUnchanged(
  page: CareerPage,
  extraction: ExtractionResult,
  context: { options: RunScanOptions; startedAt: number; intervalMinutes: number; jobsFound: number },
): Promise<ScanResult> {
  const durationMs = Date.now() - context.startedAt;
  const recovered = page.status === 'broken' || page.status === 'degraded' || page.status === 'paused';

  await db.transaction(async tx => {
    await tx
      .update(careerPages)
      .set({
        lastScrapedAt: new Date(),
        lastSuccessAt: new Date(),
        consecutiveFailures: 0,
        status: 'active',
        pausedReason: null,
        lastError: null,
        lastErrorClass: null,
        lastHttpStatus: extraction.httpStatus,
        lastDurationMs: durationMs,
        robotsAllowed: extraction.robotsAllowed ?? page.robotsAllowed,
        robotsCheckedAt: extraction.robotsAllowed === null ? page.robotsCheckedAt : new Date(),
        nextCheckAt: nextCheckAfter(context.intervalMinutes),
        updatedAt: new Date(),
      })
      .where(eq(careerPages.id, page.id));

    await tx.insert(scrapeLogs).values({
      careerPageId: page.id,
      taskId: context.options.taskId ?? null,
      success: true,
      suspicious: false,
      outcome: 'unchanged',
      trigger: context.options.trigger,
      adapter: extraction.adapter,
      httpStatus: extraction.httpStatus,
      jobsFound: context.jobsFound,
      jobsAdded: 0,
      jobsRemoved: 0,
      durationMs,
      workerId: context.options.workerId ?? null,
      scraperVersion: SCANNER_VERSION,
    });
  });

  if (recovered && page.consecutiveFailures >= 7) {
    await notifyWatchers(page, 'source_recovered', `${page.companyName || new URL(page.url).hostname} is being monitored again`, 'The last scan succeeded.');
  }

  return {
    outcome: 'unchanged',
    adapter: extraction.adapter,
    jobsFound: context.jobsFound,
    jobsAdded: 0,
    jobsRemoved: 0,
    jobsUpdated: 0,
    jobsReopened: 0,
    durationMs,
    httpStatus: extraction.httpStatus,
  };
}

/** Tells people who saved or are tracking a job that it changed or closed. */
async function notifyTrackers(events: { jobId: string; title: string; kind: 'closed' | 'updated'; detail?: string }[], companyName: string | null): Promise<void> {
  if (events.length === 0) return;
  try {
    const trackers = await db
      .select({ userId: userJobs.userId, jobId: userJobs.jobId })
      .from(userJobs)
      .innerJoin(users, eq(users.id, userJobs.userId))
      .where(and(inArray(userJobs.jobId, events.map(event => event.jobId)), sql`${userJobs.status} <> 'dismissed'`, notificationEnabled('jobChanges')));
    if (trackers.length === 0) return;

    const byJob = new Map(events.map(event => [event.jobId, event]));
    const day = new Date().toISOString().slice(0, 10);
    await createNotifications(
      trackers.flatMap((tracker): NewNotification[] => {
        const event = tracker.jobId ? byJob.get(tracker.jobId) : undefined;
        if (!event) return [];
        return [
          {
            userId: tracker.userId,
            type: 'job_updated',
            title: event.kind === 'closed' ? `Closed: ${event.title}` : `Updated: ${event.title}`,
            body:
              event.kind === 'closed'
                ? `${companyName ?? 'The company'} is no longer listing this job.`
                : `${companyName ?? 'The company'} changed this posting${event.detail ? ` (${event.detail})` : ''}.`,
            link: `/dashboard/jobs/${event.jobId}`,
            data: { jobId: event.jobId, kind: event.kind },
            dedupeKey: `job_${event.kind}:${event.jobId}:${day}`,
          },
        ];
      }),
    );
  } catch (error) {
    console.error('[scan] Could not notify trackers:', (error as Error).message);
  }
}

export async function runScan(careerPageId: string, options: RunScanOptions): Promise<ScanResult> {
  const startedAt = Date.now();
  const [page] = await db.select().from(careerPages).where(eq(careerPages.id, careerPageId));
  if (!page) throw new Error(`Source ${careerPageId} does not exist.`);

  const settings = await getSettings([
    'monitoring.ai_extraction_enabled',
    'monitoring.respect_robots_txt',
    'monitoring.max_failures_before_pause',
    'notifications.first_scan_alerts',
  ]);
  const intervalMinutes = await effectiveInterval(page);
  const http = options.http ?? createHttpClient();

  // ---- 1. Extract ---------------------------------------------------------
  let extraction: ExtractionResult;
  try {
    extraction = await extractSource({
      url: page.url,
      adapterOverride: page.adapterOverride,
      lastContentHash: page.lastContentHash,
      allowAi: settings['monitoring.ai_extraction_enabled'],
      respectRobots: settings['monitoring.respect_robots_txt'],
      force: options.force,
      http,
    });
  } catch (error) {
    return recordFailure(page, toScanError(error), {
      options,
      startedAt,
      intervalMinutes,
      maxFailures: settings['monitoring.max_failures_before_pause'],
    });
  }

  if (extraction.unchanged) {
    return recordUnchanged(page, extraction, { options, startedAt, intervalMinutes, jobsFound: page.lastJobsFound ?? 0 });
  }

  // ---- 2. Normalise -------------------------------------------------------
  const scraped = normalizeJobs(extraction.jobs, page.url);
  const contentHash = extraction.pageHash ?? `r:${resultSetHash(scraped)}`;

  // Identical result set to last time: nothing to write except the heartbeat.
  if (!options.force && !extraction.truncated && page.lastContentHash === contentHash && page.lastSuccessAt) {
    return recordUnchanged(page, extraction, { options, startedAt, intervalMinutes, jobsFound: scraped.length });
  }

  // ---- 3. Diff ------------------------------------------------------------
  const stored: StoredJob[] = await db
    .select({
      id: jobs.id,
      fingerprint: jobs.fingerprint,
      externalId: jobs.externalId,
      url: jobs.url,
      title: jobs.title,
      location: jobs.location,
      status: jobs.status,
      missedScrapes: jobs.missedScrapes,
      contentHash: jobs.contentHash,
      hiddenAt: jobs.hiddenAt,
      closedAt: jobs.closedAt,
      department: jobs.department,
      workplaceType: jobs.workplaceType,
      employmentType: jobs.employmentType,
      salaryText: jobs.salaryText,
      deadlineAt: jobs.deadlineAt,
    })
    .from(jobs)
    .where(eq(jobs.careerPageId, careerPageId));

  const diff = diffJobs(scraped, stored, { pageUrl: page.url });
  const isFirstScan = !page.lastSuccessAt;

  // Anti-spike: when most of a board vanishes at once the scan is more likely
  // wrong (bot wall, layout change) than right. Hold the closures back, but
  // believe it once the same thing has been seen several scans running.
  let suspicious = false;
  if (diff.isSuspicious && !isFirstScan) {
    const recent = await db
      .select({ outcome: scrapeLogs.outcome })
      .from(scrapeLogs)
      .where(eq(scrapeLogs.careerPageId, careerPageId))
      .orderBy(desc(scrapeLogs.scrapedAt))
      .limit(ACCEPT_SPIKE_AFTER - 1);
    const confirmed = recent.length === ACCEPT_SPIKE_AFTER - 1 && recent.every(log => log.outcome === 'suspicious');
    suspicious = !confirmed;
  }

  const applyRemovals = !suspicious && !extraction.truncated;
  const closeAfter = CLOSE_AFTER_MISSES[extraction.kind];
  const now = new Date();

  // ---- 4. Persist ---------------------------------------------------------
  const outcome = await db.transaction(async tx => {
    const events: (typeof jobEvents.$inferInsert)[] = [];
    const trackerEvents: { jobId: string; title: string; kind: 'closed' | 'updated'; detail?: string }[] = [];
    let added = 0;
    let updated = 0;
    let reopened = 0;
    let removed = 0;

    // New jobs. A deadline already in the past means the posting is stale.
    const insertedForMatching: JobForMatching[] = [];
    for (let index = 0; index < diff.newJobs.length; index += 200) {
      const batch = diff.newJobs.slice(index, index + 200);
      const rows = await tx
        .insert(jobs)
        .values(
          batch.map(job => {
            const expired = Boolean(job.deadlineAt && job.deadlineAt.getTime() < now.getTime());
            return {
              careerPageId,
              fingerprint: job.keys.primary,
              ...jobColumns(job),
              status: expired ? 'closed' : 'active',
              closedAt: expired ? now : null,
              firstSeenAt: now,
              lastSeenAt: now,
              updatedAt: now,
            };
          }),
        )
        .onConflictDoNothing({ target: [jobs.careerPageId, jobs.fingerprint] })
        .returning({ id: jobs.id, fingerprint: jobs.fingerprint, status: jobs.status });

      const byFingerprint = new Map(batch.map(job => [job.keys.primary, job]));
      for (const row of rows) {
        const job = byFingerprint.get(row.fingerprint);
        if (!job) continue;
        events.push({ jobId: row.id, careerPageId, type: 'discovered' });
        if (row.status === 'active') {
          added++;
          insertedForMatching.push({
            id: row.id,
            title: job.title,
            department: job.department,
            location: job.location,
            description: job.description,
            workplaceType: job.workplaceType,
            employmentType: job.employmentType,
            seniority: job.seniority,
          });
        }
      }
    }

    // Matched jobs.
    const seenIds: string[] = [];
    for (const match of diff.matched) {
      const { stored: existing, scraped: fresh } = match;
      // Jobs removed by an admin stay removed, however often they reappear.
      if (existing.hiddenAt) continue;

      const backfill = existing.contentHash === null; // row written before v2
      const rekeyed = match.matchedBy !== 'fingerprint';
      const expired = Boolean(fresh.deadlineAt && fresh.deadlineAt.getTime() < now.getTime());

      if (!match.changed && !match.reopened && !backfill && !rekeyed && !expired) {
        seenIds.push(existing.id);
        continue;
      }

      const reopening = match.reopened && !expired;
      await tx
        .update(jobs)
        .set({
          ...jobColumns(fresh),
          fingerprint: fresh.keys.primary,
          status: expired ? 'closed' : 'active',
          closedAt: expired ? (existing.closedAt ?? now) : null,
          reopenedAt: reopening ? now : undefined,
          missedScrapes: 0,
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(eq(jobs.id, existing.id));

      if (reopening) {
        reopened++;
        events.push({ jobId: existing.id, careerPageId, type: 'reopened' });
      } else if (expired && existing.status === 'active') {
        removed++;
        events.push({ jobId: existing.id, careerPageId, type: 'closed', changes: { reason: { from: null, to: 'deadline passed' } } });
        trackerEvents.push({ jobId: existing.id, title: fresh.title, kind: 'closed' });
      }
      if (match.changed && !backfill) {
        updated++;
        const changes = describeChanges(existing, fresh);
        events.push({ jobId: existing.id, careerPageId, type: 'updated', changes });
        trackerEvents.push({ jobId: existing.id, title: fresh.title, kind: 'updated', detail: Object.keys(changes).join(', ') });
      }
    }

    for (let index = 0; index < seenIds.length; index += 1000) {
      await tx
        .update(jobs)
        .set({ lastSeenAt: now, missedScrapes: 0 })
        .where(inArray(jobs.id, seenIds.slice(index, index + 1000)));
    }

    // Jobs that were not in this scan.
    if (applyRemovals && diff.missing.length > 0) {
      const closing = diff.missing.filter(job => job.missedScrapes + 1 >= closeAfter);
      const waiting = diff.missing.filter(job => job.missedScrapes + 1 < closeAfter);

      if (closing.length > 0) {
        await tx
          .update(jobs)
          .set({ status: 'closed', closedAt: now, missedScrapes: sql`${jobs.missedScrapes} + 1`, updatedAt: now })
          .where(inArray(jobs.id, closing.map(job => job.id)));
        removed += closing.length;
        for (const job of closing) {
          events.push({ jobId: job.id, careerPageId, type: 'closed' });
          trackerEvents.push({ jobId: job.id, title: job.title, kind: 'closed' });
        }
      }
      if (waiting.length > 0) {
        await tx
          .update(jobs)
          .set({ missedScrapes: sql`${jobs.missedScrapes} + 1` })
          .where(inArray(jobs.id, waiting.map(job => job.id)));
      }
    }

    for (let index = 0; index < events.length; index += 500) {
      await tx.insert(jobEvents).values(events.slice(index, index + 500));
    }

    // Jobs that were already open when a company was first added are not
    // "new" to anyone; record them as matches but do not alert.
    const notify = !isFirstScan || settings['notifications.first_scan_alerts'];
    const matching = await matchJobsForSource(careerPageId, insertedForMatching, {
      notify,
      companyName: page.companyName ?? extraction.companyName,
      executor: tx,
    });

    const [{ active }] = await tx
      .select({ active: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.careerPageId, careerPageId), eq(jobs.status, 'active'), isNull(jobs.hiddenAt)));

    const durationMs = Date.now() - startedAt;
    await tx
      .update(careerPages)
      .set({
        atsType: extraction.adapter,
        scrapeMethod: extraction.kind,
        // A suspicious or truncated scan must not be remembered as "the
        // current state", or the next identical scan would be skipped.
        lastContentHash: suspicious || extraction.truncated ? page.lastContentHash : contentHash,
        lastScrapedAt: now,
        lastSuccessAt: now,
        consecutiveFailures: 0,
        status: suspicious ? 'degraded' : 'active',
        pausedReason: null,
        lastError: suspicious ? `${Math.round(diff.dropRatio * 100)}% of the open jobs disappeared in one scan. They are being kept until this is confirmed.` : null,
        lastErrorClass: null,
        lastHttpStatus: extraction.httpStatus,
        lastDurationMs: durationMs,
        lastJobsFound: scraped.length,
        activeJobCount: active,
        companyName: page.companyName || extraction.companyName || page.companyName,
        robotsAllowed: extraction.robotsAllowed ?? page.robotsAllowed,
        robotsCheckedAt: extraction.robotsAllowed === null ? page.robotsCheckedAt : now,
        nextCheckAt: nextCheckAfter(intervalMinutes),
        updatedAt: now,
      })
      .where(eq(careerPages.id, careerPageId));

    await tx.insert(scrapeLogs).values({
      careerPageId,
      taskId: options.taskId ?? null,
      success: true,
      suspicious,
      outcome: suspicious ? 'suspicious' : 'success',
      trigger: options.trigger,
      adapter: extraction.adapter,
      httpStatus: extraction.httpStatus,
      jobsFound: scraped.length,
      jobsAdded: added,
      jobsRemoved: removed,
      jobsUpdated: updated,
      jobsReopened: reopened,
      durationMs,
      errorMessage: suspicious
        ? `Anti-spike guard: ${diff.missing.length} of the open jobs were missing. Closures held back.`
        : extraction.truncated
          ? 'The source returned an incomplete list. Closures were skipped for this scan.'
          : null,
      workerId: options.workerId ?? null,
      scraperVersion: SCANNER_VERSION,
    });

    return { added, updated, reopened, removed, durationMs, queued: matching.queued, trackerEvents };
  });

  // ---- 5. After commit ----------------------------------------------------
  await notifyTrackers(outcome.trackerEvents, page.companyName ?? extraction.companyName);
  if ((page.status === 'broken' || page.status === 'paused') && page.consecutiveFailures >= 7) {
    await notifyWatchers(page, 'source_recovered', `${page.companyName || new URL(page.url).hostname} is being monitored again`, 'The last scan succeeded.');
  }

  return {
    outcome: suspicious ? 'suspicious' : 'success',
    adapter: extraction.adapter,
    jobsFound: scraped.length,
    jobsAdded: outcome.added,
    jobsRemoved: outcome.removed,
    jobsUpdated: outcome.updated,
    jobsReopened: outcome.reopened,
    durationMs: outcome.durationMs,
    httpStatus: extraction.httpStatus,
    notificationsQueued: outcome.queued,
  };
}

/** Human-readable adapter name for logs and UI. */
export function adapterName(id: string | null): string {
  return getAdapter(id)?.label ?? id ?? 'unknown';
}
