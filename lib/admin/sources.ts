import { desc, eq, inArray } from 'drizzle-orm';
import { errors } from '@/lib/api/errors';
import { recordAudit, type AuditActor } from '@/lib/audit';
import { displayCompanyName, ensureSource } from '@/lib/companies/service';
import { client, db } from '@/lib/db/client';
import { careerPages, monitorTasks, scrapeLogs, users } from '@/lib/db/schema';
import { adapterLabel, getAdapter, listAdapters } from '@/lib/monitoring/adapters';
import { describeErrorClass, toScanError } from '@/lib/monitoring/errors';
import { extractSource } from '@/lib/monitoring/extract';
import { createHttpClient } from '@/lib/monitoring/http';
import { normalizeJobs } from '@/lib/monitoring/normalize';
import { enqueueScan } from '@/lib/monitoring/queue';
import { getSetting } from '@/lib/settings/store';
import { cleanText } from '@/lib/security/html';
import { checkUrlSyntax, isSafeHref } from '@/lib/security/ssrf';

export const SOURCE_STATUS_FILTERS = ['all', 'active', 'degraded', 'broken', 'paused', 'pending', 'unwatched'] as const;
export const SOURCE_SORTS = ['name', 'newest', 'failures', 'jobs', 'last_success', 'next_check'] as const;

export async function listSources(options: {
  q?: string;
  status: (typeof SOURCE_STATUS_FILTERS)[number];
  adapter?: string;
  sort: (typeof SOURCE_SORTS)[number];
  page: number;
  pageSize: number;
}) {
  const pattern = options.q ? `%${options.q.replace(/[\\%_]/g, char => `\\${char}`)}%` : null;
  const status = {
    all: client``,
    active: client`AND cp.status = 'active' AND cp.last_success_at IS NOT NULL`,
    degraded: client`AND cp.status = 'degraded'`,
    broken: client`AND cp.status = 'broken'`,
    paused: client`AND cp.status = 'paused'`,
    pending: client`AND cp.last_success_at IS NULL AND cp.status <> 'paused'`,
    unwatched: client`AND NOT EXISTS (SELECT 1 FROM list_career_pages x JOIN lists l ON l.id = x.list_id WHERE x.career_page_id = cp.id AND l.deleted_at IS NULL)`,
  }[options.status];
  const order = {
    name: client`lower(coalesce(cp.company_name, cp.url))`,
    newest: client`cp.created_at DESC`,
    failures: client`cp.consecutive_failures DESC, cp.last_failure_at DESC NULLS LAST`,
    jobs: client`cp.active_job_count DESC`,
    last_success: client`cp.last_success_at DESC NULLS LAST`,
    next_check: client`cp.next_check_at ASC NULLS FIRST`,
  }[options.sort];

  const rows = await client<
    {
      id: string;
      url: string;
      companyName: string | null;
      adapter: string | null;
      adapterOverride: string | null;
      status: string;
      pausedReason: string | null;
      priority: number;
      lastSuccessAt: Date | null;
      lastFailureAt: Date | null;
      nextCheckAt: Date | null;
      consecutiveFailures: number;
      lastErrorClass: string | null;
      lastError: string | null;
      lastDurationMs: number | null;
      openJobs: number;
      lists: number;
      followers: number;
      activeTask: string | null;
      createdAt: Date;
      total: number;
    }[]
  >`
    SELECT cp.id, cp.url, cp.company_name AS "companyName", cp.ats_type AS adapter, cp.adapter_override AS "adapterOverride",
      cp.status, cp.paused_reason AS "pausedReason", cp.priority, cp.last_success_at AS "lastSuccessAt",
      cp.last_failure_at AS "lastFailureAt", cp.next_check_at AS "nextCheckAt", cp.consecutive_failures AS "consecutiveFailures",
      cp.last_error_class AS "lastErrorClass", cp.last_error AS "lastError", cp.last_duration_ms AS "lastDurationMs",
      cp.active_job_count AS "openJobs", cp.created_at AS "createdAt",
      (SELECT count(*) FROM list_career_pages x JOIN lists l ON l.id = x.list_id WHERE x.career_page_id = cp.id AND l.deleted_at IS NULL)::int AS lists,
      (SELECT count(DISTINCT s.user_id) FROM list_career_pages x JOIN list_subscriptions s ON s.list_id = x.list_id
        JOIN lists l ON l.id = x.list_id WHERE x.career_page_id = cp.id AND l.deleted_at IS NULL)::int AS followers,
      (SELECT t.status FROM monitor_tasks t WHERE t.career_page_id = cp.id AND t.status IN ('queued', 'running') LIMIT 1) AS "activeTask",
      count(*) OVER()::int AS total
    FROM career_pages cp
    WHERE true ${status}
      ${options.adapter ? client`AND cp.ats_type = ${options.adapter}` : client``}
      ${pattern ? client`AND (cp.company_name ILIKE ${pattern} OR cp.url ILIKE ${pattern})` : client``}
    ORDER BY ${order}, cp.id
    LIMIT ${options.pageSize} OFFSET ${(options.page - 1) * options.pageSize}
  `;
  return {
    total: rows[0]?.total ?? 0,
    items: rows.map(({ total: _total, ...row }) => ({
      ...row,
      name: displayCompanyName(row.companyName, row.url),
      adapterLabel: adapterLabel(row.adapter),
      errorLabel: row.lastErrorClass ? describeErrorClass(row.lastErrorClass).label : null,
    })),
  };
}

