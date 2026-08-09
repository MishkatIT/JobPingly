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

  // Batch enrich paginated items in bulk constant queries
  const paginatedListIds = paginated.map(l => l.id);
  const parentListIds = paginated.map(l => l.parentListId).filter(Boolean) as string[];

  const [allPaginatedPages, parentListsResult] = await Promise.all([
    paginatedListIds.length > 0
      ? db.select().from(listCareerPages).where(inArray(listCareerPages.listId, paginatedListIds))
      : [],
    parentListIds.length > 0
      ? db.select({ id: lists.id, name: lists.name, slug: lists.slug }).from(lists).where(inArray(lists.id, parentListIds))
      : [],
  ]);

  const parentMap = new Map(parentListsResult.map(p => [p.id, p]));

  const pagesByListId = new Map<string, string[]>();
  allPaginatedPages.forEach(p => {
    const arr = pagesByListId.get(p.listId) || [];
    arr.push(p.careerPageId);
    pagesByListId.set(p.listId, arr);
  });

  const uniquePaginatedCareerPageIds = Array.from(new Set(allPaginatedPages.map(p => p.careerPageId)));
  const activePaginatedJobs = uniquePaginatedCareerPageIds.length > 0
    ? await db.select({ careerPageId: jobs.careerPageId }).from(jobs).where(and(inArray(jobs.careerPageId, uniquePaginatedCareerPageIds), eq(jobs.status, 'active')))
    : [];

  const jobCountByCareerPageId = new Map<string, number>();
  activePaginatedJobs.forEach(j => {
    jobCountByCareerPageId.set(j.careerPageId, (jobCountByCareerPageId.get(j.careerPageId) || 0) + 1);
  });

  const enriched = paginated.map(l => {
    const cPageIds = pagesByListId.get(l.id) || [];
    const jobCount = cPageIds.reduce((sum, cpId) => sum + (jobCountByCareerPageId.get(cpId) || 0), 0);
    const parent = l.parentListId ? parentMap.get(l.parentListId) : null;

    return {
      ...l,
      companyCount: cPageIds.length,
      jobCount,
      parentListName: parent?.name || null,
      parentListSlug: parent?.slug || null,
    };
  });

  // Summary Stats for Public Directory
  const allPublicListIds = rawPublicLists.map(l => l.id);
  let totalUniqueCompanies = 0;
  let totalActiveJobs = 0;

  if (allPublicListIds.length > 0) {
    const publicListPages = await db
      .select({ careerPageId: listCareerPages.careerPageId })
      .from(listCareerPages)
      .where(inArray(listCareerPages.listId, allPublicListIds));

    const uniquePageIds = Array.from(new Set(publicListPages.map(p => p.careerPageId)));
    totalUniqueCompanies = uniquePageIds.length;

    if (uniquePageIds.length > 0) {
      const activePublicJobs = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(inArray(jobs.careerPageId, uniquePageIds), eq(jobs.status, 'active')));
      totalActiveJobs = activePublicJobs.length;
    }
  }

  return NextResponse.json({
    lists: enriched,
    stats: {
      totalLists: rawPublicLists.length,
      totalUniqueCompanies,
      totalActiveJobs,
    },
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
  });
}
