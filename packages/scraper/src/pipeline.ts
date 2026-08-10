import { GreenhouseAdapter } from './adapters/greenhouse';
import { LeverAdapter } from './adapters/lever';
import { WorkdayAdapter } from './adapters/workday';
import { ApiDetectorsAdapter } from './adapters/apiDetectors';
import { GenericAdapter } from './adapters/generic';
import { generateJobFingerprint } from './fingerprint';
import { diffJobs } from './differ';
import { ATSAdapter, NormalizedJob } from './types';
import { aiFallbackNormalize } from './aiFallback';
import { runPlaywrightFallback } from './playwrightFallback';
import { cleanCareerPageContent } from './cleaner';
import { generateContentHash } from './hash';
import { extractJobsWithAI } from './aiExtractor';
import { db } from '../../../lib/db/client';
import { careerPages, jobs, scrapeLogs, subscriptions, notificationQueue } from '../../../lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { matchKeywords } from '../../notifications/src/matcher';

const adapters: ATSAdapter[] = [GreenhouseAdapter, LeverAdapter, WorkdayAdapter, ApiDetectorsAdapter, GenericAdapter];

/**
 * Checks if a date string or timestamp represents an expired deadline.
 */

function isDeadlineExpired(deadlineStr?: string | null): boolean {
  if (!deadlineStr) return false;
  try {
    const deadlineDate = new Date(deadlineStr);
    if (isNaN(deadlineDate.getTime())) return false;
    // Set deadline boundary to end of that day (23:59:59)
    deadlineDate.setHours(23, 59, 59, 999);
    return deadlineDate.getTime() < Date.now();
  } catch {
    return false;
  }
}

/**
 * Automatically removes/deletes any database jobs whose deadline date has passed.
 */
export async function autoRemoveExpiredJobsFromDb() {
  try {
    const allJobs = await db.select().from(jobs);
    let removedCount = 0;

    for (const j of allJobs) {
      const raw = j.rawData as any;
      const deadline = raw?.deadline || raw?.deadlineDate;
      const expired = deadline ? isDeadlineExpired(deadline) : false;

      if (expired || j.status === 'closed') {
        await db.delete(jobs).where(eq(jobs.id, j.id));
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`[Auto Expired Cleanup] Automatically deleted ${removedCount} expired deadline job(s) from database.`);
    }
  } catch (err: any) {
    console.error('[Auto Expired Cleanup] Error purging expired jobs:', err.message);
  }
}

/**
 * Multi-Tiered Scraper Engine following Ollama Cloud & Change Detection Pipeline:
 * 1. Scrape Page
 * 2. Clean/Normalize Content
 * 3. Detect Whether Content Changed (SHA-256 Hash Compare)
 * 4. Send Changed Pages to Ollama (Batch AI Extraction)
 * 5. Validate AI Response (Zod)
 * 6. Compare With Existing Jobs (Deterministic Fingerprinting)
 * 7. Filter & Mark Expired Deadline Jobs Closed
 * 8. Save Only New Jobs & Update Content Hash
 * 9. Notify Relevant Users
 */