/** How many sources fall under each status filter, for the filter tabs. */
export async function sourceStatusCounts(): Promise<Record<(typeof SOURCE_STATUS_FILTERS)[number], number>> {
  const [row] = await client<Record<(typeof SOURCE_STATUS_FILTERS)[number], number>[]>`
    SELECT
      count(*)::int AS "all",
      count(*) FILTER (WHERE cp.status = 'active' AND cp.last_success_at IS NOT NULL)::int AS "active",
      count(*) FILTER (WHERE cp.status = 'degraded')::int AS "degraded",
      count(*) FILTER (WHERE cp.status = 'broken')::int AS "broken",
      count(*) FILTER (WHERE cp.status = 'paused')::int AS "paused",
      count(*) FILTER (WHERE cp.last_success_at IS NULL AND cp.status <> 'paused')::int AS "pending",
      count(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM list_career_pages x JOIN lists l ON l.id = x.list_id
        WHERE x.career_page_id = cp.id AND l.deleted_at IS NULL))::int AS "unwatched"
    FROM career_pages cp
  `;
  return row ?? { all: 0, active: 0, degraded: 0, broken: 0, paused: 0, pending: 0, unwatched: 0 };
}

/** Adapter ids and names, for filters and the adapter override picker. */
export function adapterOptions() {
  return listAdapters().map(({ id, label, kind }) => ({ id, label, kind }));
}

export async function sourceDetail(id: string) {
  const [source] = await db.select().from(careerPages).where(eq(careerPages.id, id));
  if (!source) return null;

  const [lists, scans, tasks, [jobStats]] = await Promise.all([
    client<{ id: string; name: string; visibility: string; ownerEmail: string; isPaused: boolean }[]>`
      SELECT l.id, l.name, l.visibility, u.email AS "ownerEmail", x.is_paused AS "isPaused"
      FROM list_career_pages x JOIN lists l ON l.id = x.list_id JOIN users u ON u.id = l.user_id
      WHERE x.career_page_id = ${id} AND l.deleted_at IS NULL ORDER BY l.name LIMIT 200
    `,
    db.select().from(scrapeLogs).where(eq(scrapeLogs.careerPageId, id)).orderBy(desc(scrapeLogs.scrapedAt)).limit(50),
    db.select().from(monitorTasks).where(eq(monitorTasks.careerPageId, id)).orderBy(desc(monitorTasks.enqueuedAt)).limit(20),
    client<{ open: number; closed: number; hidden: number; new7d: number }[]>`
      SELECT count(*) FILTER (WHERE status = 'active' AND hidden_at IS NULL)::int AS open,
        count(*) FILTER (WHERE status = 'closed')::int AS closed,
        count(*) FILTER (WHERE hidden_at IS NOT NULL)::int AS hidden,
        count(*) FILTER (WHERE first_seen_at > now() - interval '7 days')::int AS new7d
      FROM jobs WHERE career_page_id = ${id}
    `,
  ]);

  let createdByEmail: string | null = null;
  if (source.createdBy) {
    const [creator] = await db.select({ email: users.email }).from(users).where(eq(users.id, source.createdBy));
    createdByEmail = creator?.email ?? null;
  }

  return {
    source: {
      ...source,
      name: displayCompanyName(source.companyName, source.url),
      adapterLabel: adapterLabel(source.atsType),
      error: source.lastErrorClass ? describeErrorClass(source.lastErrorClass) : null,
      createdByEmail,
    },
    lists,
    scans: scans.map(scan => ({ ...scan, errorLabel: scan.errorClass ? describeErrorClass(scan.errorClass).label : null })),
    tasks,
    jobStats,
  };
}

