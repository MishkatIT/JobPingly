import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { client, db } from '@/lib/db/client';
import { careerPages, emailVerifications, jobEvents, jobs, passwordResets, refreshTokens, scrapeLogs, sentEmailLogs, userJobs, users } from '@/lib/db/schema';
import { sendEmail } from '@/lib/email/send';
import { reminderEmail } from '@/lib/email/templates';
import { env } from '@/lib/env';
import { createNotifications } from '@/lib/notifications/inapp';
import { pruneNotifications } from '@/lib/notifications/inapp';
import { pruneNotificationQueue } from '@/lib/notifications/processor';
import { getSettings } from '@/lib/settings/store';
import { recomputeMatchesForSubscription } from './matching';
import { pruneFinishedTasks } from './queue';

/**
 * Periodic maintenance. Each task is a small number of set-based statements;
 * nothing here loads a table into memory.
 */

/**
 * One-time catch-up after upgrading from v1, which had no match table: when
 * there are alerts but no recorded matches at all, compute every alert's
 * matches against the jobs that are open now, so the "Matching" view is not
 * empty until new jobs arrive. Never notifies. Returns null when not needed.
 */
export async function backfillMatchesIfEmpty(): Promise<number | null> {
  const [state] = await client<{ hasMatches: boolean; hasSubscriptions: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM job_matches) AS "hasMatches",
      EXISTS (SELECT 1 FROM list_subscriptions) AS "hasSubscriptions"
  `;
  if (!state || state.hasMatches || !state.hasSubscriptions) return null;

  const subscriptions = await client<{ userId: string; listId: string }[]>`
    SELECT s.user_id AS "userId", s.list_id AS "listId"
    FROM list_subscriptions s
    JOIN lists l ON l.id = s.list_id AND l.deleted_at IS NULL
    JOIN users u ON u.id = s.user_id AND NOT u.is_blocked
  `;
  let total = 0;
  for (const subscription of subscriptions) {
    total += await recomputeMatchesForSubscription(subscription.userId, subscription.listId);
  }
  return total;
}

/** Closes jobs whose application deadline has passed. Runs every cycle (one UPDATE). */
export async function closeExpiredJobs(): Promise<number> {
  const rows = await client<{ id: string; career_page_id: string }[]>`
    UPDATE jobs
    SET status = 'closed', closed_at = now(), updated_at = now()
    WHERE status = 'active' AND deadline_at IS NOT NULL AND deadline_at < now()
    RETURNING id, career_page_id
  `;
  if (rows.length === 0) return 0;

  await db.insert(jobEvents).values(
    rows.map(row => ({
      jobId: row.id,
      careerPageId: row.career_page_id,
      type: 'closed',
      changes: { reason: { from: null, to: 'deadline passed' } },
    })),
  );
  await refreshActiveJobCounts(Array.from(new Set(rows.map(row => row.career_page_id))));
  return rows.length;
}

export async function refreshActiveJobCounts(careerPageIds?: string[]): Promise<void> {
  if (careerPageIds && careerPageIds.length === 0) return;
  await db
    .update(careerPages)
    .set({
      activeJobCount: sql`(
        SELECT count(*)::int FROM ${jobs}
        WHERE ${jobs.careerPageId} = ${careerPages.id} AND ${jobs.status} = 'active' AND ${jobs.hiddenAt} IS NULL
      )`,
    })
    .where(careerPageIds ? inArray(careerPages.id, careerPageIds) : undefined);
}

/** Sends due application reminders (in-app, plus email when the user allows it). */
export async function sendDueReminders(): Promise<number> {
  const due = await db
    .select({
      id: userJobs.id,
      userId: userJobs.userId,
      jobId: userJobs.jobId,
      notes: userJobs.notes,
      snapshot: userJobs.snapshot,
      email: users.email,
      name: users.name,
      emailEnabled: users.emailNotificationsEnabled,
      isBlocked: users.isBlocked,
    })
    .from(userJobs)
    .innerJoin(users, eq(users.id, userJobs.userId))
    .where(and(sql`${userJobs.reminderAt} IS NOT NULL`, lt(userJobs.reminderAt, new Date()), isNull(userJobs.reminderSentAt)))
    .limit(200);

  for (const reminder of due) {
    const snapshot = (reminder.snapshot ?? {}) as { title?: string; companyName?: string };
    const title = snapshot.title ?? 'a saved job';
    const company = snapshot.companyName ?? 'a company';
    const link = `/dashboard/tracker?focus=${reminder.id}`;

    // Mark first so a failure cannot cause the reminder to be sent repeatedly.
    await db.update(userJobs).set({ reminderSentAt: new Date() }).where(eq(userJobs.id, reminder.id));
    if (reminder.isBlocked) continue;

    await createNotifications([
      {
        userId: reminder.userId,
        type: 'reminder',
        title: `Reminder: ${title}`,
        body: `${company}${reminder.notes ? ` — ${reminder.notes.slice(0, 120)}` : ''}`,
        link,
        dedupeKey: `reminder:${reminder.id}`,
      },
    ]);

    if (reminder.emailEnabled) {
      const rendered = reminderEmail({ name: reminder.name, jobTitle: title, companyName: company, note: reminder.notes, jobUrl: `${env.appUrl}${link}` });
      await sendEmail({ to: reminder.email, toName: reminder.name, ...rendered, template: 'reminder', userId: reminder.userId });
    }
  }
  return due.length;
}

export interface HousekeepingReport {
  closedJobsDeleted: number;
  scanLogsDeleted: number;
  emailLogsDeleted: number;
  tasksDeleted: number;
  queueExpired: number;
  queueDeleted: number;
  notificationsDeleted: number;
  sessionsDeleted: number;
  tokensDeleted: number;
}

/** Retention. Runs once a day. */
export async function runDailyHousekeeping(): Promise<HousekeepingReport> {
  const settings = await getSettings([
    'monitoring.closed_job_retention_days',
    'monitoring.scan_log_retention_days',
    'email.log_retention_days',
  ]);
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

  // Closed jobs are kept while anyone still has them saved or tracked.
  const closedJobs = await db
    .delete(jobs)
    .where(
      and(
        eq(jobs.status, 'closed'),
        lt(jobs.closedAt, daysAgo(settings['monitoring.closed_job_retention_days'])),
        sql`NOT EXISTS (SELECT 1 FROM ${userJobs} WHERE ${userJobs.jobId} = ${jobs.id} AND ${userJobs.status} <> 'dismissed')`,
      ),
    )
    .returning({ id: jobs.id });

  const scanLogs = await db
    .delete(scrapeLogs)
    .where(lt(scrapeLogs.scrapedAt, daysAgo(settings['monitoring.scan_log_retention_days'])))
    .returning({ id: scrapeLogs.id });

  const emailLogs = await db
    .delete(sentEmailLogs)
    .where(lt(sentEmailLogs.createdAt, daysAgo(settings['email.log_retention_days'])))
    .returning({ id: sentEmailLogs.id });

  const tasksDeleted = await pruneFinishedTasks(7);
  const queue = await pruneNotificationQueue();
  const notificationsDeleted = await pruneNotifications(60);

  const sessions = await db
    .delete(refreshTokens)
    .where(sql`${refreshTokens.expiresAt} < now() - interval '7 days' OR ${refreshTokens.revokedAt} < now() - interval '30 days'`)
    .returning({ id: refreshTokens.id });

  const verifications = await db
    .delete(emailVerifications)
    .where(lt(emailVerifications.expiresAt, daysAgo(7)))
    .returning({ id: emailVerifications.id });
  const resets = await db.delete(passwordResets).where(lt(passwordResets.expiresAt, daysAgo(7))).returning({ id: passwordResets.id });

  return {
    closedJobsDeleted: closedJobs.length,
    scanLogsDeleted: scanLogs.length,
    emailLogsDeleted: emailLogs.length,
    tasksDeleted,
    queueExpired: queue.expired,
    queueDeleted: queue.deleted,
    notificationsDeleted,
    sessionsDeleted: sessions.length,
    tokensDeleted: verifications.length + resets.length,
  };
}
