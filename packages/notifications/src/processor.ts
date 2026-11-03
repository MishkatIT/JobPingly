import { db } from '@/lib/db/client';
import { notificationQueue, users, jobs, careerPages, listSubscriptions, lists } from '@/lib/db/schema';
import { eq, isNull, inArray, asc, and } from 'drizzle-orm';
import { sendEmailDigest } from './sender';
import { getTodaySentEmailCount } from '@/lib/email/brevo';
import { loadNotificationPolicy, shouldDeferForCohort, type NotificationPolicy } from './policy';
import { normalizeFrequencyValue, resolveEffectiveFrequency } from '@/lib/utils/frequency';
import { evaluateDigestSchedule, describeDigestSchedule } from '@/lib/utils/digestSchedule';

export interface ProcessNotificationResult {
  processedCount: number;
  emailsSent: number;
  errors: string[];
}

interface PendingItem {
  queueId: string;
  userId: string;
  jobId: string;
  listId: string | null;
  eventType: string;
  createdAt: Date;
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
  listDigestFrequency: string | null;
  listName: string | null;
  jobTitle: string;
  jobUrl: string | null;
  companyName: string | null;
}

/** One delivery channel for a user: the list that matched, plus its frequency. */
interface DigestChannel {
  listId: string | null;
  listName: string | null;
  frequency: string;
  items: PendingItem[];
  oldestPendingAt: Date;
}

/**
 * Resolves the delivery time a user's digest should land on.
 * The admin can pin a global hour; otherwise each user's own setting applies.
 */
function resolveDeliveryClock(item: PendingItem, policy: NotificationPolicy) {
  if (policy.globalPolicyEnforced && !item.frequencyEnforcementExempt && policy.enforcedDigestHour !== null) {
    return {
      hour: policy.enforcedDigestHour,
      minute: policy.enforcedDigestMinute ?? 0,
      timezone: item.timezone,
    };
  }
  return { hour: item.digestHour, minute: item.digestMinute, timezone: item.timezone };
}

/**
 * Groups a user's pending items into delivery channels and resolves each
 * channel's effective frequency.
 *
 * Precedence is admin-enforced policy > per-list override > account preference.
 * A list subscription set to 'inherit' (the default) does not override anything.
 */
function buildChannels(items: PendingItem[], policy: NotificationPolicy): DigestChannel[] {
  const first = items[0];
  const isEnforced = policy.globalPolicyEnforced && !first.frequencyEnforcementExempt;

  const byChannel = new Map<string, DigestChannel>();
  for (const item of items) {
    const key = item.listId || '__account__';
    const existing = byChannel.get(key);
    if (existing) {
      existing.items.push(item);
      if (item.createdAt < existing.oldestPendingAt) existing.oldestPendingAt = item.createdAt;
      continue;
    }
    byChannel.set(key, {
      listId: item.listId,
      listName: item.listName,
      frequency: resolveEffectiveFrequency({
        isEnforced,
        enforcedFrequency: policy.enforcedFrequencyValue,
        listFrequency: item.listDigestFrequency,
        accountFrequency: item.notificationPreference,
      }),
      items: [item],
      oldestPendingAt: item.createdAt,
    });
  }

  return Array.from(byChannel.values());
}

/**
 * Drains and processes unsent items in notification_queue.
 *
 * Delivery honours, in order: the user's email toggle and block status, the
 * admin-enforced frequency policy, the per-list digest frequency, the user's own
 * digest frequency plus wall-clock delivery time and timezone, the Brevo daily
 * quota, and finally staggered cohort rotation (only under quota pressure).
 */
