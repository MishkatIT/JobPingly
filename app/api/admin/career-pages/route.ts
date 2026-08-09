import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { careerPages, adminAuditLog, listCareerPages, subscriptions, jobs } from '@/lib/db/schema';
import { desc, ilike, or, sql, eq } from 'drizzle-orm';
import { isUrlSafe, normalizeCompanyUrl } from '@/lib/security/ssrf';

async function consolidateDuplicates() {
  try {
    const all = await db.select().from(careerPages);
    const seen = new Map<string, typeof all[0]>();

    for (const page of all) {
      const norm = normalizeCompanyUrl(page.url);
      const existing = seen.get(norm);

      if (existing) {
        // Merge duplicate page into existing primary page
        await db.update(listCareerPages).set({ careerPageId: existing.id }).where(eq(listCareerPages.careerPageId, page.id)).catch(() => {});
        await db.update(subscriptions).set({ careerPageId: existing.id }).where(eq(subscriptions.careerPageId, page.id)).catch(() => {});
        await db.update(jobs).set({ careerPageId: existing.id }).where(eq(jobs.careerPageId, page.id)).catch(() => {});
        await db.delete(careerPages).where(eq(careerPages.id, page.id)).catch(() => {});
      } else {
        seen.set(norm, page);
        if (page.url !== norm) {
          await db.update(careerPages).set({ url: norm }).where(eq(careerPages.id, page.id)).catch(() => {});
        }
      }
    }
  } catch (e) {
    console.error('Consolidation non-fatal error:', e);
  }
}

export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  // Consolidate legacy duplicates in database
  await consolidateDuplicates();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 10));
  const search = searchParams.get('search')?.trim() || '';

  let whereCondition;
  if (search) {
    whereCondition = or(
      ilike(careerPages.companyName, `%${search}%`),
      ilike(careerPages.url, `%${search}%`)
    );
  }

  // Fetch items to deduplicate strictly by normalized URL
  const rawItems = await db.select()
    .from(careerPages)
    .where(whereCondition)
    .orderBy(desc(careerPages.createdAt));

  // Guarantee uniqueness: one company per unique formatted URL
  const uniqueMap = new Map<string, typeof rawItems[0]>();
  for (const item of rawItems) {
    const formattedUrl = normalizeCompanyUrl(item.url);
    if (!uniqueMap.has(formattedUrl)) {
      uniqueMap.set(formattedUrl, {
        ...item,
        url: formattedUrl,
      });
    }
  }

  const deduplicated = Array.from(uniqueMap.values());

  // Count watch list attachments for each career page
  const allListCareerPages = await db.select({ careerPageId: listCareerPages.careerPageId }).from(listCareerPages);
  const countMap = new Map<string, number>();
  for (const lcp of allListCareerPages) {
    countMap.set(lcp.careerPageId, (countMap.get(lcp.careerPageId) || 0) + 1);
  }

  const itemsWithCounts = deduplicated.map(item => ({
    ...item,
    watchListCount: countMap.get(item.id) || 0,
  }));

  const total = itemsWithCounts.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const offset = (page - 1) * limit;
  const items = itemsWithCounts.slice(offset, offset + limit);

  return NextResponse.json({
    careerPages: items,
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
  });
}

export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { url, companyName, checkIntervalMinutes } = body;

    if (!url || !url.trim()) {
      return NextResponse.json({ error: 'Career page URL is required.' }, { status: 400 });
    }

    const ssrf = isUrlSafe(url);
    if (!ssrf.safe || !ssrf.normalizedUrl) {
      return NextResponse.json({ error: ssrf.reason || 'Invalid or prohibited career page URL.' }, { status: 400 });
    }

    const normalizedUrl = ssrf.normalizedUrl;

    // Check if company page with this unique URL already exists
    const existing = await db.select()
      .from(careerPages)
      .where(eq(careerPages.url, normalizedUrl));

    if (existing.length > 0) {
      return NextResponse.json({
        error: `A company with this unique URL (${normalizedUrl}) already exists in the system.`,
        careerPage: existing[0],
        alreadyExists: true,
      }, { status: 409 });
    }

    // Auto-derive company name if not provided
    let hostCompany = companyName?.trim();
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

    const interval = checkIntervalMinutes ? Math.max(5, Number(checkIntervalMinutes)) : 180;

    const [created] = await db.insert(careerPages).values({
      url: normalizedUrl,
      companyName: hostCompany,
      status: 'active',
      checkIntervalMinutes: interval,
      nextCheckAt: new Date(),
    }).returning();

    await db.insert(adminAuditLog).values({
      adminId: adminUser.userId,
      action: 'add_career_page',
      targetType: 'career_page',
      targetId: created.id,
      metadata: { companyName: hostCompany, url: normalizedUrl },
    });

    return NextResponse.json({
      success: true,
      careerPage: created,
      message: `Successfully added company '${hostCompany}' with unique URL: ${normalizedUrl}`,
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to add company career page.' }, { status: 500 });
  }
}

