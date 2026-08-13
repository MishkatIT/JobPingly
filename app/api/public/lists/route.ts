import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { lists, listCareerPages, users, jobs } from '@/lib/db/schema';
import { isFeatureEnabled } from '@/lib/flags/check';
import { computeListQualityScore } from '@/lib/lists/anti-redundancy';
import { eq, inArray, and, count, countDistinct, isNull } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const publicEnabled = await isFeatureEnabled('public_lists.enabled', true);
  if (!publicEnabled) {
    return NextResponse.json({ error: 'Public lists directory is currently disabled by administrator.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 9));
  const search = searchParams.get('search') || '';
  const sort = searchParams.get('sort') || 'followers';

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
    .where(and(eq(lists.visibility, 'public'), isNull(lists.deletedAt)));

  let filtered = rawPublicLists;
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(l =>
      l.name.toLowerCase().includes(q) ||
      (l.description && l.description.toLowerCase().includes(q))
    );
  }

  // Bulk fetch company counts & active job counts across all matching public lists
  const publicListIds = filtered.map(l => l.id);
  const allListPages = publicListIds.length > 0
    ? await db
        .select({ listId: listCareerPages.listId, careerPageId: listCareerPages.careerPageId })
        .from(listCareerPages)
        .where(inArray(listCareerPages.listId, publicListIds))
    : [];

  const pagesByListId = new Map<string, string[]>();
  allListPages.forEach(lp => {
    const arr = pagesByListId.get(lp.listId) || [];
    arr.push(lp.careerPageId);
    pagesByListId.set(lp.listId, arr);
  });

  const uniqueCareerPageIds = Array.from(new Set(allListPages.map(lp => lp.careerPageId)));
  const jobCountByPageId = new Map<string, number>();

  if (uniqueCareerPageIds.length > 0) {
    const groupedJobs = await db
      .select({
        careerPageId: jobs.careerPageId,
        jobCount: count(),
      })
      .from(jobs)
      .where(and(inArray(jobs.careerPageId, uniqueCareerPageIds), eq(jobs.status, 'active')))
      .groupBy(jobs.careerPageId);

    groupedJobs.forEach(g => {
      jobCountByPageId.set(g.careerPageId, Number(g.jobCount));
    });
  }

  // Enrich all items with company & job counts
  const enrichedAll = filtered.map(l => {
    const cPageIds = pagesByListId.get(l.id) || [];
    const jobCount = cPageIds.reduce((sum, cpId) => sum + (jobCountByPageId.get(cpId) || 0), 0);
    return {
      ...l,
      followerCount: l.followerCount || 0,
      companyCount: cPageIds.length,
      jobCount,
    };
  });

  // Sorting logic (Default: Followers DESC -> Companies DESC -> Jobs DESC -> Newest DESC)
  enrichedAll.sort((a, b) => {
    if (sort === 'newest') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (sort === 'oldest') {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    if (sort === 'companies') {
      return (b.companyCount - a.companyCount) || (b.followerCount - a.followerCount) || (b.jobCount - a.jobCount);
    }
    if (sort === 'jobs') {
      return (b.jobCount - a.jobCount) || (b.followerCount - a.followerCount) || (b.companyCount - a.companyCount);
    }
    if (sort === 'name_asc' || sort === 'alphabetical') {
      return a.name.localeCompare(b.name);
    }
    // Default ('followers' / 'default'): Most Followers -> More Companies -> More Jobs
    return (
      (b.followerCount - a.followerCount) ||
      (b.companyCount - a.companyCount) ||
      (b.jobCount - a.jobCount) ||
      (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    );
  });

  const total = enrichedAll.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const startIndex = (page - 1) * limit;
  const paginated = enrichedAll.slice(startIndex, startIndex + limit);

  // Parent list details enrichment for paginated items
  const parentListIds = paginated.map(l => l.parentListId).filter(Boolean) as string[];
  const parentListsResult = parentListIds.length > 0
    ? await db.select({ id: lists.id, name: lists.name, slug: lists.slug }).from(lists).where(and(inArray(lists.id, parentListIds), isNull(lists.deletedAt)))
    : [];
  const parentMap = new Map(parentListsResult.map(p => [p.id, p]));

  const enriched = paginated.map(l => {
    const parent = l.parentListId ? parentMap.get(l.parentListId) : null;
    return {
      ...l,
      parentListName: parent?.name || null,
      parentListSlug: parent?.slug || null,
    };
  });

  // Summary Stats for Public Directory (SQL Aggregates)
  const allPublicListIds = rawPublicLists.map(l => l.id);
  let totalUniqueCompanies = 0;
  let totalActiveJobs = 0;

  if (allPublicListIds.length > 0) {
    const [compRes] = await db
      .select({ uniqueCompanies: countDistinct(listCareerPages.careerPageId) })
      .from(listCareerPages)
      .where(inArray(listCareerPages.listId, allPublicListIds));

    totalUniqueCompanies = Number(compRes?.uniqueCompanies || 0);

    if (totalUniqueCompanies > 0) {
      const publicListPages = await db
        .select({ careerPageId: listCareerPages.careerPageId })
        .from(listCareerPages)
        .where(inArray(listCareerPages.listId, allPublicListIds));

      const uniquePageIds = Array.from(new Set(publicListPages.map(p => p.careerPageId)));

      if (uniquePageIds.length > 0) {
        const [jobsRes] = await db
          .select({ totalJobs: count() })
          .from(jobs)
          .where(and(inArray(jobs.careerPageId, uniquePageIds), eq(jobs.status, 'active')));
        
        totalActiveJobs = Number(jobsRes?.totalJobs || 0);
      }
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
