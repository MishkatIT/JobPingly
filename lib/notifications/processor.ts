import { and, asc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { careerPages, emailApprovals, jobMatches, jobs, listSubscriptions, lists, notificationQueue, users } from '@/lib/db/schema';
import { getTodaySentEmailCount, sendEmail } from '@/lib/email/send';
import { digestEmail, type DigestJob } from '@/lib/email/templates';
import { unsubscribeLinks } from '@/lib/email/unsubscribe';
import { explainMatch, type MatchReason } from '@/lib/matching/engine';
import { describeDigestSchedule, evaluateDigestSchedule } from '@/lib/utils/digestSchedule';
import { resolveEffectiveFrequency } from '@/lib/utils/frequency';
import { loadNotificationPolicy, shouldDeferForCohort, type NotificationPolicy } from './policy';

/**
 * Drains `notification_queue` into digest emails.
 *
 * A user's pending items are delivered when, in order:
 *   1. the account can receive mail (not suspended, alerts on, address approved);
 *   2. the digest schedule says a delivery slot is due (admin-enforced policy,
 *      then the per-list frequency, then the account preference, evaluated in
 *      the user's timezone);
 *   3. the daily sending allowance has room;
 *   4. cohort staggering does not ask this user to wait for another day.
 *
 * Reliability rules:
 *   - A queue row is settled only after the email was accepted by the provider.
 *     A failed send leaves the rows pending and is retried with backoff.
 *   - Rows for recipients who are not yet approved are HELD, not dropped (they
 *     used to be marked as sent and lost).
 *   - Jobs that closed or were removed before delivery are settled silently:
 *     nobody wants an alert for a job that is already gone.
 */

export interface ProcessResult {
  usersConsidered: number;
  emailsSent: number;
  itemsDelivered: number;
  itemsSettledWithoutSending: number;
  deferred: { userId: string; email: string; reason: string }[];
  errors: string[];
}

const MAX_PENDING_ROWS = 5000;
const MAX_EMAILS_PER_CYCLE = 60;
const MAX_ATTEMPTS = 5;
const RETRY_BASE_MINUTES = 10;

interface PendingItem {
  queueId: string;
  userId: string;
  jobId: string;
  listId: string | null;
  createdAt: Date;
  attempts: number;
  lastAttemptAt: Date | null;
  userEmail: string;
  userName: string | null;
  emailNotificationsEnabled: boolean;
  isBlocked: boolean;
  notificationPreference: string;
  digestHour: number;
  digestMinute: number;
  timezone: string;
  lastDigestSentAt: Date | null;
  frequencyEnforcementExempt: boolean;
  quotaExempt: boolean;
  dispatchGroup: number;
  approvalStatus: string | null;
  listDigestFrequency: string | null;
  listName: string | null;
  jobTitle: string;
  jobUrl: string | null;
  jobLocation: string | null;
  jobStatus: string;
  jobHiddenAt: Date | null;
  companyName: string | null;
  companyUrl: string;
}

interface Channel {
  listId: string | null;
  listName: string | null;
  frequency: string;
  items: PendingItem[];
  oldestPendingAt: Date;
}

function buildChannels(items: PendingItem[], policy: NotificationPolicy): Channel[] {
  const enforced = policy.globalPolicyEnforced && !items[0].frequencyEnforcementExempt;
  const channels = new Map<string, Channel>();
  for (const item of items) {
    const key = item.listId ?? '__account__';
    const existing = channels.get(key);
    if (existing) {
      existing.items.push(item);
      if (item.createdAt < existing.oldestPendingAt) existing.oldestPendingAt = item.createdAt;
      continue;
    }
    channels.set(key, {
      listId: item.listId,
      listName: item.listName,
      frequency: resolveEffectiveFrequency({
        isEnforced: enforced,
        enforcedFrequency: policy.enforcedFrequencyValue,
        listFrequency: item.listDigestFrequency,
        accountFrequency: item.notificationPreference,
      }),
      items: [item],
      oldestPendingAt: item.createdAt,
    });
  }
  return Array.from(channels.values());
}

function deliveryClock(item: PendingItem, policy: NotificationPolicy) {
  if (policy.globalPolicyEnforced && !item.frequencyEnforcementExempt && policy.enforcedDigestHour !== null) {
    return { hour: policy.enforcedDigestHour, minute: policy.enforcedDigestMinute ?? 0, timezone: item.timezone };
  }
  return { hour: item.digestHour, minute: item.digestMinute, timezone: item.timezone };
}

function inRetryBackoff(items: PendingItem[], now: Date): boolean {
  const attempts = Math.max(...items.map(item => item.attempts));
  if (attempts === 0) return false;
  const lastAttempt = Math.max(...items.map(item => item.lastAttemptAt?.getTime() ?? 0));
  const waitMs = RETRY_BASE_MINUTES * 2 ** Math.min(attempts - 1, 5) * 60_000;
  return now.getTime() - lastAttempt < waitMs;
}

async function settle(queueIds: string[], note?: string): Promise<void> {
  for (let index = 0; index < queueIds.length; index += 1000) {
    await db
      .update(notificationQueue)
      .set({ sentAt: new Date(), ...(note ? { lastError: note } : {}) })
      .where(inArray(notificationQueue.id, queueIds.slice(index, index + 1000)));
  }
}

export interface ProcessOptions {
  /** Report what would be sent without sending or changing anything. */
  dryRun?: boolean;
  /** Ignore schedule, quota and staggering (admin "flush now"). Account-level gates still apply. */
  force?: boolean;
  /** Restrict processing to these users. */
  userIds?: string[];
  now?: Date;
}

export async function processNotificationQueue(options: ProcessOptions = {}): Promise<ProcessResult> {
  const now = options.now ?? new Date();
  const result: ProcessResult = {
    usersConsidered: 0,
    emailsSent: 0,
    itemsDelivered: 0,
    itemsSettledWithoutSending: 0,
    deferred: [],
    errors: [],
  };

  const policy = await loadNotificationPolicy({ now });
  if (!policy.notificationsEnabled) {
    result.errors.push('Email alerts are switched off in platform settings.');
    return result;
  }

  const pending = (await db
    .select({
      queueId: notificationQueue.id,
      userId: notificationQueue.userId,
      jobId: notificationQueue.jobId,
      listId: notificationQueue.listId,
      createdAt: notificationQueue.createdAt,
      attempts: notificationQueue.attempts,
      lastAttemptAt: notificationQueue.lastAttemptAt,
      userEmail: users.email,
      userName: users.name,
      emailNotificationsEnabled: users.emailNotificationsEnabled,
      isBlocked: users.isBlocked,
      notificationPreference: users.notificationPreference,
      digestHour: users.digestHour,
      digestMinute: users.digestMinute,
      timezone: users.timezone,
      lastDigestSentAt: users.lastDigestSentAt,
      frequencyEnforcementExempt: users.frequencyEnforcementExempt,
      quotaExempt: users.quotaExempt,
      dispatchGroup: users.dispatchGroup,
      approvalStatus: emailApprovals.status,
      listDigestFrequency: listSubscriptions.digestFrequency,
      listName: lists.name,
      jobTitle: jobs.title,
      jobUrl: jobs.url,
      jobLocation: jobs.location,
      jobStatus: jobs.status,
      jobHiddenAt: jobs.hiddenAt,
      companyName: careerPages.companyName,
      companyUrl: careerPages.url,
    })
    .from(notificationQueue)
    .innerJoin(users, eq(notificationQueue.userId, users.id))
    .innerJoin(jobs, eq(notificationQueue.jobId, jobs.id))
    .innerJoin(careerPages, eq(jobs.careerPageId, careerPages.id))
    .leftJoin(lists, eq(notificationQueue.listId, lists.id))
    .leftJoin(listSubscriptions, and(eq(listSubscriptions.listId, notificationQueue.listId), eq(listSubscriptions.userId, notificationQueue.userId)))
    .leftJoin(emailApprovals, eq(emailApprovals.email, users.email))
    .where(and(isNull(notificationQueue.sentAt), options.userIds?.length ? inArray(notificationQueue.userId, options.userIds) : undefined))
    .orderBy(asc(notificationQueue.createdAt))
    .limit(MAX_PENDING_ROWS)) as PendingItem[];

  if (pending.length === 0) return result;

  const byUser = new Map<string, PendingItem[]>();
  for (const item of pending) {
    const bucket = byUser.get(item.userId);
    if (bucket) bucket.push(item);
    else byUser.set(item.userId, [item]);
  }
  result.usersConsidered = byUser.size;

  let sentToday = (await getTodaySentEmailCount()).sentToday;

  for (const [userId, allItems] of byUser) {
    if (result.emailsSent >= MAX_EMAILS_PER_CYCLE) break;
    const first = allItems[0];
    const defer = (reason: string) => result.deferred.push({ userId, email: first.userEmail, reason });

    // --- Account-level gates -------------------------------------------------
    if (first.isBlocked || !first.emailNotificationsEnabled) {
      if (!options.dryRun) await settle(allItems.map(item => item.queueId), first.isBlocked ? 'Recipient suspended' : 'Recipient turned email alerts off');
      result.itemsSettledWithoutSending += allItems.length;
      continue;
    }

    // Jobs that are gone are not worth an email.
    const stale = allItems.filter(item => item.jobStatus !== 'active' || item.jobHiddenAt);
    if (stale.length > 0 && !options.dryRun) await settle(stale.map(item => item.queueId), 'Job closed before delivery');
    result.itemsSettledWithoutSending += stale.length;
    const items = allItems.filter(item => item.jobStatus === 'active' && !item.jobHiddenAt);
    if (items.length === 0) continue;

    if (policy.requireApproval && first.approvalStatus !== 'approved') {
      defer('Waiting for an administrator to approve this email address.');
      continue;
    }

    const exhausted = items.filter(item => item.attempts >= MAX_ATTEMPTS);
    if (exhausted.length > 0 && !options.dryRun) await settle(exhausted.map(item => item.queueId), 'Gave up after repeated delivery failures');
    result.itemsSettledWithoutSending += exhausted.length;
    const deliverable = items.filter(item => item.attempts < MAX_ATTEMPTS);
    if (deliverable.length === 0) continue;

    if (!options.force && inRetryBackoff(deliverable, now)) {
      defer('A previous delivery attempt failed; waiting before retrying.');
      continue;
    }

    // --- Schedule ------------------------------------------------------------
    const channels = buildChannels(deliverable, policy);
    const clock = deliveryClock(first, policy);
    let dueChannels: Channel[] = [];
    let anyRealtime = false;

    if (options.force) {
      dueChannels = channels;
    } else {
      for (const channel of channels) {
        const verdict = evaluateDigestSchedule({
          frequency: channel.frequency,
          now,
          lastSentAt: first.lastDigestSentAt,
          timezone: clock.timezone,
          hour: clock.hour,
          minute: clock.minute,
          oldestPendingAt: channel.oldestPendingAt,
        });
        if (verdict.due) {
          dueChannels.push(channel);
          if (verdict.kind === 'realtime') anyRealtime = true;
        }
      }
      if (dueChannels.length === 0) {
        defer(`Not due yet: ${describeDigestSchedule(channels[0].frequency, clock.hour, clock.minute, clock.timezone)}`);
        continue;
      }

      // --- Quota and staggering ---------------------------------------------
      if (!first.quotaExempt && sentToday >= policy.effectiveDigestLimit) {
        defer(`Daily sending allowance reached (${sentToday}/${policy.effectiveDigestLimit}).`);
        continue;
      }
      const cohort = shouldDeferForCohort({
        policy,
        dispatchGroup: first.dispatchGroup,
        sentToday,
        isRealtime: anyRealtime,
        isQuotaExempt: first.quotaExempt,
      });
      if (cohort.defer) {
        defer(cohort.reason);
        continue;
      }
    }

    // --- Build and send ------------------------------------------------------
    const dueItems = dueChannels.flatMap(channel => channel.items);
    const uniqueByJob = new Map<string, PendingItem>();
    for (const item of dueItems) if (!uniqueByJob.has(item.jobId)) uniqueByJob.set(item.jobId, item);
    const jobIds = Array.from(uniqueByJob.keys());

    const reasonRows = await db
      .select({ jobId: jobMatches.jobId, reasons: jobMatches.reasons })
      .from(jobMatches)
      .where(and(eq(jobMatches.userId, userId), inArray(jobMatches.jobId, jobIds)));
    const reasonByJob = new Map(reasonRows.map(row => [row.jobId, row.reasons as MatchReason[] | null]));

    const digestJobs: DigestJob[] = Array.from(uniqueByJob.values()).map(item => {
      const reasons = reasonByJob.get(item.jobId);
      const keywordOnly = reasons?.filter(reason => reason.kind !== 'all');
      return {
        title: item.jobTitle,
        companyName: item.companyName || new URL(item.companyUrl).hostname.replace(/^www\./, ''),
        url: item.jobUrl,
        location: item.jobLocation,
        reason: keywordOnly && keywordOnly.length > 0 ? explainMatch(keywordOnly) : null,
        jobId: item.jobId,
      };
    });

    if (options.dryRun) {
      result.emailsSent++;
      result.itemsDelivered += dueItems.length;
      sentToday++;
      continue;
    }

    const unsubscribe = unsubscribeLinks(userId);
    const rendered = digestEmail({
      name: first.userName,
      jobs: digestJobs,
      unsubscribeUrl: unsubscribe.page,
      listNames: dueChannels.map(channel => channel.listName).filter((name): name is string => Boolean(name)),
    });

    const dueIds = dueItems.map(item => item.queueId);
    const sent = await sendEmail({
      to: first.userEmail,
      toName: first.userName,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      template: 'digest',
      userId,
      unsubscribeUrl: unsubscribe.oneClick,
      metadata: { jobs: digestJobs.length, lists: dueChannels.map(channel => channel.listId).filter(Boolean) },
    });

    if (sent.success) {
      await db.transaction(async tx => {
        for (let index = 0; index < dueIds.length; index += 1000) {
          await tx
            .update(notificationQueue)
            .set({ sentAt: new Date(), lastError: null, digestDate: now.toISOString().slice(0, 10) })
            .where(inArray(notificationQueue.id, dueIds.slice(index, index + 1000)));
        }
        await tx.update(users).set({ lastDigestSentAt: new Date() }).where(eq(users.id, userId));
      });
      result.emailsSent++;
      result.itemsDelivered += dueIds.length;
      sentToday++;
    } else {
      await db
        .update(notificationQueue)
        .set({ attempts: sql`${notificationQueue.attempts} + 1`, lastAttemptAt: new Date(), lastError: (sent.error ?? 'Delivery failed').slice(0, 300) })
        .where(inArray(notificationQueue.id, dueIds));
      result.errors.push(`${first.userEmail}: ${sent.error ?? 'Delivery failed'}`);
    }
  }

  return result;
}

/** Housekeeping: settle alerts nobody could be sent for two weeks, and drop old settled rows. */
export async function pruneNotificationQueue(): Promise<{ expired: number; deleted: number }> {
  const expiredCutoff = new Date(Date.now() - 14 * 86_400_000);
  const deleteCutoff = new Date(Date.now() - 90 * 86_400_000);

  const expired = await db
    .update(notificationQueue)
    .set({ sentAt: new Date(), lastError: 'Expired: not deliverable within 14 days' })
    .where(and(isNull(notificationQueue.sentAt), lt(notificationQueue.createdAt, expiredCutoff)))
    .returning({ id: notificationQueue.id });

  const deleted = await db
    .delete(notificationQueue)
    .where(and(sql`${notificationQueue.sentAt} IS NOT NULL`, lt(notificationQueue.sentAt, deleteCutoff)))
    .returning({ id: notificationQueue.id });

  return { expired: expired.length, deleted: deleted.length };
}
