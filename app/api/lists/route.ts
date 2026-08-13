import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, listCareerPages, jobs, listSubscriptions, listCollaborators } from '@/lib/db/schema';
import { isFeatureEnabled } from '@/lib/flags/check';
import { eq, inArray, and, count, countDistinct } from 'drizzle-orm';

// GET user lists with backend pagination + search
export async function GET(req: NextRequest) {
  const tTotalStart = performance.now();

  const tAuthStart = performance.now();
  const user = await getAuthUser(req);
  const tAuthEnd = performance.now();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 9));
  const search = searchParams.get('search') || '';

  // Fetch owned lists & accepted collaborator invitations in parallel
  const tListsCollabStart = performance.now();
  const [rawUserLists, collabRecords] = await Promise.all([
    db.select().from(lists).where(eq(lists.userId, user.userId)),
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
    collabLists = await db.select().from(lists).where(inArray(lists.id, collabListIds));
  }
  const tCollabFetchEnd = performance.now();

  const userListsEnriched = rawUserLists.map(l => ({ ...l, isOwner: true, isCollaborator: false }));
  const collabListsEnriched = collabLists.map(l => ({ ...l, isOwner: false, isCollaborator: true, collabRole: collabListMap.get(l.id) }));

  // Combined owned + collaborator watch lists
  const combinedLists = [...userListsEnriched, ...collabListsEnriched];

  let filtered = combinedLists;
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(l =>
      l.name.toLowerCase().includes(q) ||
      (l.description && l.description.toLowerCase().includes(q))
    );
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const startIndex = (page - 1) * limit;
  const paginated = filtered.slice(startIndex, startIndex + limit);

  // Batch enrichment: Fetch all career pages & active jobs in 2 constant bulk queries
  const paginatedListIds = paginated.map(l => l.id);
  const tPaginatedPagesStart = performance.now();
  const allPaginatedPages = paginatedListIds.length > 0
    ? await db.select({ listId: listCareerPages.listId, careerPageId: listCareerPages.careerPageId }).from(listCareerPages).where(inArray(listCareerPages.listId, paginatedListIds))
    : [];
  const tPaginatedPagesEnd = performance.now();

  const pagesByListId = new Map<string, string[]>();
  allPaginatedPages.forEach(p => {
    const arr = pagesByListId.get(p.listId) || [];
    arr.push(p.careerPageId);
    pagesByListId.set(p.listId, arr);
  });

  const uniquePaginatedCareerPageIds = Array.from(new Set(allPaginatedPages.map(p => p.careerPageId)));
  const tPaginatedJobsStart = performance.now();
  
  // OPTIMIZED: Use SQL GROUP BY + COUNT aggregate instead of downloading all job records
  const jobCountByCareerPageId = new Map<string, number>();
  if (uniquePaginatedCareerPageIds.length > 0) {
    const groupedJobs = await db
      .select({
        careerPageId: jobs.careerPageId,
        jobCount: count(),
      })
      .from(jobs)
      .where(and(inArray(jobs.careerPageId, uniquePaginatedCareerPageIds), eq(jobs.status, 'active')))
      .groupBy(jobs.careerPageId);

    groupedJobs.forEach(g => {
      jobCountByCareerPageId.set(g.careerPageId, Number(g.jobCount));
    });
  }
  const tPaginatedJobsEnd = performance.now();

  const enriched = paginated.map(l => {
    const cPageIds = pagesByListId.get(l.id) || [];
    const jobCount = cPageIds.reduce((sum, cpId) => sum + (jobCountByCareerPageId.get(cpId) || 0), 0);
    return {
      ...l,
      companyCount: cPageIds.length,
      jobCount,
    };
  });

  // OPTIMIZED: Calculate unique stats using SQL COUNT DISTINCT and COUNT aggregates
  const tStatsStart = performance.now();
  const allUserListIds = combinedLists.map(l => l.id);
  let totalUniqueCompanies = 0;
  let totalActiveJobs = 0;

  if (allUserListIds.length > 0) {
    const [compRes] = await db
      .select({ uniqueCompanies: countDistinct(listCareerPages.careerPageId) })
      .from(listCareerPages)
      .where(inArray(listCareerPages.listId, allUserListIds));

    totalUniqueCompanies = Number(compRes?.uniqueCompanies || 0);

    if (totalUniqueCompanies > 0) {
      const userListPages = await db
        .select({ careerPageId: listCareerPages.careerPageId })
        .from(listCareerPages)
        .where(inArray(listCareerPages.listId, allUserListIds));

      const uniquePageIds = Array.from(new Set(userListPages.map(p => p.careerPageId)));

      if (uniquePageIds.length > 0) {
        const [jobsRes] = await db
          .select({ totalJobs: count() })
          .from(jobs)
          .where(and(inArray(jobs.careerPageId, uniquePageIds), eq(jobs.status, 'active')));
        
        totalActiveJobs = Number(jobsRes?.totalJobs || 0);
      }
    }
  }
  const tStatsEnd = performance.now();

  const tTotalEnd = performance.now();

  console.log(`[PERF /api/lists] Total: ${(tTotalEnd - tTotalStart).toFixed(2)}ms | Auth: ${(tAuthEnd - tAuthStart).toFixed(2)}ms | Lists+Collabs: ${(tListsCollabEnd - tListsCollabStart).toFixed(2)}ms | CollabFetch: ${(tCollabFetchEnd - tCollabFetchStart).toFixed(2)}ms | PaginatedPages: ${(tPaginatedPagesEnd - tPaginatedPagesStart).toFixed(2)}ms | PaginatedJobs(Grouped): ${(tPaginatedJobsEnd - tPaginatedJobsStart).toFixed(2)}ms | Stats(Aggregate): ${(tStatsEnd - tStatsStart).toFixed(2)}ms`);

  return NextResponse.json({
    lists: enriched,
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
      const userLists = await db.select().from(lists).where(eq(lists.userId, user.userId));
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
