import { db } from '@/lib/db/client';
import { careerPages, listCareerPages, lists } from '@/lib/db/schema';
import { lte, ne, and, isNull, or, eq } from 'drizzle-orm';
import { runScraperPipeline, autoRemoveExpiredJobsFromDb } from '@/packages/scraper/src/pipeline';
import { processNotificationQueue } from '@/packages/notifications/src/processor';
import { isFeatureEnabled } from '@/lib/flags/check';

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS) || 60000;
let isRunning = false;
let lastDailyCleanupAt = 0;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function processDuePages() {
  if (isRunning) return;
  isRunning = true;

  try {
    // Check feature flag (cached in-memory)
    const scraperEnabled = await isFeatureEnabled('scraper.enabled', true);
    if (!scraperEnabled) {
      console.log('[JobPingly Worker] Scraper execution is disabled via feature flag.');
      return;
    }

    // Daily automatic cleanup of expired deadline jobs
    const nowMs = Date.now();
    if (nowMs - lastDailyCleanupAt > ONE_DAY_MS) {
      console.log('[JobPingly Worker] Running daily automatic cleanup for expired jobs...');
      await autoRemoveExpiredJobsFromDb().catch(() => null);
      lastDailyCleanupAt = nowMs;
    }

    const now = new Date();

    // Find all career pages due for check (excluding manually paused pages) - select specific columns only
    const duePages = await db.select({
      id: careerPages.id,
      url: careerPages.url,
      companyName: careerPages.companyName,
      status: careerPages.status,
      nextCheckAt: careerPages.nextCheckAt,
      lastScrapedAt: careerPages.lastScrapedAt,
    })
      .from(careerPages)
      .where(and(
        ne(careerPages.status, 'paused'),
        or(
          isNull(careerPages.nextCheckAt),
          lte(careerPages.nextCheckAt, now),
          isNull(careerPages.lastScrapedAt)
        )
      ))
      .limit(10);

    if (duePages.length > 0) {
      console.log(`[JobPingly Worker] Found ${duePages.length} due career page(s) to check.`);

      for (const page of duePages) {
        // Ensure page is attached to at least one active, non-soft-deleted, unpaused watch list
        const activeLinks = await db.select({ id: listCareerPages.id })
          .from(listCareerPages)
          .innerJoin(lists, eq(listCareerPages.listId, lists.id))
          .where(and(
            eq(listCareerPages.careerPageId, page.id),
            eq(listCareerPages.isPaused, false),
            isNull(lists.deletedAt)
          ))
          .limit(1);

        if (activeLinks.length === 0) {
          console.log(`[JobPingly Worker] Skipping ${page.url}: Not linked to any active watch list.`);
          continue;
        }

        console.log(`[JobPingly Worker] Scraping ${page.url} (${page.companyName || 'Unknown'})...`);
        try {
          const res = await runScraperPipeline(page.id);
          console.log(`[JobPingly Worker] Successfully checked ${page.url}: ${res.jobsFound} jobs found, ${res.jobsAdded} added.`);
        } catch (err: any) {
          console.error(`[JobPingly Worker] Error checking ${page.url}:`, err.message);
        }
      }
    }

    // Process unsent email notification queue items
    await processNotificationQueue().catch(err => {
      console.error('[JobPingly Worker] Notification queue processing error:', err.message);
    });
  } catch (err: any) {
    console.error('[JobPingly Worker] Scheduler error:', err.message);
  } finally {
    isRunning = false;
  }
}

if (require.main === module) {
  console.log('[JobPingly Worker] Background Scheduler Started. Polling every', POLL_INTERVAL_MS, 'ms...');
  setInterval(processDuePages, POLL_INTERVAL_MS);
}