export interface SourcePatch {
  companyName?: string | null;
  url?: string;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  industry?: string | null;
  hqLocation?: string | null;
  checkIntervalMinutes?: number;
  priority?: number;
  adapterOverride?: string | null;
}

export async function updateSource(actor: AuditActor, id: string, patch: SourcePatch, req: { headers: Headers }) {
  const [source] = await db.select().from(careerPages).where(eq(careerPages.id, id));
  if (!source) throw errors.notFound('Source');

  const changes: Partial<typeof careerPages.$inferInsert> = {};
  if (patch.companyName !== undefined) changes.companyName = cleanText(patch.companyName, 120) || null;
  if (patch.url !== undefined) {
    const syntax = checkUrlSyntax(patch.url);
    if (!syntax.safe) throw errors.validation([{ field: 'url', message: syntax.reason }]);
    if (syntax.normalizedUrl !== source.url) {
      const [clash] = await db.select({ id: careerPages.id }).from(careerPages).where(eq(careerPages.url, syntax.normalizedUrl!));
      if (clash) throw errors.conflict('Another source already uses that URL.', { sourceId: clash.id });
      changes.url = syntax.normalizedUrl!;
      // A new URL starts fresh: forget the previous content fingerprint and errors.
      Object.assign(changes, { lastContentHash: null, consecutiveFailures: 0, lastError: null, lastErrorClass: null, nextCheckAt: new Date() });
    }
  }
  for (const key of ['websiteUrl', 'logoUrl'] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value && !isSafeHref(value)) throw errors.validation([{ field: key, message: 'Use a full http(s) URL.' }]);
    changes[key] = value || null;
  }
  if (patch.industry !== undefined) changes.industry = cleanText(patch.industry, 80) || null;
  if (patch.hqLocation !== undefined) changes.hqLocation = cleanText(patch.hqLocation, 120) || null;
  if (patch.checkIntervalMinutes !== undefined) changes.checkIntervalMinutes = Math.min(10080, Math.max(15, Math.round(patch.checkIntervalMinutes)));
  if (patch.priority !== undefined) changes.priority = Math.min(100, Math.max(-10, Math.round(patch.priority)));
  if (patch.adapterOverride !== undefined) {
    if (patch.adapterOverride && !getAdapter(patch.adapterOverride)) throw errors.validation([{ field: 'adapterOverride', message: 'Unknown adapter.' }]);
    changes.adapterOverride = patch.adapterOverride || null;
    changes.lastContentHash = null;
  }
  if (Object.keys(changes).length === 0) return sourceDetail(id);

  await db.update(careerPages).set({ ...changes, updatedAt: new Date() }).where(eq(careerPages.id, id));
  const before = Object.fromEntries(Object.keys(changes).map(key => [key, (source as Record<string, unknown>)[key]]));
  await recordAudit({
    action: patch.adapterOverride !== undefined ? 'source.adapter_override' : 'source.update',
    actor,
    targetType: 'source',
    targetId: id,
    metadata: { url: source.url, before, after: changes },
    req,
  });
  return sourceDetail(id);
}

