import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, careerPages, listCareerPages, subscriptions } from '@/lib/db/schema';
import { isUrlSafe } from '@/lib/security/ssrf';
import { isFeatureEnabled } from '@/lib/flags/check';
import { eq, and } from 'drizzle-orm';
import { runScraperPipeline } from '@/packages/scraper/src/pipeline';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const listId = params.id;
  const [list] = await db.select().from(lists).where(and(eq(lists.id, listId), eq(lists.userId, user.userId)));
  if (!list) {
    return NextResponse.json({ error: 'Watch list not found or unauthorized' }, { status: 404 });
  }

  const body = await req.json();
  const { url, companyName, positiveKeywords } = body;

  if (!url) {
    return NextResponse.json({ error: 'Career Page URL is required.' }, { status: 400 });
  }

  // Quota Check: max_urls_per_list (-1 or <= 0 means Unlimited)
  if (user.role !== 'admin') {
    const maxUrlsFlag = await isFeatureEnabled('limits.max_urls_per_list', 25);
    const maxUrls = typeof maxUrlsFlag === 'number' ? maxUrlsFlag : Number(maxUrlsFlag) || 25;

    if (maxUrls > 0) {
      const existingListPages = await db.select().from(listCareerPages).where(eq(listCareerPages.listId, listId));
      if (existingListPages.length >= maxUrls) {
        return NextResponse.json({
          error: `Quota Exceeded: This watch list has reached the maximum limit of ${maxUrls} monitored career page URLs.`
        }, { status: 400 });
      }
    }
  }

  // 1. SSRF Check & URL Normalization
  const ssrf = isUrlSafe(url);
  if (!ssrf.safe || !ssrf.normalizedUrl) {
    return NextResponse.json({ error: ssrf.reason || 'Invalid or prohibited URL.' }, { status: 400 });
  }

  const normalizedUrl = ssrf.normalizedUrl;

  // 2. Global deduplication check
  let [page] = await db.select().from(careerPages).where(eq(careerPages.url, normalizedUrl));
  if (!page) {
    let hostCompany = companyName;
    if (!hostCompany) {
      try {
        const parsed = new URL(normalizedUrl);
        const parts = parsed.hostname.split('.');
        hostCompany = parts.length > 1 ? parts[parts.length - 2] : parsed.hostname;
        hostCompany = hostCompany.charAt(0).toUpperCase() + hostCompany.slice(1);
      } catch {
        hostCompany = 'Company';
      }
    }

    [page] = await db.insert(careerPages).values({
      url: normalizedUrl,
      companyName: hostCompany,
      status: 'active',
      nextCheckAt: new Date(), // Immediate initial check
    }).returning();
  }

  // 3. Add to list
  await db.insert(listCareerPages).values({
    listId: list.id,
    careerPageId: page.id,
  }).onConflictDoNothing();

  // 4. Create User Subscription with Keywords
  const kwList = Array.isArray(positiveKeywords)
    ? positiveKeywords
    : (typeof positiveKeywords === 'string' ? positiveKeywords.split(',').map(s => s.trim()).filter(Boolean) : []);

  await db.insert(subscriptions).values({
    userId: user.userId,
    careerPageId: page.id,
    positiveKeywords: kwList,
  }).onConflictDoUpdate({
    target: [subscriptions.userId, subscriptions.careerPageId],
    set: {
      positiveKeywords: kwList,
      isActive: true,
    },
  });

  // Trigger initial background sync non-blockingly
  runScraperPipeline(page.id, { force: false }).catch(err => {
    console.error('[Add Career Page] Initial background sync error for', page.id, err.message);
  });

  return NextResponse.json({
    success: true,
    careerPage: page,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const listId = params.id;
  const { searchParams } = new URL(req.url);
  const careerPageId = searchParams.get('careerPageId');

  if (!careerPageId) {
    return NextResponse.json({ error: 'careerPageId parameter is required.' }, { status: 400 });
  }

  const [list] = await db.select().from(lists).where(and(eq(lists.id, listId), eq(lists.userId, user.userId)));
  if (!list) {
    return NextResponse.json({ error: 'Watch list not found or unauthorized' }, { status: 404 });
  }

  // Remove career page from watch list junction table
  await db.delete(listCareerPages).where(and(
    eq(listCareerPages.listId, listId),
    eq(listCareerPages.careerPageId, careerPageId)
  ));

  return NextResponse.json({ success: true });
}
