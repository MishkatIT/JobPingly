import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { careerPages, adminAuditLog, listCareerPages, subscriptions, jobs } from '@/lib/db/schema';
import { desc, ilike, or, sql, eq, inArray } from 'drizzle-orm';
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

  const [totalRes, paginatedItems] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(careerPages).where(whereCondition),
    db.select()
      .from(careerPages)
      .where(whereCondition)
      .orderBy(desc(careerPages.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
  ]);

  const total = Number(totalRes[0]?.count || 0);
  const totalPages = Math.ceil(total / limit) || 1;

  // Format URLs and fetch watch list counts for only the paginated slice
  const pageIds = paginatedItems.map(p => p.id);
  const countMap = new Map<string, number>();

  if (pageIds.length > 0) {
    const pageCounts = await db
      .select({
        careerPageId: listCareerPages.careerPageId,
        count: sql<number>`count(*)::int`,
      })
      .from(listCareerPages)
      .where(inArray(listCareerPages.careerPageId, pageIds))
      .groupBy(listCareerPages.careerPageId);

    pageCounts.forEach(pc => countMap.set(pc.careerPageId, Number(pc.count)));
  }

  const items = paginatedItems.map(item => ({
    ...item,
    url: normalizeCompanyUrl(item.url),
    watchListCount: countMap.get(item.id) || 0,
  }));

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

