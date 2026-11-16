import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/client';
import {
  careerPages,
  jobMatches,
  jobs,
  listCareerPages,
  listCollaborators,
  listSubscriptions,
  lists,
  notificationQueue,
  users,
} from '@/lib/db/schema';
import { evaluateJob, type MatchableJob } from '@/lib/matching/engine';
import { rulesFromSubscription } from '@/lib/matching/rules';
import { createNotifications, type NewNotification } from '@/lib/notifications/inapp';
import { INHERIT_FREQUENCY, getFrequencyIntervalMs } from '@/lib/utils/frequency';
import { pluralize } from '@/lib/utils/pluralize';

/**
 * Connects discovered jobs to the people who asked to hear about them.
 *
 * For each job and each subscription on a watchlist that contains the job's
 * source, the subscription's rules are evaluated. A match is recorded in
 * `job_matches` (which powers the "Matching" feed and the explanation shown
 * to the user) and, when alerts are on, queued for email and announced in
 * the in-app notification centre.
 */

export interface JobForMatching extends MatchableJob {
  id: string;
}

interface SubscriptionRow {
  userId: string;
  listId: string;
  listName: string;
  positiveKeywords: string[] | null;
  negativeKeywords: string[] | null;
  matchRules: unknown;
  digestFrequency: string;
  alertsEnabled: boolean;
  notificationSettings: unknown;
  emailNotificationsEnabled: boolean;
}

/**
 * Subscriptions entitled to see jobs from a source. A follower of a list that
 * has since been made private no longer qualifies; previously they kept
 * receiving alerts for a list they could no longer open.
 */
async function loadSubscriptions(careerPageId: string, executor: DbOrTx, onlyUserId?: string, onlyListId?: string): Promise<SubscriptionRow[]> {
  return executor
    .select({
      userId: listSubscriptions.userId,
      listId: listSubscriptions.listId,
      listName: lists.name,
      positiveKeywords: listSubscriptions.positiveKeywords,
      negativeKeywords: listSubscriptions.negativeKeywords,
      matchRules: listSubscriptions.matchRules,
      digestFrequency: listSubscriptions.digestFrequency,
      alertsEnabled: listSubscriptions.alertsEnabled,
      notificationSettings: users.notificationSettings,
      emailNotificationsEnabled: users.emailNotificationsEnabled,
    })
    .from(listCareerPages)
    .innerJoin(lists, and(eq(lists.id, listCareerPages.listId), isNull(lists.deletedAt)))
    .innerJoin(listSubscriptions, eq(listSubscriptions.listId, lists.id))
    .innerJoin(users, eq(users.id, listSubscriptions.userId))
    .where(
      and(
        eq(listCareerPages.careerPageId, careerPageId),
        eq(listCareerPages.isPaused, false),
        eq(users.isBlocked, false),
        onlyUserId ? eq(listSubscriptions.userId, onlyUserId) : undefined,
        onlyListId ? eq(listSubscriptions.listId, onlyListId) : undefined,
        sql`(
          ${lists.visibility} = 'public'
          OR ${lists.userId} = ${listSubscriptions.userId}
          OR EXISTS (
            SELECT 1 FROM ${listCollaborators}
            WHERE ${listCollaborators.listId} = ${lists.id}
              AND ${listCollaborators.userId} = ${listSubscriptions.userId}
              AND ${listCollaborators.status} = 'accepted'
          )
        )`,
      ),
    );
}

export interface MatchOutcome {
  matches: number;
  queued: number;
  usersNotified: number;
}

export interface MatchOptions {
  /** Queue email alerts and create in-app notifications. False records matches silently. */
  notify: boolean;
  companyName?: string | null;
  executor?: DbOrTx;
}

