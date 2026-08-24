import { db } from '@/lib/db/client';
import { notificationQueue, users, jobs, careerPages } from '@/lib/db/schema';
import { eq, isNull, isNotNull, inArray, asc, desc, and } from 'drizzle-orm';
import { sendEmailDigest } from './sender';
import { getTodaySentEmailCount } from '@/lib/email/brevo';
import { isFeatureEnabled } from '@/lib/flags/check';
import { getFrequencyIntervalMs } from '@/lib/utils/frequency';

export interface ProcessNotificationResult {
  processedCount: number;
  emailsSent: number;
  errors: string[];
}

/**
 * Drains and processes unsent items in notification_queue.
 * Enforces Brevo daily quota checks, transactional safety buffer, user exemptions,
 * user digest frequency settings, admin frequency policies, and staggered cohort rotations.
 */
export async function processNotificationQueue(): Promise<ProcessNotificationResult> {
  console.log('[Notification Processor] Checking notification_queue for unsent job alerts...');

  const errors: string[] = [];

  try {
    // Read persisted Brevo Quota, Safety Reserve & Cohort Cycle Configuration from PostgreSQL feature_flags
    const envLimit = Number(process.env.BREVO_DAILY_LIMIT) || 300;
    const envBuffer = Number(process.env.BREVO_SAFETY_BUFFER) || 50;

    const brevoLimit = await isFeatureEnabled('email.brevo_daily_limit', envLimit);
    const safetyBuffer = await isFeatureEnabled('email.transactional_safety_buffer', envBuffer);
    const cycleDays = await isFeatureEnabled('email.cohort_cycle_days', 3);
    const effectiveDigestLimit = Math.max(1, brevoLimit - safetyBuffer);

    // Check if Admin Panel strict global frequency policy is enabled
    const isEnforcedGlobal1 = await isFeatureEnabled('notifications.enforce_frequency', false);
    const isEnforcedGlobal2 = await isFeatureEnabled('email.enforce_frequency_policy', false);
    const globalPolicyEnforced = Boolean(isEnforcedGlobal1 || isEnforcedGlobal2);
    const enforcedFrequencyValue = await isFeatureEnabled('notifications.enforced_frequency_value', 'daily');

    // Check if Cohort Grouping feature toggle is ON (default: true)
    const cohortGroupingEnabled = await isFeatureEnabled('email.cohort_grouping_enabled', true);

    // Compute today's active cohort group dynamically based on cycleDays ($K$ Days rotation)
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24);
    const todayCohort = (dayOfYear % Math.max(1, cycleDays)) + 1;

    // 1. Fetch today's sent email status
    let todayStats = await getTodaySentEmailCount();

    // 2. Fetch unsent notifications with user, job, and career page details
    const pendingItems = await db.select({
      queueId: notificationQueue.id,
      userId: notificationQueue.userId,
      jobId: notificationQueue.jobId,
      eventType: notificationQueue.eventType,
      userEmail: users.email,
      userName: users.name,
      emailNotificationsEnabled: users.emailNotificationsEnabled,
      isBlocked: users.isBlocked,
      notificationPreference: users.notificationPreference,
      frequencyEnforcementExempt: users.frequencyEnforcementExempt,
      quotaExempt: users.quotaExempt,
      dispatchGroup: users.dispatchGroup,
      jobTitle: jobs.title,
      jobUrl: jobs.url,
      companyName: careerPages.companyName,
    })
    .from(notificationQueue)
    .innerJoin(users, eq(notificationQueue.userId, users.id))
    .innerJoin(jobs, eq(notificationQueue.jobId, jobs.id))
    .innerJoin(careerPages, eq(jobs.careerPageId, careerPages.id))
    .where(isNull(notificationQueue.sentAt))
    .orderBy(asc(notificationQueue.createdAt));

    if (pendingItems.length === 0) {
      console.log('[Notification Processor] No pending notifications to process.');
      return { processedCount: 0, emailsSent: 0, errors: [] };
    }

    console.log(`[Notification Processor] Found ${pendingItems.length} pending notification item(s). Processing FIFO with quota limit ${effectiveDigestLimit}/day (Today sent: ${todayStats.sentToday}, Cohort Grouping: ${cohortGroupingEnabled ? 'ON' : 'OFF'}, Frequency Policy Enforced: ${globalPolicyEnforced ? 'YES' : 'NO'})...`);

    // 3. Group pending items by user ID preserving strict FIFO arrival order
    const userMap = new Map<string, typeof pendingItems>();
    for (const item of pendingItems) {
      const list = userMap.get(item.userId) || [];
      list.push(item);
      userMap.set(item.userId, list);
    }

    let totalEmailsSent = 0;
    let totalProcessed = 0;

    // 4. Process notifications per user in strict FIFO order
    for (const [userId, items] of userMap.entries()) {
      const queueIds = items.map(i => i.queueId);
      const firstItem = items[0];

      // If user account is blocked or email notifications are toggled off by user
      if (firstItem.isBlocked || !firstItem.emailNotificationsEnabled) {
        console.log(`[Notification Processor] User ${firstItem.userEmail} has notifications disabled or is blocked. Marking ${queueIds.length} item(s) as resolved.`);
        await db.update(notificationQueue)
          .set({ sentAt: new Date() })
          .where(inArray(notificationQueue.id, queueIds));
        totalProcessed += queueIds.length;
        continue;
      }

      const isVipExempt = firstItem.quotaExempt;

      // 1. Effective Digest Frequency & Frequency Elapsed Window Check:
      // VIP users (quotaExempt = true) bypass timing window delays.
      const isEnforced = globalPolicyEnforced && !firstItem.frequencyEnforcementExempt;
      const effectiveFrequency = isEnforced ? String(enforcedFrequencyValue) : (firstItem.notificationPreference || 'daily');
      const frequencyIntervalMs = getFrequencyIntervalMs(effectiveFrequency);

      if (!isVipExempt && frequencyIntervalMs > 0) {
        const [lastSentRecord] = await db.select({ sentAt: notificationQueue.sentAt })
          .from(notificationQueue)
          .where(and(
            eq(notificationQueue.userId, userId),
            isNotNull(notificationQueue.sentAt)
          ))
          .orderBy(desc(notificationQueue.sentAt))
          .limit(1);

        if (lastSentRecord?.sentAt) {
          const lastSentMs = new Date(lastSentRecord.sentAt).getTime();
          const elapsedMs = Date.now() - lastSentMs;
          if (elapsedMs < frequencyIntervalMs) {
            const elapsedHours = (elapsedMs / (1000 * 60 * 60)).toFixed(1);
            const requiredHours = (frequencyIntervalMs / (1000 * 60 * 60)).toFixed(1);
            console.log(`[Notification Processor] Digest frequency window not elapsed for ${firstItem.userEmail} (Effective Frequency: '${effectiveFrequency}', Elapsed: ${elapsedHours}h < ${requiredHours}h required). Deferring delivery.`);
            continue;
          }
        }
      }

      // 2. Quota Guard Check:
      // VIP users (quotaExempt = true) bypass the 300 Brevo daily limit completely!
      // Regular non-VIP users check today's sent count against Brevo daily quota limit.
      if (!isVipExempt && todayStats.sentToday >= effectiveDigestLimit) {
        console.log(`[Notification Processor] Brevo daily quota limit reached (${todayStats.sentToday}/${effectiveDigestLimit}). Deferring delivery for non-VIP user ${firstItem.userEmail} to next cycle.`);
        continue;
      }

      // 3. Cohort Grouping Rule (When turned ON):
      // Applies universally to ALL non-VIP emails regardless of user preference or admin settings.
      // Designed specifically to budget daily quota and prevent crossing Brevo 300 limit.
      if (cohortGroupingEnabled && !isVipExempt) {
        if (firstItem.dispatchGroup !== todayCohort) {
          console.log(`[Notification Processor] Cohort Grouping Active: User ${firstItem.userEmail} is in Group ${firstItem.dispatchGroup} (Today is Group ${todayCohort}). Deferring for scheduled cohort day.`);
          continue;
        }
      }


      // Replace & prune older duplicate pending queue items for the same job for this user
      const latestJobMap = new Map<string, typeof items[0]>();
      const staleQueueIds: string[] = [];

      for (const item of items) {
        if (!latestJobMap.has(item.jobId)) {
          latestJobMap.set(item.jobId, item);
        } else {
          // Found an older pending queue item for the same job - mark as replaced/pruned
          staleQueueIds.push(item.queueId);
        }
      }

      if (staleQueueIds.length > 0) {
        console.log(`[Notification Processor] Replaced/pruned ${staleQueueIds.length} older duplicate pending queue item(s) for user ${firstItem.userEmail}.`);
        await db.update(notificationQueue)
          .set({ sentAt: new Date() })
          .where(inArray(notificationQueue.id, staleQueueIds));
      }

      // Deduplicate job listings by jobId for this user
      const freshItems = Array.from(latestJobMap.values());
      const jobListings = freshItems.map(item => ({
        companyName: item.companyName || 'Unknown Company',
        title: item.jobTitle,
        url: item.jobUrl || undefined,
      }));

      try {
        const result = await sendEmailDigest(
          firstItem.userEmail,
          firstItem.userName || firstItem.userEmail.split('@')[0],
          jobListings
        );

        // Mark queue items sent if successfully dispatched, or if skipped due to admin approval / feature flag disabled
        if (result.success || result.unapproved || result.disabled || result.mocked) {
          await db.update(notificationQueue)
            .set({ sentAt: new Date() })
            .where(inArray(notificationQueue.id, queueIds));

          totalProcessed += queueIds.length;

          if (result.success || result.mocked) {
            totalEmailsSent++;
            todayStats.sentToday++; // increment in-memory today sent count for loop
            console.log(`[Notification Processor] Sent digest email with ${jobListings.length} job(s) to ${firstItem.userEmail}.`);
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
