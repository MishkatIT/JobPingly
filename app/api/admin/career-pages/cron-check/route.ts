import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { careerPages } from '@/lib/db/schema';
import { eq, and, lte, or, isNull, ne } from 'drizzle-orm';
import { runScraperPipeline, autoRemoveExpiredJobsFromDb } from '@/packages/scraper/src/pipeline';
import { isFeatureEnabled } from '@/lib/flags/check';

async function handleCronCheck() {
  const now = new Date();

  // Check if scraper feature flag is enabled
  const scraperEnabled = await isFeatureEnabled('scraper.enabled', true);
  if (!scraperEnabled) {
    return NextResponse.json({
      duePagesFound: 0,
      checkedCount: 0,
      totalJobsFound: 0,
      message: 'Scraper execution is disabled via feature flag.',
      timestamp: now.toISOString(),
    });
  }

  // Daily automatic cleanup of expired deadline jobs
  await autoRemoveExpiredJobsFromDb().catch(() => null);

  // Check if global master timer is enabled
  const useGlobalTimer = await isFeatureEnabled('scraper.use_global_timer', true);
  const globalIntervalFlag = await isFeatureEnabled('scraper.global_check_interval_minutes', 180);
  const globalIntervalMinutes = typeof globalIntervalFlag === 'number' ? globalIntervalFlag : Number(globalIntervalFlag) || 180;

  // Find all career pages due for check (excluding manually paused pages)
  // Due if:
  // 1) nextCheckAt IS NULL
  // 2) nextCheckAt <= now
  // 3) lastScrapedAt IS NULL
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
    try {
      const result = await runScraperPipeline(page.id);
      checkedCount++;
      totalJobsFound += result.jobsFound || 0;
      totalJobsAdded += result.jobsAdded || 0;

      // Update nextCheckAt according to global or page-specific checkIntervalMinutes
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
      // On error, apply backoff checkInterval (6 hours for degraded, 12 hours for broken)
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

  return NextResponse.json({
    duePagesFound: duePages.length,
    checkedCount,
    totalJobsFound,
    totalJobsAdded,
    useGlobalTimer,
    effectiveIntervalMinutes: useGlobalTimer ? globalIntervalMinutes : 'per-site',
    summary: processSummary,
    timestamp: now.toISOString(),
  });
}

// GET endpoint (for standard cron services like Vercel Cron, cron-job.org, browser background runners)
export async function GET(req: NextRequest) {
  return handleCronCheck();
}

// POST endpoint (for manual trigger or POST-based webhooks)
export async function POST(req: NextRequest) {
  return handleCronCheck();
}
