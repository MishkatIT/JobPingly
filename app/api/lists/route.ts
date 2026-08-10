import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, listCareerPages, jobs, listSubscriptions } from '@/lib/db/schema';
import { isFeatureEnabled } from '@/lib/flags/check';
import { eq, inArray, and } from 'drizzle-orm';

import { listCollaborators } from '@/lib/db/schema';

// GET user lists with backend pagination + search
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 9));
  const search = searchParams.get('search') || '';

  // Fetch owned lists & accepted collaborator invitations in parallel
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

  const collabListIds = collabRecords.map(c => c.listId);
  const collabListMap = new Map(collabRecords.map(c => [c.listId, c.role]));

  let collabLists: any[] = [];
  if (collabListIds.length > 0) {
    collabLists = await db.select().from(lists).where(inArray(lists.id, collabListIds));
  }

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
  const allPaginatedPages = paginatedListIds.length > 0
    ? await db.select().from(listCareerPages).where(inArray(listCareerPages.listId, paginatedListIds))
    : [];

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
    return {
      ...l,
      companyCount: cPageIds.length,
      jobCount,
    };
  });

  // Calculate unique stats across all user lists
  const allUserListIds = combinedLists.map(l => l.id);
  let totalUniqueCompanies = 0;
  let totalActiveJobs = 0;

  if (allUserListIds.length > 0) {
    const allUserListPages = await db
      .select({ careerPageId: listCareerPages.careerPageId })
      .from(listCareerPages)
      .where(inArray(listCareerPages.listId, allUserListIds));

    const uniquePageIds = Array.from(new Set(allUserListPages.map(p => p.careerPageId)));
    totalUniqueCompanies = uniquePageIds.length;

    if (uniquePageIds.length > 0) {
      const activeUserJobs = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(inArray(jobs.careerPageId, uniquePageIds), eq(jobs.status, 'active')));
      totalActiveJobs = activeUserJobs.length;
    }
  }

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