export async function setSourcePaused(actor: AuditActor, ids: string[], paused: boolean, reason: string | null, req: { headers: Headers }) {
  if (ids.length === 0) return 0;
  const rows = await db
    .update(careerPages)
    .set(
      paused
        ? { status: 'paused', pausedReason: cleanText(reason, 200) || 'Paused by an administrator', updatedAt: new Date() }
        : { status: 'active', pausedReason: null, consecutiveFailures: 0, nextCheckAt: new Date(), updatedAt: new Date() },
    )
    .where(inArray(careerPages.id, ids))
    .returning({ id: careerPages.id });
  for (const row of rows) {
    await recordAudit({ action: paused ? 'source.pause' : 'source.resume', actor, targetType: 'source', targetId: row.id, metadata: reason ? { reason } : undefined, req });
  }
  return rows.length;
}

export async function queueSourceScans(actor: AuditActor, ids: string[], force: boolean, req: { headers: Headers }) {
  let queued = 0;
  for (const id of ids) {
    const result = await enqueueScan(id, { trigger: 'manual', force, requestedBy: actor.id });
    if (!result.alreadyQueued) queued++;
    await recordAudit({ action: 'source.scan', actor, targetType: 'source', targetId: id, metadata: { force }, req });
  }
  return { queued, alreadyQueued: ids.length - queued };
}

export async function deleteSources(actor: AuditActor, ids: string[], req: { headers: Headers }) {
  const rows = await db.delete(careerPages).where(inArray(careerPages.id, ids)).returning({ id: careerPages.id, url: careerPages.url, companyName: careerPages.companyName });
  for (const row of rows) {
    await recordAudit({ action: 'source.delete', actor, targetType: 'source', targetId: row.id, metadata: { url: row.url, companyName: row.companyName }, req });
  }
  return rows.length;
}

export async function createSourceAsAdmin(actor: AuditActor, input: { url: string; companyName?: string | null; scanNow?: boolean }, req: { headers: Headers }) {
  const source = await ensureSource(input.url, { companyName: input.companyName, createdBy: actor.id });
  await recordAudit({ action: 'source.create', actor, targetType: 'source', targetId: source.id, metadata: { url: source.url }, req });
  if (input.scanNow !== false) await enqueueScan(source.id, { trigger: 'manual', requestedBy: actor.id });
  return source;
}

/** Runs extraction for a URL (optionally forcing an adapter) without saving anything. */
export async function testExtraction(url: string, adapterOverride?: string | null) {
  const syntax = checkUrlSyntax(url);
  if (!syntax.safe) throw errors.validation([{ field: 'url', message: syntax.reason }]);
  if (adapterOverride && !getAdapter(adapterOverride)) throw errors.validation([{ field: 'adapter', message: 'Unknown adapter.' }]);
  const http = createHttpClient({ maxRequests: 40 });
  const started = Date.now();
  try {
    const extraction = await extractSource({
      url: syntax.normalizedUrl!,
      adapterOverride,
      allowAi: await getSetting('monitoring.ai_extraction_enabled'),
      respectRobots: await getSetting('monitoring.respect_robots_txt'),
      force: true,
      http,
      maxPages: 3,
    });
    const jobs = normalizeJobs(extraction.jobs, syntax.normalizedUrl!);
    return {
      ok: true as const,
      url: syntax.normalizedUrl,
      adapter: extraction.adapter,
      adapterLabel: adapterLabel(extraction.adapter),
      kind: extraction.kind,
      detection: extraction.detection,
      httpStatus: extraction.httpStatus,
      robotsAllowed: extraction.robotsAllowed,
      partial: extraction.truncated,
      requests: http.requestCount,
      durationMs: Date.now() - started,
      jobCount: jobs.length,
      sample: jobs.slice(0, 15).map(job => ({
        title: job.title,
        location: job.location,
        url: job.url,
        workplaceType: job.workplaceType,
        employmentType: job.employmentType,
        identity: job.keys.primary.split(':')[0],
      })),
    };
  } catch (error) {
    const scanError = toScanError(error);
    return {
      ok: false as const,
      url: syntax.normalizedUrl,
      errorClass: scanError.errorClass,
      ...describeErrorClass(scanError.errorClass),
      message: scanError.message,
      httpStatus: scanError.httpStatus ?? null,
      requests: http.requestCount,
      durationMs: Date.now() - started,
    };
  }
}
