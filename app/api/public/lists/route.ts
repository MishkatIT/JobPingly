import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { lists, listCareerPages, users, jobs } from '@/lib/db/schema';
import { isFeatureEnabled } from '@/lib/flags/check';
import { computeListQualityScore } from '@/lib/lists/anti-redundancy';
import { eq, inArray, and, count, countDistinct, isNull, or, ilike, desc, asc, sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const publicEnabled = await isFeatureEnabled('public_lists.enabled', true);
  if (!publicEnabled) {
    return NextResponse.json({ error: 'Public lists directory is currently disabled by administrator.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 9));
  const search = searchParams.get('search')?.trim() || '';
  const sort = searchParams.get('sort') || 'followers';

  const conditions = [
    eq(lists.visibility, 'public'),
    isNull(lists.deletedAt)
  ];

  if (search) {
    const q = `%${search}%`;
    conditions.push(
      sql`(${lists.name} ILIKE ${q} OR ${lists.description} ILIKE ${q})`
    );
  }

  const whereClause = and(...conditions)!;

  // Sorting
  let orderByClause = desc(lists.followerCount);
  if (sort === 'newest') {
    orderByClause = desc(lists.createdAt);
  } else if (sort === 'oldest') {
    orderByClause = asc(lists.createdAt);
  } else if (sort === 'name_asc' || sort === 'alphabetical') {
    orderByClause = asc(lists.name);
  }

  const [totalRes, paginatedLists] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` })
      .from(lists)
      .leftJoin(users, eq(lists.userId, users.id))
      .where(whereClause),
    db.select({
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
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(limit)
      .offset((page - 1) * limit),
  ]);

  const total = Number(totalRes[0]?.count || 0);
  const totalPages = Math.ceil(total / limit) || 1;

  // Bulk fetch company & active job counts ONLY for the paginated slice
  const paginatedListIds = paginatedLists.map(l => l.id);
  const companyCountByListId = new Map<string, number>();
  const jobCountByListId = new Map<string, number>();

  if (paginatedListIds.length > 0) {
    const [companyCounts, jobCounts] = await Promise.all([
      db
        .select({
          listId: listCareerPages.listId,
          companyCount: countDistinct(listCareerPages.careerPageId),
        })
        .from(listCareerPages)
        .where(inArray(listCareerPages.listId, paginatedListIds))
        .groupBy(listCareerPages.listId),
      db
        .select({
          listId: listCareerPages.listId,
          jobCount: count(jobs.id),
        })
        .from(listCareerPages)
        .innerJoin(jobs, and(eq(jobs.careerPageId, listCareerPages.careerPageId), eq(jobs.status, 'active')))
        .where(inArray(listCareerPages.listId, paginatedListIds))
        .groupBy(listCareerPages.listId),
    ]);

    companyCounts.forEach(c => companyCountByListId.set(c.listId, Number(c.companyCount)));
    jobCounts.forEach(j => jobCountByListId.set(j.listId, Number(j.jobCount)));
  }

  // Parent list details enrichment for paginated items
  const parentListIds = paginatedLists.map(l => l.parentListId).filter(Boolean) as string[];
  const parentListsResult = parentListIds.length > 0
    ? await db.select({ id: lists.id, name: lists.name, slug: lists.slug }).from(lists).where(and(inArray(lists.id, parentListIds), isNull(lists.deletedAt)))
    : [];
  const parentMap = new Map(parentListsResult.map(p => [p.id, p]));

  const enriched = paginatedLists.map(l => {
    const parent = l.parentListId ? parentMap.get(l.parentListId) : null;
    return {
      ...l,
      followerCount: l.followerCount || 0,
      companyCount: companyCountByListId.get(l.id) || 0,
      jobCount: jobCountByListId.get(l.id) || 0,
      parentListName: parent?.name || null,
      parentListSlug: parent?.slug || null,
    };
  });

  // Summary Stats for Public Directory (SQL Aggregates)
  const [compRes, jobsRes] = await Promise.all([
    db
      .select({ uniqueCompanies: countDistinct(listCareerPages.careerPageId) })
      .from(listCareerPages)
      .innerJoin(lists, and(eq(listCareerPages.listId, lists.id), eq(lists.visibility, 'public'), isNull(lists.deletedAt))),
    db
      .select({ totalJobs: countDistinct(jobs.id) })
      .from(listCareerPages)
      .innerJoin(lists, and(eq(listCareerPages.listId, lists.id), eq(lists.visibility, 'public'), isNull(lists.deletedAt)))
      .innerJoin(jobs, and(eq(jobs.careerPageId, listCareerPages.careerPageId), eq(jobs.status, 'active'))),
  ]);

  const totalUniqueCompanies = Number(compRes[0]?.uniqueCompanies || 0);
  const totalActiveJobs = Number(jobsRes[0]?.totalJobs || 0);

  return NextResponse.json({
    lists: enriched,
    stats: {
      totalLists: total,
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
