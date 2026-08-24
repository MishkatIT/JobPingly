import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, listCareerPages, jobs, listSubscriptions, listCollaborators } from '@/lib/db/schema';
import { isFeatureEnabled } from '@/lib/flags/check';
import { eq, inArray, and, count, countDistinct, isNull } from 'drizzle-orm';

import { ensureAdminMasterWatchlist, ADMIN_MASTER_LIST_SLUG } from '@/lib/lists/admin-master';

// GET user lists with backend pagination + search
export async function GET(req: NextRequest) {
  const tTotalStart = performance.now();

  const tAuthStart = performance.now();
  const user = await getAuthUser(req);
  const tAuthEnd = performance.now();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // If user is admin, auto-sync and ensure Admin Master Watchlist
  if (user.role === 'admin') {
    await ensureAdminMasterWatchlist(user.userId);
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 9));
  const search = searchParams.get('search') || '';

  // Fetch owned lists & accepted collaborator invitations in parallel
  const tListsCollabStart = performance.now();
  const listColumns = {
    id: lists.id,
    userId: lists.userId,
    name: lists.name,
    slug: lists.slug,
    description: lists.description,
    visibility: lists.visibility,
    parentListId: lists.parentListId,
    isCanonical: lists.isCanonical,
    followerCount: lists.followerCount,
    contributionCount: lists.contributionCount,
    createdAt: lists.createdAt,
    updatedAt: lists.updatedAt,
  };

  const [rawUserLists, collabRecords] = await Promise.all([
    db.select(listColumns).from(lists).where(and(eq(lists.userId, user.userId), isNull(lists.deletedAt))),
    db
      .select({
        listId: listCollaborators.listId,
        role: listCollaborators.role,
      })
      .from(listCollaborators)
      .where(and(eq(listCollaborators.userId, user.userId), eq(listCollaborators.status, 'accepted'))),
  ]);
  const tListsCollabEnd = performance.now();

  const collabListIds = collabRecords.map(c => c.listId);
  const collabListMap = new Map(collabRecords.map(c => [c.listId, c.role]));

  const tCollabFetchStart = performance.now();
  let collabLists: any[] = [];
  if (collabListIds.length > 0) {
    collabLists = await db.select(listColumns).from(lists).where(and(inArray(lists.id, collabListIds), isNull(lists.deletedAt)));
  }
  const tCollabFetchEnd = performance.now();

  const userListsEnriched = rawUserLists.map(l => ({ ...l, isOwner: true, isCollaborator: false }));
  const collabListsEnriched = collabLists.map(l => ({ ...l, isOwner: false, isCollaborator: true, collabRole: collabListMap.get(l.id) }));

  const sort = searchParams.get('sort') || 'followers';

  // Combined owned + collaborator watch lists
  const combinedLists = [...userListsEnriched, ...collabListsEnriched];

  // Pin Admin Master Watchlist at the very top for admin users
  combinedLists.sort((a, b) => {
    if (a.slug === ADMIN_MASTER_LIST_SLUG) return -1;
    if (b.slug === ADMIN_MASTER_LIST_SLUG) return 1;
    return 0;
  });

  let filtered = combinedLists;
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(l =>
      l.name.toLowerCase().includes(q) ||
      (l.description && l.description.toLowerCase().includes(q))
    );
  }

  // Bulk fetch company counts & active job counts across all user watch lists directly in SQL
  const allListIds = filtered.map(l => l.id);
  const companyCountByListId = new Map<string, number>();
  const jobCountByListId = new Map<string, number>();

  if (allListIds.length > 0) {
    const [companyCounts, jobCounts] = await Promise.all([
      db
        .select({
          listId: listCareerPages.listId,
          companyCount: countDistinct(listCareerPages.careerPageId),
        })
        .from(listCareerPages)
        .where(inArray(listCareerPages.listId, allListIds))
        .groupBy(listCareerPages.listId),
      db
        .select({
          listId: listCareerPages.listId,
          jobCount: count(jobs.id),
        })
        .from(listCareerPages)
        .innerJoin(jobs, and(eq(jobs.careerPageId, listCareerPages.careerPageId), eq(jobs.status, 'active')))
        .where(inArray(listCareerPages.listId, allListIds))
        .groupBy(listCareerPages.listId),
    ]);

    companyCounts.forEach(c => companyCountByListId.set(c.listId, Number(c.companyCount)));
    jobCounts.forEach(j => jobCountByListId.set(j.listId, Number(j.jobCount)));
  }

  const enrichedAll = filtered.map(l => {
    return {
      ...l,
      followerCount: l.followerCount || 0,
      companyCount: companyCountByListId.get(l.id) || 0,
      jobCount: jobCountByListId.get(l.id) || 0,
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

  // OPTIMIZED: Calculate unique stats using SQL COUNT DISTINCT and JOIN aggregates in parallel
  const tStatsStart = performance.now();
  const allUserListIds = combinedLists.map(l => l.id);
  let totalUniqueCompanies = 0;
  let totalActiveJobs = 0;

  if (allUserListIds.length > 0) {
    const [compRes, jobsRes] = await Promise.all([
      db
        .select({ uniqueCompanies: countDistinct(listCareerPages.careerPageId) })
        .from(listCareerPages)
        .where(inArray(listCareerPages.listId, allUserListIds)),
      db
        .select({ totalJobs: countDistinct(jobs.id) })
        .from(listCareerPages)
        .innerJoin(jobs, and(eq(jobs.careerPageId, listCareerPages.careerPageId), eq(jobs.status, 'active')))
        .where(inArray(listCareerPages.listId, allUserListIds)),
    ]);

    totalUniqueCompanies = Number(compRes[0]?.uniqueCompanies || 0);
    totalActiveJobs = Number(jobsRes[0]?.totalJobs || 0);
  }
  const tStatsEnd = performance.now();

  const tTotalEnd = performance.now();

  console.log(`[PERF /api/lists] Total: ${(tTotalEnd - tTotalStart).toFixed(2)}ms | Auth: ${(tAuthEnd - tAuthStart).toFixed(2)}ms | Stats: ${(tStatsEnd - tStatsStart).toFixed(2)}ms`);

  return NextResponse.json({
    lists: paginated,
    stats: {
      totalLists: combinedLists.length,
      totalUniqueCompanies,
      totalActiveJobs,
    },
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    },
  });
}

// POST create new list (enforcing max_lists_per_user quota, -1 = unlimited)
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { name, description, visibility } = body;

  if (!name || name.trim().length === 0) {
    return NextResponse.json({ error: 'List name is required.' }, { status: 400 });
  }

  // Quota check: max_lists_per_user (-1 or <= 0 means Unlimited)
  if (user.role !== 'admin') {
    const maxListsFlag = await isFeatureEnabled('limits.max_lists_per_user', 10);
    const maxLists = typeof maxListsFlag === 'number' ? maxListsFlag : Number(maxListsFlag) || 10;

    if (maxLists > 0) {
      const userLists = await db.select().from(lists).where(and(eq(lists.userId, user.userId), isNull(lists.deletedAt)));
      if (userLists.length >= maxLists) {
        return NextResponse.json({
          error: `Quota Exceeded: You have reached the maximum limit of ${maxLists} watch lists. Contact admin to upgrade your limit.`
        }, { status: 400 });
      }
    }
  }

  // Create clean slug
  const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const uniqueSlug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;

  const [newList] = await db.insert(lists).values({
    userId: user.userId,
    name: name.trim(),
    slug: uniqueSlug,
    description: description ? description.trim() : null,
    visibility: visibility === 'public' ? 'public' : 'private',
    followerCount: 1,
  }).returning();

  // Auto-subscribe list owner for email alerts
  await db.insert(listSubscriptions).values({
    userId: user.userId,
    listId: newList.id,
    digestFrequency: 'instant',
  }).catch(() => null);

  return NextResponse.json({ list: newList });
}
