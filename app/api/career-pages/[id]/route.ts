import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { careerPages, jobs } from '@/lib/db/schema';
import { isUrlSafe } from '@/lib/security/ssrf';
import { eq, and } from 'drizzle-orm';
import { runScraperPipeline } from '@/packages/scraper/src/pipeline';

// PUT update company name & career page URL
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { companyName, url } = body;

  const updateFields: any = {};

  if (companyName && companyName.trim()) {
    updateFields.companyName = companyName.trim();
  }

  if (url && url.trim()) {
    const ssrf = isUrlSafe(url.trim());
    if (!ssrf.safe || !ssrf.normalizedUrl) {
      return NextResponse.json({ error: ssrf.reason || 'Invalid or prohibited career page URL.' }, { status: 400 });
    }

    // Check if another company page already uses this unique URL
    const existing = await db.select()
      .from(careerPages)
      .where(eq(careerPages.url, ssrf.normalizedUrl));

    if (existing.length > 0 && existing[0].id !== params.id) {
      return NextResponse.json({
        error: `Another company page already uses this unique URL (${ssrf.normalizedUrl}).`
      }, { status: 400 });
    }

    updateFields.url = ssrf.normalizedUrl;
    updateFields.lastContentHash = null; // Reset content hash so edited URL scrapes afresh
  }

  if (Object.keys(updateFields).length === 0) {
    return NextResponse.json({ error: 'No valid fields provided to update.' }, { status: 400 });
  }

  const [updated] = await db.update(careerPages)
    .set(updateFields)
    .where(eq(careerPages.id, params.id))
    .returning();

  return NextResponse.json({ success: true, careerPage: updated });
}

// POST trigger sync / update check
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pageId = params.id;
    const [page] = await db.select().from(careerPages).where(eq(careerPages.id, pageId));
    if (!page) {
      return NextResponse.json({ error: 'Career page not found' }, { status: 404 });
    }

    const forceParam = req.nextUrl.searchParams.get('force') === 'true';

    // Smart caching check: if page was checked recently (< 5 minutes) AND already has active jobs in DB,
    // return existing cached jobs directly to prevent unnecessary LLM API calls.
    const now = Date.now();
    const lastCheckMs = page.lastScrapedAt ? new Date(page.lastScrapedAt).getTime() : 0;
    const isRecentlyChecked = (now - lastCheckMs) < 5 * 60 * 1000;

    if (!forceParam && isRecentlyChecked) {
      const activeJobs = await db.select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.careerPageId, pageId), eq(jobs.status, 'active')));

      if (activeJobs.length > 0) {
        return NextResponse.json({
          success: true,
          cached: true,
          result: {
            success: true,
            unchanged: true,
            jobsFound: activeJobs.length,
            jobsAdded: 0,
            jobsRemoved: 0,
            message: 'Using cached job data (recently checked).'
          }
        });
      }
    }

    const res = await runScraperPipeline(pageId, { force: forceParam });
    return NextResponse.json({ success: true, result: res });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Sync execution failed' }, { status: 500 });
  }
}
