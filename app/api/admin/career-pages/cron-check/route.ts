import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { careerPages, listCareerPages, lists } from '@/lib/db/schema';
import { eq, and, lte, or, isNull, ne } from 'drizzle-orm';
import { runScraperPipeline, autoRemoveExpiredJobsFromDb } from '@/packages/scraper/src/pipeline';
import { processNotificationQueue } from '@/packages/notifications/src/processor';
import { isFeatureEnabled } from '@/lib/flags/check';

let isCronCheckRunning = false;

async function executeCronCheckTask() {
  if (isCronCheckRunning) {
    console.log('[CronCheck] Background check already in progress. Skipping.');
    return { status: 'skipped', reason: 'already_running' };
  }
  isCronCheckRunning = true;
  try {
    const now = new Date();

    const scraperEnabled = await isFeatureEnabled('scraper.enabled', true);
    if (!scraperEnabled) {
      return { status: 'disabled', message: 'Scraper execution is disabled via feature flag.' };
    }

    await autoRemoveExpiredJobsFromDb().catch(() => null);

    const useGlobalTimer = await isFeatureEnabled('scraper.use_global_timer', true);
    const globalIntervalFlag = await isFeatureEnabled('scraper.global_check_interval_minutes', 180);
    const globalIntervalMinutes = typeof globalIntervalFlag === 'number' ? globalIntervalFlag : Number(globalIntervalFlag) || 180;

    const duePages = await db.select().from(careerPages).where(
      and(
        ne(careerPages.status, 'paused'),
        or(
          isNull(careerPages.nextCheckAt),
          lte(careerPages.nextCheckAt, now),
          isNull(careerPages.lastScrapedAt)
        )
      )
    );

    let checkedCount = 0;
    let totalJobsFound = 0;
    let totalJobsAdded = 0;
    const processSummary: any[] = [];

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
        console.log(`[CronCheck] Skipping ${page.url}: Not attached to any active watch list.`);
        continue;
      }

      try {
        const result = await runScraperPipeline(page.id);
        checkedCount++;
        totalJobsFound += result.jobsFound || 0;
        totalJobsAdded += result.jobsAdded || 0;

        const effectiveMinutes = useGlobalTimer ? globalIntervalMinutes : (page.checkIntervalMinutes || 180);
        const nextCheckAt = new Date(Date.now() + effectiveMinutes * 60 * 1000);
        await db.update(careerPages).set({ nextCheckAt, lastScrapedAt: new Date(), lastSuccessAt: new Date() }).where(eq(careerPages.id, page.id));

        processSummary.push({
          id: page.id,
          url: page.url,
          companyName: page.companyName,
          success: true,
          jobsFound: result.jobsFound,
          jobsAdded: result.jobsAdded,
          nextCheckAt: nextCheckAt.toISOString(),
        });
      } catch (err: any) {
        console.error(`Automated cron check failed for ${page.url}:`, err);
        const backoffMinutes = page.consecutiveFailures >= 3 ? 360 : (page.checkIntervalMinutes || 180);
        const nextCheckAt = new Date(Date.now() + backoffMinutes * 60 * 1000);
        await db.update(careerPages).set({ nextCheckAt, lastScrapedAt: new Date() }).where(eq(careerPages.id, page.id)).catch(() => null);

        processSummary.push({
          id: page.id,
          url: page.url,
          companyName: page.companyName,
          success: false,
          error: err.message || 'Scrape failed',
          nextCheckAt: nextCheckAt.toISOString(),
        });
      }
    }

    // Process pending notification queue
    const notificationResult = await processNotificationQueue().catch(err => ({
      processedCount: 0,
      emailsSent: 0,
      errors: [err.message || 'Failed to process notifications'],
    }));

    return {
      duePagesFound: duePages.length,
      checkedCount,
      totalJobsFound,
      totalJobsAdded,
      notificationsProcessed: notificationResult.processedCount,
      emailsSent: notificationResult.emailsSent,
      useGlobalTimer,
      effectiveIntervalMinutes: useGlobalTimer ? globalIntervalMinutes : 'per-site',
      summary: processSummary,
      timestamp: now.toISOString(),
    };
  } finally {
    isCronCheckRunning = false;
  }
}

// GET endpoint
export async function GET(req: NextRequest) {
  const sync = req.nextUrl.searchParams.get('sync') === 'true';
  if (sync) {
    const result = await executeCronCheckTask();
    return NextResponse.json(result);
  }

  // Asynchronous execution
  setImmediate(() => {
    executeCronCheckTask().catch(err => console.error('[CronCheck] Background error:', err));
  });

  return NextResponse.json({
    status: 'queued',
    message: 'Cron check background execution initiated.',
    timestamp: new Date().toISOString(),
  });
}

// POST endpoint (Triggered asynchronously by client or webhooks)
export async function POST(req: NextRequest) {
  const sync = req.nextUrl.searchParams.get('sync') === 'true';
  if (sync) {
    const result = await executeCronCheckTask();
    return NextResponse.json(result);
  }

  // Non-blocking background trigger
  setImmediate(() => {
    executeCronCheckTask().catch(err => console.error('[CronCheck] Background error:', err));
  });

  return NextResponse.json({
    status: 'queued',
    message: 'Cron check background execution initiated.',
    timestamp: new Date().toISOString(),
  });
}