export async function matchJobsForSource(careerPageId: string, newJobs: JobForMatching[], options: MatchOptions): Promise<MatchOutcome> {
  const executor = options.executor ?? db;
  if (newJobs.length === 0) return { matches: 0, queued: 0, usersNotified: 0 };

  const subscriptions = await loadSubscriptions(careerPageId, executor);
  if (subscriptions.length === 0) return { matches: 0, queued: 0, usersNotified: 0 };

  const prepared = subscriptions.map(subscription => ({ subscription, rules: rulesFromSubscription(subscription) }));

  const matchRows: (typeof jobMatches.$inferInsert)[] = [];
  // user -> job -> best list to attribute the email to
  const queueByUser = new Map<string, Map<string, { listId: string; terms: string[]; frequency: string }>>();
  const titlesByUser = new Map<string, string[]>();

  const rank = (frequency: string) => getFrequencyIntervalMs(frequency === INHERIT_FREQUENCY ? 'daily' : frequency);

  for (const job of newJobs) {
    for (const { subscription, rules } of prepared) {
      const result = evaluateJob(job, rules);
      if (!result.matched) continue;

      matchRows.push({
        userId: subscription.userId,
        jobId: job.id,
        listId: subscription.listId,
        matchedTerms: result.terms,
        reasons: result.reasons,
      });

      if (!subscription.alertsEnabled) continue;

      const perUser = queueByUser.get(subscription.userId) ?? new Map();
      const existing = perUser.get(job.id);
      // The queue holds one row per (user, job); attribute it to the list
      // with the fastest delivery so the user hears about it soonest.
      if (!existing || rank(subscription.digestFrequency) < rank(existing.frequency)) {
        perUser.set(job.id, { listId: subscription.listId, terms: result.terms, frequency: subscription.digestFrequency });
      }
      queueByUser.set(subscription.userId, perUser);

      const titles = titlesByUser.get(subscription.userId) ?? [];
      if (!titles.includes(job.title)) titles.push(job.title);
      titlesByUser.set(subscription.userId, titles);
    }
  }

  for (let index = 0; index < matchRows.length; index += 500) {
    await executor.insert(jobMatches).values(matchRows.slice(index, index + 500)).onConflictDoNothing();
  }

  if (!options.notify) return { matches: matchRows.length, queued: 0, usersNotified: 0 };

  const emailEnabled = new Map(subscriptions.map(subscription => [subscription.userId, subscription.emailNotificationsEnabled]));
  const queueRows: (typeof notificationQueue.$inferInsert)[] = [];
  for (const [userId, perJob] of queueByUser) {
    // Do not queue mail for people who turned email off; the match is still
    // visible in their feed and notification centre.
    if (!emailEnabled.get(userId)) continue;
    for (const [jobId, attribution] of perJob) {
      queueRows.push({ userId, jobId, listId: attribution.listId, eventType: 'new', keywordMatched: attribution.terms });
    }
  }

  let queued = 0;
  for (let index = 0; index < queueRows.length; index += 500) {
    const inserted = await executor
      .insert(notificationQueue)
      .values(queueRows.slice(index, index + 500))
      .onConflictDoNothing()
      .returning({ id: notificationQueue.id });
    queued += inserted.length;
  }

  const company = options.companyName || 'a company you follow';
  const settingsByUser = new Map(subscriptions.map(subscription => [subscription.userId, subscription.notificationSettings as Record<string, unknown> | null]));
  const hourBucket = new Date().toISOString().slice(0, 13);
  const inApp: NewNotification[] = [];
  for (const [userId, titles] of titlesByUser) {
    if (settingsByUser.get(userId)?.inApp === false) continue;
    inApp.push({
      userId,
      type: 'job_match',
      title: `${pluralize(titles.length, 'new matching job')} at ${company}`,
      body: titles.slice(0, 3).join(' · ') + (titles.length > 3 ? ` and ${titles.length - 3} more` : ''),
      link: `/dashboard/jobs?company=${careerPageId}&view=matching`,
      data: { careerPageId, count: titles.length },
      dedupeKey: `match:${careerPageId}:${hourBucket}`,
    });
  }
  const usersNotified = await createNotifications(inApp, executor);

  return { matches: matchRows.length, queued, usersNotified };
}

/**
 * Rebuilds a user's matches for one watchlist against the jobs that are open
 * right now. Called when alert rules change, when a company is added to a
 * list and when someone follows a list, so the "Matching" view is correct
 * immediately instead of only for jobs discovered afterwards. Never notifies.
 */
export async function recomputeMatchesForSubscription(userId: string, listId: string): Promise<number> {
  const [subscription] = await db
    .select({
      positiveKeywords: listSubscriptions.positiveKeywords,
      negativeKeywords: listSubscriptions.negativeKeywords,
      matchRules: listSubscriptions.matchRules,
    })
    .from(listSubscriptions)
    .where(and(eq(listSubscriptions.userId, userId), eq(listSubscriptions.listId, listId)));

  await db.delete(jobMatches).where(and(eq(jobMatches.userId, userId), eq(jobMatches.listId, listId)));
  if (!subscription) return 0;

  const rules = rulesFromSubscription(subscription);
  const needsDescription = rules.fields.includes('description');

  const openJobs = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      department: jobs.department,
      location: jobs.location,
      workplaceType: jobs.workplaceType,
      employmentType: jobs.employmentType,
      seniority: jobs.seniority,
      description: needsDescription ? jobs.description : sql<null>`NULL`,
    })
    .from(jobs)
    .innerJoin(listCareerPages, eq(listCareerPages.careerPageId, jobs.careerPageId))
    .innerJoin(careerPages, eq(careerPages.id, jobs.careerPageId))
    .where(and(eq(listCareerPages.listId, listId), eq(listCareerPages.isPaused, false), eq(jobs.status, 'active'), isNull(jobs.hiddenAt)))
    .limit(20_000);

  const rows: (typeof jobMatches.$inferInsert)[] = [];
  for (const job of openJobs) {
    const result = evaluateJob(job, rules);
    if (result.matched) rows.push({ userId, jobId: job.id, listId, matchedTerms: result.terms, reasons: result.reasons });
  }
  for (let index = 0; index < rows.length; index += 500) {
    await db.insert(jobMatches).values(rows.slice(index, index + 500)).onConflictDoNothing();
  }
  return rows.length;
}

/** Removes matches that no longer have a subscription behind them. */
export async function deleteMatchesForList(listId: string, userIds?: string[]): Promise<void> {
  await db
    .delete(jobMatches)
    .where(and(eq(jobMatches.listId, listId), userIds && userIds.length ? inArray(jobMatches.userId, userIds) : undefined));
}
