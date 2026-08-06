import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { careerPages } from '@/lib/db/schema';
import { isUrlSafe } from '@/lib/security/ssrf';
import { eq } from 'drizzle-orm';
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

// POST trigger re-scrape
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const res = await runScraperPipeline(params.id, { force: true });
    return NextResponse.json({ success: true, result: res });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Scrape execution failed' }, { status: 500 });
  }
}
