import { and, desc, eq, sql } from 'drizzle-orm';
import { errors } from '@/lib/api/errors';
import { db } from '@/lib/db/client';
import { careerPages, jobs, userJobs } from '@/lib/db/schema';
import { USER_JOB_STATUSES, type UserJobStatus } from '@/lib/constants';
import { displayCompanyName } from '@/lib/companies/service';
import { cleanText } from '@/lib/security/html';
import { isSafeHref } from '@/lib/security/ssrf';
import { jobDetailForUser } from './queries';

/**
 * The application tracker: a user's personal pipeline of jobs they have
 * saved, applied to, or are interviewing for. Entries keep a snapshot of the
 * job, so they survive the posting closing or being removed. Jobs found
 * elsewhere can be added by hand.
 */

export interface TrackerSnapshot {
  title: string;
  companyName: string;
  url: string | null;
  location: string | null;
  companyId?: string | null;
}

export interface TrackerPatch {
  status?: UserJobStatus | null;
  notes?: string | null;
  appliedAt?: string | null;
  reminderAt?: string | null;
}

function parseOptionalDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw errors.validation([{ field: 'date', message: 'That date is not valid.' }]);
  return date;
}

/** Sets (or, with status null, clears) the user's state for a JobPingly job. */
export async function setJobState(userId: string, jobId: string, patch: TrackerPatch) {
  const detail = await jobDetailForUser(userId, jobId);
  if (!detail) throw errors.notFound('Job');

  if (patch.status === null) {
    await db.delete(userJobs).where(and(eq(userJobs.userId, userId), eq(userJobs.jobId, jobId)));
    return null;
  }
  if (patch.status !== undefined && !(USER_JOB_STATUSES as readonly string[]).includes(patch.status)) {
    throw errors.validation([{ field: 'status', message: 'Unknown status.' }]);
  }

  const snapshot: TrackerSnapshot = {
    title: detail.job.title,
    companyName: detail.company.name,
    url: detail.job.url,
    location: detail.job.location,
    companyId: detail.company.id,
  };

  const [existing] = await db.select().from(userJobs).where(and(eq(userJobs.userId, userId), eq(userJobs.jobId, jobId)));
  const status = patch.status ?? existing?.status ?? 'saved';
  const appliedAt = parseOptionalDate(patch.appliedAt);
  const reminderAt = parseOptionalDate(patch.reminderAt);

  const values = {
    status,
    snapshot,
    updatedAt: new Date(),
    ...(patch.notes !== undefined ? { notes: patch.notes ? patch.notes.slice(0, 5000) : null } : {}),
    ...(appliedAt !== undefined ? { appliedAt } : {}),
    // Moving to "applied" for the first time records when.
    ...(appliedAt === undefined && status === 'applied' && !existing?.appliedAt ? { appliedAt: new Date() } : {}),
    ...(reminderAt !== undefined ? { reminderAt, reminderSentAt: null } : {}),
  };

  const [row] = existing
    ? await db.update(userJobs).set(values).where(eq(userJobs.id, existing.id)).returning()
    : await db.insert(userJobs).values({ userId, jobId, ...values }).returning();
  return row;
}

/** Adds a job found outside JobPingly to the tracker. */
export async function addExternalJob(userId: string, input: { title: string; companyName: string; url?: string | null; location?: string | null; status?: UserJobStatus; notes?: string | null }) {
  const title = cleanText(input.title, 200);
  const companyName = cleanText(input.companyName, 120);
  if (!title || !companyName) throw errors.validation([{ field: 'title', message: 'Enter a job title and company.' }]);
  const url = input.url && isSafeHref(input.url) ? input.url : null;

  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(userJobs).where(eq(userJobs.userId, userId));
  if ((count?.n ?? 0) >= 2000) throw errors.limitReached('Your tracker is full (2,000 entries). Remove some old entries first.');

  const status = input.status && input.status !== 'dismissed' ? input.status : 'saved';
  const [row] = await db
    .insert(userJobs)
    .values({
      userId,
      jobId: null,
      status,
      notes: input.notes ? input.notes.slice(0, 5000) : null,
      appliedAt: status === 'applied' ? new Date() : null,
      snapshot: { title, companyName, url, location: cleanText(input.location, 120) || null } satisfies TrackerSnapshot,
    })
    .returning();
  return row;
}

