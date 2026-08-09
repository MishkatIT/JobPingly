import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { lists, listCareerPages, users, jobs } from '@/lib/db/schema';
import { isFeatureEnabled } from '@/lib/flags/check';
import { computeListQualityScore } from '@/lib/lists/anti-redundancy';
import { eq, inArray, and } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const publicEnabled = await isFeatureEnabled('public_lists.enabled', true);
  if (!publicEnabled) {
    return NextResponse.json({ error: 'Public lists directory is currently disabled by administrator.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 9));
  const search = searchParams.get('search') || '';

  const rawPublicLists = await db
    .select({
      id: lists.id,
      name: lists.name,
      slug: lists.slug,
      description: lists.description,
      isCanonical: lists.isCanonical,
      parentListId: lists.parentListId,
      followerCount: lists.followerCount,
      contributionCount: lists.contributionCount,
      createdAt: lists.createdAt,
      updatedAt: lists.updatedAt,
      userId: lists.userId,
      userName: users.name,
      userAvatarUrl: users.avatarUrl,
    })
    .from(lists)
    .leftJoin(users, eq(lists.userId, users.id))
    .where(eq(lists.visibility, 'public'));

  let filtered = rawPublicLists;
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(l =>
      l.name.toLowerCase().includes(q) ||
      (l.description && l.description.toLowerCase().includes(q))
    );
  }

  // Compute quality score for sorting
  const scored = filtered.map(l => ({
    ...l,
    qualityScore: computeListQualityScore({
      followerCount: l.followerCount || 0,
      contributionCount: l.contributionCount || 0,
      companyCount: 0, // Base ranking prior to page fetch
      isCanonical: l.isCanonical ?? true,
    }),
  }));

  // Anti-Redundancy Quality Ranking: Sort by Quality Score descending
  scored.sort((a, b) => b.qualityScore - a.qualityScore);

  const total = scored.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const startIndex = (page - 1) * limit;
  const paginated = scored.slice(startIndex, startIndex + limit);

  // Enrich ONLY the paginated items in parallel
  const enriched = await Promise.all(paginated.map(async (l) => {
    const pagesPromise = db.select().from(listCareerPages).where(eq(listCareerPages.listId, l.id));
    const parentPromise = l.parentListId
      ? db.select({ name: lists.name, slug: lists.slug }).from(lists).where(eq(lists.id, l.parentListId))
      : Promise.resolve([]);

    const [pages, parentResult] = await Promise.all([pagesPromise, parentPromise]);
    let jobCount = 0;

    if (pages.length > 0) {
      const careerPageIds = pages.map(p => p.careerPageId);
      const activeJobs = await db.select()
        .from(jobs)
        .where(and(
          inArray(jobs.careerPageId, careerPageIds),
          eq(jobs.status, 'active')
        ));
      jobCount = activeJobs.length;
    }

    const parent = parentResult[0] || null;

    return {
      ...l,
      companyCount: pages.length,
      jobCount,
      parentListName: parent?.name || null,
      parentListSlug: parent?.slug || null,
    };
  }));

  return NextResponse.json({
    lists: paginated,
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
  });
}