export async function runScraperPipeline(careerPageId: string, options?: { force?: boolean }) {
  const startTime = Date.now();

  // Run routine expired job cleanup
  await autoRemoveExpiredJobsFromDb();

  // 1. Fetch career page details
  const [page] = await db.select().from(careerPages).where(eq(careerPages.id, careerPageId));
  if (!page) {
    throw new Error(`Career page ${careerPageId} not found`);
  }

  try {
    let extractedJobs: NormalizedJob[] = [];
    let selectedAdapterName = 'generic';

    // ----------------------------------------------------
    // STAGE 1: Direct HTTP request & Content Cleaning
    // ----------------------------------------------------
    let html = '';
    let httpSuccess = false;

    try {
      const res = await fetch(page.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) JobPinglyBot/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(20000), // 20s timeout
      });

      if (res.ok) {
        html = await res.text();
        httpSuccess = true;
      }
    } catch (e) {
      console.warn(`[Stage 1 Direct HTTP] Failed for ${page.url}: ${(e as Error).message}`);
    }

    const cleanedContent = cleanCareerPageContent(html);
    const newContentHash = generateContentHash(cleanedContent);

    // ----------------------------------------------------
    // STAGE 2: Change Detection (Hash Check - Bypassed if force=true)
    // ----------------------------------------------------
    if (!options?.force && httpSuccess && page.lastContentHash && page.lastContentHash === newContentHash) {
      console.log(`[Change Detector] Content hash matches previous hash (${newContentHash.substring(0, 8)}...). Skipping AI extraction for ${page.url}.`);

      const durationMs = Date.now() - startTime;
      await db.insert(scrapeLogs).values({
        careerPageId,
        success: true,
        suspicious: false,
        jobsFound: 0,
        jobsAdded: 0,
        jobsRemoved: 0,
        durationMs,
        errorMessage: 'Content unchanged (SHA-256 hash match). AI processing skipped.',
      });

      await db.update(careerPages).set({
        lastScrapedAt: new Date(),
        lastSuccessAt: new Date(),
        consecutiveFailures: 0,
        status: 'active',
        nextCheckAt: new Date(Date.now() + page.checkIntervalMinutes * 60 * 1000),
      }).where(eq(careerPages.id, careerPageId));

      return { success: true, unchanged: true, jobsFound: 0, jobsAdded: 0 };
    }

    // ----------------------------------------------------
    // STAGE 3: Native ATS & API Adapter Check
    // ----------------------------------------------------
    if (httpSuccess && html) {
      let selectedAdapter: ATSAdapter = GenericAdapter;
      for (const adapter of adapters) {
        if (adapter.detect(page.url, html)) {
          selectedAdapter = adapter;
          break;
        }
      }

      if (selectedAdapter.name !== 'generic') {
        selectedAdapterName = selectedAdapter.name;
        extractedJobs = await selectedAdapter.extractJobs(page.url, html);
      }
    }

    // ----------------------------------------------------
    // STAGE 4: Ollama Cloud AI Job Extraction
    // ----------------------------------------------------
    if (extractedJobs.length === 0 && cleanedContent.length > 20) {
      try {
        const activeModel = process.env.OLLAMA_MODEL || 'gemma4:31b';
        console.log(`[Ollama AI Extractor] Sending changed page content for ${page.url} to Ollama Cloud (${activeModel})...`);
        const aiResults = await extractJobsWithAI([{
          pageId: page.id,
          sourceUrl: page.url,
          content: cleanedContent,
          companyName: page.companyName || undefined,
        }]);

        if (aiResults && aiResults.length > 0 && aiResults[0].jobs) {
          const aiJobs = aiResults[0].jobs;
          selectedAdapterName = `ollama_${activeModel.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

          extractedJobs = aiJobs.map((j) => {
            let appUrl = j.applicationUrl || page.url;
            try {
              if (appUrl && !appUrl.startsWith('http')) {
                appUrl = new URL(appUrl, page.url).toString();
              }
            } catch {
              appUrl = page.url;
            }

            return {
              externalId: j.jobId || undefined,
              title: j.jobTitle,
              url: appUrl,
              location: j.location || undefined,
              department: j.department || undefined,
              jobType: j.employmentType || undefined,
              rawData: j,
            };
          });
        }
      } catch (aiErr: any) {
        console.warn(`[Ollama AI Extractor] Ollama extraction error for ${page.url}: ${aiErr.message}. Falling back to DOM parsers.`);
      }
    }

    // ----------------------------------------------------
    // STAGE 5: Playwright / Generic DOM Fallback
    // ----------------------------------------------------
    if (extractedJobs.length === 0 && httpSuccess && html) {
      extractedJobs = await GenericAdapter.extractJobs(page.url, html);
      selectedAdapterName = GenericAdapter.name;
    }

    if (extractedJobs.length === 0) {
      const playwrightJobs = await runPlaywrightFallback(page.url);
      if (playwrightJobs.length > 0) {
        extractedJobs = playwrightJobs;
        selectedAdapterName = 'playwright_browser';
      }
    }

    // ----------------------------------------------------
    // DEDUPLICATION & DATABASE PERSISTENCE
    // ----------------------------------------------------
    const existingJobs = await db.select().from(jobs).where(eq(jobs.careerPageId, careerPageId));
    const diff = diffJobs(extractedJobs, existingJobs, page.url);
    const durationMs = Date.now() - startTime;

    let jobsAdded = 0;
    let jobsRemoved = 0;

    // Anti-Spike Protection check
    if (diff.isSuspicious) {
      await db.insert(scrapeLogs).values({
        careerPageId,
        success: true,
        suspicious: true,
        jobsFound: extractedJobs.length,
        jobsAdded: 0,
        jobsRemoved: 0,
        durationMs,
        errorMessage: 'Anti-Spike protection triggered: >80% job drop detected. Mass closure skipped.',
      });

      await db.update(careerPages).set({
        atsType: selectedAdapterName,
        lastScrapedAt: new Date(),
        lastSuccessAt: new Date(),
        status: 'degraded',
        nextCheckAt: new Date(Date.now() + page.checkIntervalMinutes * 60 * 1000),
      }).where(eq(careerPages.id, careerPageId));

      return { success: true, suspicious: true, jobsFound: extractedJobs.length };
    }

    // Process NEW jobs with deterministic fingerprinting & expired deadline filter
    for (const job of diff.newJobs) {
      const rawDeadline = (job.rawData as any)?.deadline || (job.rawData as any)?.deadlineDate;
      const expired = isDeadlineExpired(rawDeadline);
      const initialStatus = expired ? 'closed' : 'active';

      const fingerprint = generateJobFingerprint(job, page.url);
      const [insertedJob] = await db.insert(jobs).values({
        careerPageId,
        fingerprint,
        externalId: job.externalId || null,
        title: job.title,
        url: job.url || null,
        location: job.location || null,
        jobType: job.jobType || null,
        department: job.department || null,
        status: initialStatus,
        closedAt: expired ? new Date() : null,
        rawData: job.rawData ? job.rawData : null,
      }).onConflictDoUpdate({
        target: [jobs.careerPageId, jobs.fingerprint],
        set: {
          status: initialStatus,
          lastSeenAt: new Date(),
          closedAt: expired ? new Date() : null,
          missedScrapes: 0,
        },
      }).returning();

      if (!expired) {
        jobsAdded++;

        // Trigger notification queue creation for subscribers matching positive keywords
        const subs = await db.select().from(subscriptions)
          .where(and(eq(subscriptions.careerPageId, careerPageId), eq(subscriptions.isActive, true)));

        for (const sub of subs) {
          const keywordsList = sub.positiveKeywords || [];
          const matched = matchKeywords(
            keywordsList,
            insertedJob.title,
            insertedJob.department || '',
            insertedJob.location || ''
          );

          if (matched.isMatch) {
            await db.insert(notificationQueue).values({
              userId: sub.userId,
              jobId: insertedJob.id,
              eventType: 'new',
              keywordMatched: matched.matchedKeywords,
            }).onConflictDoNothing();
          }
        }
      }
    }

    // Process UNCHANGED jobs (reset missedScrapes, mark closed if deadline expired)
    for (const un of diff.unchangedJobs) {
      const rawDeadline = (un.rawData as any)?.deadline || (un.rawData as any)?.deadlineDate;
      const expired = isDeadlineExpired(rawDeadline);

      await db.update(jobs)
        .set({
          status: expired ? 'closed' : 'active',
          closedAt: expired ? new Date() : null,
          lastSeenAt: new Date(),
          missedScrapes: 0
        })
        .where(and(eq(jobs.careerPageId, careerPageId), eq(jobs.fingerprint, un.fingerprint)));
    }

    // Process MISSING jobs (increment missedScrapes, mark closed if >= 3)
    for (const rm of diff.removedJobs) {
      const existing = existingJobs.find(j => j.fingerprint === rm.fingerprint);
      if (existing) {
        const newMissed = existing.missedScrapes + 1;
        if (newMissed >= 3) {
          await db.update(jobs)
            .set({ status: 'closed', closedAt: new Date(), missedScrapes: newMissed })
            .where(eq(jobs.id, existing.id));
          jobsRemoved++;
        } else {
          await db.update(jobs)
            .set({ missedScrapes: newMissed })
            .where(eq(jobs.id, existing.id));
        }
      }
    }

    // Record Scrape Log
    await db.insert(scrapeLogs).values({
      careerPageId,
      success: true,
      suspicious: false,
      jobsFound: extractedJobs.length,
      jobsAdded,
      jobsRemoved,
      durationMs,
    });

    // Update Career Page schedule AND store successful content hash AFTER successful processing
    await db.update(careerPages).set({
      atsType: selectedAdapterName,
      lastContentHash: newContentHash,
      lastScrapedAt: new Date(),
      lastSuccessAt: new Date(),
      consecutiveFailures: 0,
      status: 'active',
      nextCheckAt: new Date(Date.now() + page.checkIntervalMinutes * 60 * 1000),
    }).where(eq(careerPages.id, careerPageId));

    return { success: true, suspicious: false, jobsFound: extractedJobs.length, jobsAdded, jobsRemoved };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const failures = page.consecutiveFailures + 1;
    let nextStatus = page.status;

    let backoffMinutes = page.checkIntervalMinutes;
    if (failures >= 14) {
      nextStatus = 'paused';
      backoffMinutes = 1440; // 24h
    } else if (failures >= 7) {
      nextStatus = 'broken';
      backoffMinutes = 720; // 12h
    } else if (failures >= 3) {
      nextStatus = 'degraded';
      backoffMinutes = 360; // 6h
    }

    await db.insert(scrapeLogs).values({
      careerPageId,
      success: false,
      suspicious: false,
      jobsFound: 0,
      jobsAdded: 0,
      jobsRemoved: 0,
      durationMs,
      errorMessage: error.message || 'Scrape failed',
    });

    await db.update(careerPages).set({
      consecutiveFailures: failures,
      status: nextStatus,
      lastScrapedAt: new Date(),
      nextCheckAt: new Date(Date.now() + backoffMinutes * 60 * 1000),
    }).where(eq(careerPages.id, careerPageId));

    throw error;
  }
}
