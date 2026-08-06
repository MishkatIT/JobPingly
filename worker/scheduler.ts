import { db } from '@/lib/db/client';
import { careerPages } from '@/lib/db/schema';
import { lte, eq, and } from 'drizzle-orm';
import { runScraperPipeline, autoRemoveExpiredJobsFromDb } from '@/packages/scraper/src/pipeline';
import { isFeatureEnabled } from '@/lib/flags/check';

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS) || 10000;
let isRunning = false;
let lastDailyCleanupAt = 0;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function processDuePages() {
  if (isRunning) return;
  isRunning = true;

  try {
    // Check feature flag
    const scraperEnabled = await isFeatureEnabled('scraper.enabled', true);
    if (!scraperEnabled) {
      console.log('[JobPingly Worker] Scraper execution is disabled via feature flag.');
      return;
    }

    // Daily automatic cleanup of expired deadline jobs
    const nowMs = Date.now();
    if (nowMs - lastDailyCleanupAt > ONE_DAY_MS) {
      console.log('[JobPingly Worker] Running daily automatic cleanup for expired jobs...');
      await autoRemoveExpiredJobsFromDb();
      lastDailyCleanupAt = nowMs;
    }

    const now = new Date();
    const duePages = await db.select()
      .from(careerPages)
      .where(and(
        eq(careerPages.status, 'active'),
        lte(careerPages.nextCheckAt, now)
      ))
      .limit(10);

    if (duePages.length > 0) {
      console.log(`[JobPingly Worker] Found ${duePages.length} due career page(s) to check.`);

      for (const page of duePages) {
        console.log(`[JobPingly Worker] Scraping ${page.url} (${page.companyName || 'Unknown'})...`);
        try {
          const res = await runScraperPipeline(page.id);
          console.log(`[JobPingly Worker] Successfully checked ${page.url}: ${res.jobsFound} jobs found, ${res.jobsAdded} added.`);
        } catch (err: any) {
          console.error(`[JobPingly Worker] Error checking ${page.url}:`, err.message);
        }
      }
    }
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