/** Updates a tracker entry by its own id (works for external entries too). */
export async function updateTrackerEntry(userId: string, entryId: string, patch: TrackerPatch & { title?: string; companyName?: string; url?: string | null }) {
  const [entry] = await db.select().from(userJobs).where(and(eq(userJobs.id, entryId), eq(userJobs.userId, userId)));
  if (!entry) throw errors.notFound('Tracker entry');

  if (patch.status === null) {
    await db.delete(userJobs).where(eq(userJobs.id, entry.id));
    return null;
  }

  const snapshot = { ...(entry.snapshot as TrackerSnapshot) };
  if (!entry.jobId) {
    if (patch.title !== undefined) snapshot.title = cleanText(patch.title, 200) || snapshot.title;
    if (patch.companyName !== undefined) snapshot.companyName = cleanText(patch.companyName, 120) || snapshot.companyName;
    if (patch.url !== undefined) snapshot.url = patch.url && isSafeHref(patch.url) ? patch.url : null;
  }

  const status = patch.status ?? entry.status;
  if (!(USER_JOB_STATUSES as readonly string[]).includes(status)) throw errors.validation([{ field: 'status', message: 'Unknown status.' }]);
  const appliedAt = parseOptionalDate(patch.appliedAt);
  const reminderAt = parseOptionalDate(patch.reminderAt);

  const [row] = await db
    .update(userJobs)
    .set({
      status,
      snapshot,
      updatedAt: new Date(),
      ...(patch.notes !== undefined ? { notes: patch.notes ? patch.notes.slice(0, 5000) : null } : {}),
      ...(appliedAt !== undefined ? { appliedAt } : status === 'applied' && !entry.appliedAt ? { appliedAt: new Date() } : {}),
      ...(reminderAt !== undefined ? { reminderAt, reminderSentAt: null } : {}),
    })
    .where(eq(userJobs.id, entry.id))
    .returning();
  return row;
}

export async function trackerForUser(userId: string) {
  const rows = await db
    .select({
      id: userJobs.id,
      jobId: userJobs.jobId,
      status: userJobs.status,
      notes: userJobs.notes,
      appliedAt: userJobs.appliedAt,
      reminderAt: userJobs.reminderAt,
      snapshot: userJobs.snapshot,
      createdAt: userJobs.createdAt,
      updatedAt: userJobs.updatedAt,
      jobStatus: jobs.status,
      jobUrl: jobs.url,
      jobTitle: jobs.title,
      companyName: careerPages.companyName,
      companyUrl: careerPages.url,
    })
    .from(userJobs)
    .leftJoin(jobs, eq(jobs.id, userJobs.jobId))
    .leftJoin(careerPages, eq(careerPages.id, jobs.careerPageId))
    .where(and(eq(userJobs.userId, userId), sql`${userJobs.status} <> 'dismissed'`))
    .orderBy(desc(userJobs.updatedAt))
    .limit(2000);

  return rows.map(row => {
    const snapshot = (row.snapshot ?? {}) as TrackerSnapshot;
    return {
      id: row.id,
      jobId: row.jobId,
      status: row.status,
      notes: row.notes,
      appliedAt: row.appliedAt,
      reminderAt: row.reminderAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      title: row.jobTitle ?? snapshot.title,
      companyName: row.companyUrl ? displayCompanyName(row.companyName, row.companyUrl) : snapshot.companyName,
      url: row.jobUrl ?? snapshot.url ?? null,
      location: snapshot.location ?? null,
      external: !row.jobId && !snapshot.companyId,
      // The posting itself: still open, closed by the company, or no longer on JobPingly.
      postingStatus: row.jobId ? (row.jobStatus ?? 'removed') : snapshot.companyId ? 'removed' : 'external',
    };
  });
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvCell).join(','), ...rows.map(row => row.map(csvCell).join(','))].join('\r\n') + '\r\n';
}

export async function trackerCsv(userId: string): Promise<string> {
  const entries = await trackerForUser(userId);
  return toCsv(
    ['Title', 'Company', 'Status', 'Applied', 'Reminder', 'Location', 'Link', 'Posting', 'Notes', 'Updated'],
    entries.map(entry => [entry.title, entry.companyName, entry.status, entry.appliedAt, entry.reminderAt, entry.location, entry.url, entry.postingStatus, entry.notes, entry.updatedAt]),
  );
}
