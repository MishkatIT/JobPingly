import { db } from '@/lib/db/client';
import { careerPages, listCareerPages } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { cleanCareerPageContent } from '@/packages/scraper/src/cleaner';
import { generateContentHash } from '@/packages/scraper/src/hash';
import { extractJobsWithAI, ScrapedPageInput } from '@/packages/scraper/src/aiExtractor';
import { runScraperPipeline, autoRemoveExpiredJobsFromDb } from '@/packages/scraper/src/pipeline';

async function main() {
  console.log('--- JobPingly Scheduled AI Batch Job Check ---');

  // Automatic cleanup of expired deadline jobs
  await autoRemoveExpiredJobsFromDb();

  // Get active career page IDs attached to watch lists
  const activeListPages = await db.selectDistinct({ id: listCareerPages.careerPageId })
    .from(listCareerPages)
    .where(eq(listCareerPages.isPaused, false));

  const activePageIds = activeListPages.map(p => p.id);
  const pages = activePageIds.length > 0
    ? await db.select().from(careerPages).where(and(eq(careerPages.status, 'active'), inArray(careerPages.id, activePageIds)))
    : [];

  let pagesChecked = 0;
  let pagesChanged = 0;
  let pagesSentToAI = 0;
  let totalJobsExtracted = 0;
  let totalNewJobsSaved = 0;

  const changedBatch: ScrapedPageInput[] = [];

  for (const page of pages) {
    pagesChecked++;
    try {
      const res = await fetch(page.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) JobPinglyBot/1.0',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) continue;

      const html = await res.text();
      const cleaned = cleanCareerPageContent(html);
      const newHash = generateContentHash(cleaned);

      if (!page.lastContentHash || page.lastContentHash !== newHash) {
        pagesChanged++;
        changedBatch.push({
          pageId: page.id,
          sourceUrl: page.url,
          content: cleaned,
          companyName: page.companyName || undefined,
        });
      }
    } catch (e: any) {
      console.warn(`Error checking ${page.url}: ${e.message}`);
    }
  }

  // Batch AI Processing (5-10 pages per batch)
  const BATCH_SIZE = 5;
  for (let i = 0; i < changedBatch.length; i += BATCH_SIZE) {
    const chunk = changedBatch.slice(i, i + BATCH_SIZE);
    pagesSentToAI += chunk.length;

    try {
      const aiResults = await extractJobsWithAI(chunk);
      for (const pageRes of aiResults) {
        totalJobsExtracted += pageRes.jobs.length;
      }
    } catch (err: any) {
      console.error('Batch AI extraction error:', err.message);
    }
  }

  // Process pipeline saves
  for (const item of changedBatch) {
    try {
      const res = await runScraperPipeline(item.pageId);
      totalNewJobsSaved += res.jobsAdded || 0;
    } catch (e: any) {
      console.error(`Pipeline save error for page ${item.pageId}:`, e.message);
    }
  }

  console.log('\n--- Batch Check Summary ---');
  console.log(`Pages checked:             ${pagesChecked}`);
  console.log(`Pages changed:             ${pagesChanged}`);
  console.log(`Pages sent to AI:          ${pagesSentToAI}`);
  console.log(`Jobs extracted:            ${totalJobsExtracted}`);
  console.log(`Genuinely new jobs saved:  ${totalNewJobsSaved}`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal batch check error:', err);
  process.exit(1);
});