export async function processNotificationQueue(): Promise<ProcessNotificationResult> {
  console.log('[Notification Processor] Checking notification_queue for unsent job alerts...');

  const errors: string[] = [];

  try {
    const now = new Date();
    const policy = await loadNotificationPolicy({ now });

    // 1. Fetch today's sent email status
    const todayStats = await getTodaySentEmailCount();
    let sentToday = todayStats.sentToday;

    // 2. Fetch unsent notifications with user, job, career page and list details.
    //    The list subscription join is what makes per-list digest frequency real:
    //    the column existed and was editable in the UI but was never read here.
    const pendingItems = (await db.select({
      queueId: notificationQueue.id,
      userId: notificationQueue.userId,
      jobId: notificationQueue.jobId,
      listId: notificationQueue.listId,
      eventType: notificationQueue.eventType,
      createdAt: notificationQueue.createdAt,
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
      listDigestFrequency: listSubscriptions.digestFrequency,
      listName: lists.name,
      jobTitle: jobs.title,
      jobUrl: jobs.url,
      companyName: careerPages.companyName,
    })
    .from(notificationQueue)
    .innerJoin(users, eq(notificationQueue.userId, users.id))
    .innerJoin(jobs, eq(notificationQueue.jobId, jobs.id))
    .innerJoin(careerPages, eq(jobs.careerPageId, careerPages.id))
    .leftJoin(lists, eq(notificationQueue.listId, lists.id))
    .leftJoin(
      listSubscriptions,
      and(
        eq(listSubscriptions.listId, notificationQueue.listId),
        eq(listSubscriptions.userId, notificationQueue.userId),
      ),
    )
    .where(isNull(notificationQueue.sentAt))
    .orderBy(asc(notificationQueue.createdAt))) as unknown as PendingItem[];

    if (pendingItems.length === 0) {
      console.log('[Notification Processor] No pending notifications to process.');
      return { processedCount: 0, emailsSent: 0, errors: [] };
    }

    console.log(
      `[Notification Processor] Found ${pendingItems.length} pending item(s). ` +
      `Quota ${sentToday}/${policy.effectiveDigestLimit} today. ` +
      `Cohort grouping: ${policy.cohortGroupingEnabled ? `ON (cycle ${policy.cycleDays}d, today group ${policy.todayCohort}, pressure at ${policy.cohortPressureThreshold})` : 'OFF'}. ` +
      `Frequency policy enforced: ${policy.globalPolicyEnforced ? `YES (${policy.enforcedFrequencyValue})` : 'NO'}.`,
    );

    // 3. Group pending items by user, preserving FIFO arrival order
    const userMap = new Map<string, PendingItem[]>();
    for (const item of pendingItems) {
      const list = userMap.get(item.userId) || [];
      list.push(item);
      userMap.set(item.userId, list);
    }

    let totalEmailsSent = 0;
    let totalProcessed = 0;

    for (const [userId, items] of userMap.entries()) {
      const firstItem = items[0];

      // Blocked accounts and users who turned email off: resolve the rows so the
      // queue does not grow without bound.
      if (firstItem.isBlocked || !firstItem.emailNotificationsEnabled) {
        const allIds = items.map(i => i.queueId);
        console.log(`[Notification Processor] ${firstItem.userEmail}: notifications disabled or account blocked. Resolving ${allIds.length} item(s).`);
        await db.update(notificationQueue)
          .set({ sentAt: new Date() })
          .where(inArray(notificationQueue.id, allIds));
        totalProcessed += allIds.length;
        continue;
      }

      const isVipExempt = firstItem.quotaExempt;
      const channels = buildChannels(items, policy);
      const clock = resolveDeliveryClock(firstItem, policy);

      // 4. Schedule gate: which channels have a delivery slot pending right now?
      const dueChannels: DigestChannel[] = [];
      let anyRealtime = false;

      for (const channel of channels) {
        const verdict = evaluateDigestSchedule({
          frequency: channel.frequency,
          now,
          lastSentAt: firstItem.lastDigestSentAt,
          timezone: clock.timezone,
          hour: clock.hour,
          minute: clock.minute,
          oldestPendingAt: channel.oldestPendingAt,
        });

        if (verdict.due) {
          dueChannels.push(channel);
          if (verdict.kind === 'realtime') anyRealtime = true;
        } else {
          console.log(
            `[Notification Processor] ${firstItem.userEmail} / ${channel.listName || 'account default'}: ${verdict.reason} ` +
            `(${describeDigestSchedule(channel.frequency, clock.hour, clock.minute, clock.timezone)})`,
          );
        }
      }

      if (dueChannels.length === 0) continue;

      // 5. Quota guard. Quota-exempt recipients bypass the Brevo daily ceiling.
      if (!isVipExempt && sentToday >= policy.effectiveDigestLimit) {
        console.log(`[Notification Processor] Daily email allowance reached (${sentToday}/${policy.effectiveDigestLimit}). Deferring ${firstItem.userEmail} to the next cycle.`);
        continue;
      }

      // 6. Staggered cohort rotation, applied only under quota pressure so it
      //    cannot silently override the frequency the user chose.
      const cohort = shouldDeferForCohort({
        policy,
        dispatchGroup: firstItem.dispatchGroup,
        sentToday,
        isRealtime: anyRealtime,
        isQuotaExempt: Boolean(isVipExempt),
      });
      if (cohort.defer) {
        console.log(`[Notification Processor] ${firstItem.userEmail}: ${cohort.reason} Deferring.`);
        continue;
      }

      // 7. Collapse duplicate queue rows for the same job across due channels.
      const dueItems = dueChannels.flatMap(c => c.items);
      const latestJobMap = new Map<string, PendingItem>();
      const staleQueueIds: string[] = [];
      for (const item of dueItems) {
        if (!latestJobMap.has(item.jobId)) {
          latestJobMap.set(item.jobId, item);
        } else {
          staleQueueIds.push(item.queueId);
        }
      }

      if (staleQueueIds.length > 0) {
        console.log(`[Notification Processor] Pruned ${staleQueueIds.length} duplicate queue item(s) for ${firstItem.userEmail}.`);
        await db.update(notificationQueue)
          .set({ sentAt: new Date() })
          .where(inArray(notificationQueue.id, staleQueueIds));
      }

      const freshItems = Array.from(latestJobMap.values());
      const jobListings = freshItems.map(item => ({
        companyName: item.companyName || 'Unknown Company',
        title: item.jobTitle,
        url: item.jobUrl || undefined,
      }));
      // Only the due channels are settled; items on channels whose slot has not
      // arrived stay pending for their own schedule.
      const dueQueueIds = dueItems.map(i => i.queueId);

      try {
        const result = await sendEmailDigest(
          firstItem.userEmail,
          firstItem.userName || firstItem.userEmail.split('@')[0],
          jobListings,
        );

        if (result.success || result.unapproved || result.disabled || result.mocked) {
          await db.update(notificationQueue)
            .set({ sentAt: new Date() })
            .where(inArray(notificationQueue.id, dueQueueIds));

          totalProcessed += dueQueueIds.length;

          if (result.success || result.mocked) {
            // Stamp the real delivery marker. The schedule window reads this and
            // never notification_queue.sent_at, which is also set when a row is
            // merely resolved (suppressed, pruned or pending approval).
            await db.update(users)
              .set({ lastDigestSentAt: new Date() })
              .where(eq(users.id, userId));

            totalEmailsSent++;
            sentToday++;
            console.log(
              `[Notification Processor] Sent digest with ${jobListings.length} job(s) to ${firstItem.userEmail} ` +
              `across ${dueChannels.length} channel(s): ${dueChannels.map(c => `${c.listName || 'account'}=${normalizeFrequencyValue(c.frequency)}`).join(', ')}.`,
            );
          }
        } else if (result.error) {
          console.warn(`[Notification Processor] Could not send email to ${firstItem.userEmail}: ${result.error}`);
          errors.push(`${firstItem.userEmail}: ${result.error}`);
        }
      } catch (err: any) {
        const errMsg = err.message || 'Unknown notification error';
        console.error(`[Notification Processor] Exception sending email to ${firstItem.userEmail}:`, errMsg);
        errors.push(`${firstItem.userEmail}: ${errMsg}`);
      }
    }

    return { processedCount: totalProcessed, emailsSent: totalEmailsSent, errors };
  } catch (err: any) {
    console.error('[Notification Processor] High-level error processing notification queue:', err.message);
    return { processedCount: 0, emailsSent: 0, errors: [err.message] };
  }
}
