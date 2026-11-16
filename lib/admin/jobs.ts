import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { errors } from '@/lib/api/errors';
import { recordAudit, type AuditActor } from '@/lib/audit';
import { displayCompanyName } from '@/lib/companies/service';
import { client, db } from '@/lib/db/client';
import { careerPages, jobEvents, jobs, notificationQueue } from '@/lib/db/schema';
import { refreshActiveJobCounts } from '@/lib/monitoring/housekeeping';
import { cleanText } from '@/lib/security/html';

export const JOB_STATUS_FILTERS = ['active', 'closed', 'hidden', 'all'] as const;

export async function listJobsAdmin(options: { q?: string; status: (typeof JOB_STATUS_FILTERS)[number]; sourceId?: string; duplicates?: boolean; page: number; pageSize: number }) {
  const pattern = options.q ? `%${options.q.replace(/[\\%_]/g, char => `\\${char}`)}%` : null;
  const status = {
    active: client`AND j.status = 'active' AND j.hidden_at IS NULL`,
    closed: client`AND j.status = 'closed' AND j.hidden_at IS NULL`,
    hidden: client`AND j.hidden_at IS NOT NULL`,
    all: client``,
  }[options.status];

  // "Possible duplicates": open jobs at the same source with the same normalised
  // title and location. They may be genuine separate requisitions, so this is a
  // review queue, not an automatic merge.
  const duplicates = options.duplicates
    ? client`AND j.hidden_at IS NULL AND j.status = 'active' AND EXISTS (
        SELECT 1 FROM jobs d WHERE d.career_page_id = j.career_page_id AND d.dedupe_key = j.dedupe_key
          AND d.id <> j.id AND d.status = 'active' AND d.hidden_at IS NULL)`
    : client``;

  const rows = await client<
    {
      id: string;
      title: string;
      url: string | null;
      location: string | null;
      status: string;
      hiddenAt: Date | null;
      hiddenReason: string | null;
      firstSeenAt: Date;
      lastSeenAt: Date;
      closedAt: Date | null;
      fingerprint: string;
      dedupeKey: string | null;
      sourceId: string;
      companyName: string | null;
      sourceUrl: string;
      matches: number;
      trackers: number;
      total: number;
    }[]
  >`
    SELECT j.id, j.title, j.url, j.location, j.status, j.hidden_at AS "hiddenAt", j.hidden_reason AS "hiddenReason",
      j.first_seen_at AS "firstSeenAt", j.last_seen_at AS "lastSeenAt", j.closed_at AS "closedAt",
      j.fingerprint, j.dedupe_key AS "dedupeKey",
      cp.id AS "sourceId", cp.company_name AS "companyName", cp.url AS "sourceUrl",
      (SELECT count(*) FROM job_matches m WHERE m.job_id = j.id)::int AS matches,
      (SELECT count(*) FROM user_jobs u WHERE u.job_id = j.id AND u.status <> 'dismissed')::int AS trackers,
      count(*) OVER()::int AS total
    FROM jobs j JOIN career_pages cp ON cp.id = j.career_page_id
    WHERE true ${status} ${duplicates}
      ${options.sourceId ? client`AND j.career_page_id = ${options.sourceId}::uuid` : client``}
      ${pattern ? client`AND (j.title ILIKE ${pattern} OR cp.company_name ILIKE ${pattern} OR j.url ILIKE ${pattern})` : client``}
    ORDER BY ${options.duplicates ? client`j.career_page_id, j.dedupe_key, j.first_seen_at` : client`j.first_seen_at DESC`}
    LIMIT ${options.pageSize} OFFSET ${(options.page - 1) * options.pageSize}
  `;
  return {
    total: rows[0]?.total ?? 0,
    items: rows.map(({ total: _total, companyName, sourceUrl, ...row }) => ({ ...row, company: displayCompanyName(companyName, sourceUrl), identity: row.fingerprint.split(':')[0] })),
  };
}

