import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { careerPages, listCareerPages, scrapeLogs } from '@/lib/db/schema';
import { eq, and, lte, or, isNull, inArray } from 'drizzle-orm';
import { runScraperPipeline } from '@/packages/scraper/src/pipeline';
import { isFeatureEnabled } from '@/lib/flags/check';

export async function POST(req: NextRequest) {
  const now = new Date();

  // Check if global master timer is enabled
  const useGlobalTimer = await isFeatureEnabled('scraper.use_global_timer', true);
  const globalIntervalFlag = await isFeatureEnabled('scraper.global_check_interval_minutes', 180);
  const globalIntervalMinutes = typeof globalIntervalFlag === 'number' ? globalIntervalFlag : Number(globalIntervalFlag) || 180;

  // Get all active careerPageIds from listCareerPages
  const activeListPages = await db.selectDistinct({ id: listCareerPages.careerPageId })
    .from(listCareerPages)
    .where(eq(listCareerPages.isPaused, false));

  const activePageIds = activeListPages.map(p => p.id);
  if (activePageIds.length === 0) {
    return NextResponse.json({
      duePagesFound: 0,
      checkedCount: 0,
      totalJobsFound: 0,
      message: 'No career pages are currently attached to active watch lists.',
      timestamp: now.toISOString(),
    });
  }

  // Find all ACTIVE career pages due for check (and belonging to at least 1 active watch list)
  const duePages = await db.select().from(careerPages).where(
    and(
      eq(careerPages.status, 'active'),
      inArray(careerPages.id, activePageIds),
      or(
        isNull(careerPages.nextCheckAt),
        lte(careerPages.nextCheckAt, now)
      )
    )
  );

  let checkedCount = 0;
  let totalJobsFound = 0;

  for (const page of duePages) {
    try {
      const result = await runScraperPipeline(page.id);
      checkedCount++;
      totalJobsFound += result.jobsFound;

      // If global timer is enabled, override the nextCheckAt set by runScraperPipeline
      if (useGlobalTimer) {
        const nextCheckAt = new Date(Date.now() + globalIntervalMinutes * 60 * 1000);
        await db.update(careerPages).set({ nextCheckAt }).where(eq(careerPages.id, page.id));
      }
    } catch (err: any) {
      console.error(`Automated cron check failed for ${page.url}:`, err);
    }
  }

  return NextResponse.json({
    duePagesFound: duePages.length,
    checkedCount,
    totalJobsFound,
    useGlobalTimer,
    effectiveIntervalMinutes: useGlobalTimer ? globalIntervalMinutes : 'per-site',
    timestamp: now.toISOString(),
  });
}
