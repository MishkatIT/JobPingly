import { db } from '@/lib/db/client';
import { notificationQueue, users, jobs, careerPages } from '@/lib/db/schema';
import { eq, isNull, inArray } from 'drizzle-orm';
import { sendEmailDigest } from './sender';

export interface ProcessNotificationResult {
  processedCount: number;
  emailsSent: number;
  errors: string[];
}

/**
 * Drains and processes unsent items in notification_queue.
 * Groups pending alerts by user, checks user preferences & admin email approval,
 * dispatches digest emails via sendEmailDigest(), and marks items as sent.
 */
export async function processNotificationQueue(): Promise<ProcessNotificationResult> {
  console.log('[Notification Processor] Checking notification_queue for unsent job alerts...');

  const errors: string[] = [];

  try {
    // 1. Fetch unsent notifications with user, job, and career page details
    const pendingItems = await db.select({
      queueId: notificationQueue.id,
      userId: notificationQueue.userId,
      jobId: notificationQueue.jobId,
      eventType: notificationQueue.eventType,
      userEmail: users.email,
      userName: users.name,
      emailNotificationsEnabled: users.emailNotificationsEnabled,
      isBlocked: users.isBlocked,
      jobTitle: jobs.title,
      jobUrl: jobs.url,
      companyName: careerPages.companyName,
    })
    .from(notificationQueue)
    .innerJoin(users, eq(notificationQueue.userId, users.id))
    .innerJoin(jobs, eq(notificationQueue.jobId, jobs.id))
    .innerJoin(careerPages, eq(jobs.careerPageId, careerPages.id))
    .where(isNull(notificationQueue.sentAt));

    if (pendingItems.length === 0) {
      console.log('[Notification Processor] No pending notifications to process.');
      return { processedCount: 0, emailsSent: 0, errors: [] };
    }

    console.log(`[Notification Processor] Found ${pendingItems.length} pending notification item(s). Processing...`);

    // 2. Group pending items by user ID
    const userMap = new Map<string, typeof pendingItems>();
    for (const item of pendingItems) {
      const list = userMap.get(item.userId) || [];
      list.push(item);
      userMap.set(item.userId, list);
    }

    let totalEmailsSent = 0;
    let totalProcessed = 0;

    // 3. Process notifications per user
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

      // Deduplicate job listings by jobId for this user
      const jobMap = new Map<string, { companyName: string; title: string; url?: string }>();
      for (const item of items) {
        if (!jobMap.has(item.jobId)) {
          jobMap.set(item.jobId, {
            companyName: item.companyName || 'Unknown Company',
            title: item.jobTitle,
            url: item.jobUrl || undefined,
          });
        }
      }
      const jobListings = Array.from(jobMap.values());

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