export async function jobDetailAdmin(id: string) {
  const [row] = await db.select({ job: jobs, source: careerPages }).from(jobs).innerJoin(careerPages, eq(careerPages.id, jobs.careerPageId)).where(eq(jobs.id, id));
  if (!row) return null;
  const events = await db.select().from(jobEvents).where(eq(jobEvents.jobId, id)).orderBy(desc(jobEvents.createdAt)).limit(50);
  const [counts] = await client<{ matches: number; trackers: number; pendingAlerts: number; sentAlerts: number }[]>`
    SELECT
      (SELECT count(*) FROM job_matches WHERE job_id = ${id})::int AS matches,
      (SELECT count(*) FROM user_jobs WHERE job_id = ${id} AND status <> 'dismissed')::int AS trackers,
      (SELECT count(*) FROM notification_queue WHERE job_id = ${id} AND sent_at IS NULL)::int AS "pendingAlerts",
      (SELECT count(*) FROM notification_queue WHERE job_id = ${id} AND sent_at IS NOT NULL)::int AS "sentAlerts"
  `;
  return {
    job: row.job,
    source: { id: row.source.id, name: displayCompanyName(row.source.companyName, row.source.url), url: row.source.url, adapter: row.source.atsType },
    events,
    counts,
  };
}

export async function hideJobs(actor: AuditActor, ids: string[], reason: string, req: { headers: Headers }) {
  const cleanReason = cleanText(reason, 300);
  if (!cleanReason) throw errors.validation([{ field: 'reason', message: 'Give a reason for removing the job.' }]);
  const rows = await db
    .update(jobs)
    .set({ hiddenAt: new Date(), hiddenReason: cleanReason, hiddenBy: actor.id, updatedAt: new Date() })
    .where(and(inArray(jobs.id, ids), isNull(jobs.hiddenAt)))
    .returning({ id: jobs.id, careerPageId: jobs.careerPageId, title: jobs.title });
  if (rows.length === 0) return 0;

  await db.insert(jobEvents).values(rows.map(row => ({ jobId: row.id, careerPageId: row.careerPageId, type: 'hidden', changes: { reason: { from: null, to: cleanReason } } })));
  // Nobody should be emailed about a job that was removed as spam.
  await db
    .update(notificationQueue)
    .set({ sentAt: new Date(), lastError: 'Job removed by an administrator' })
    .where(and(inArray(notificationQueue.jobId, rows.map(row => row.id)), isNull(notificationQueue.sentAt)));
  await refreshActiveJobCounts(Array.from(new Set(rows.map(row => row.careerPageId))));
  await recordAudit({ action: rows.length > 1 ? 'job.bulk' : 'job.hide', actor, targetType: 'job', targetId: rows.length === 1 ? rows[0].id : null, metadata: { reason: cleanReason, count: rows.length, titles: rows.slice(0, 10).map(row => row.title) }, req });
  return rows.length;
}

export async function restoreJobs(actor: AuditActor, ids: string[], req: { headers: Headers }) {
  const rows = await db
    .update(jobs)
    .set({ hiddenAt: null, hiddenReason: null, hiddenBy: null, updatedAt: new Date() })
    .where(and(inArray(jobs.id, ids), isNotNull(jobs.hiddenAt)))
    .returning({ id: jobs.id, careerPageId: jobs.careerPageId, title: jobs.title });
  if (rows.length === 0) return 0;
  await db.insert(jobEvents).values(rows.map(row => ({ jobId: row.id, careerPageId: row.careerPageId, type: 'restored' })));
  await refreshActiveJobCounts(Array.from(new Set(rows.map(row => row.careerPageId))));
  await recordAudit({ action: 'job.restore', actor, targetType: 'job', targetId: rows.length === 1 ? rows[0].id : null, metadata: { count: rows.length, titles: rows.slice(0, 10).map(row => row.title) }, req });
  return rows.length;
}
