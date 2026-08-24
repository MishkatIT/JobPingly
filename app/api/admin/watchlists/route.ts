import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, users, listCareerPages, jobs } from '@/lib/db/schema';
import { eq, desc, inArray, count, and, or, ilike, isNull, isNotNull, sql } from 'drizzle-orm';

import { ensureAdminMasterWatchlist } from '@/lib/lists/admin-master';

// GET paginated watch lists for admin moderation pushed to PostgreSQL
export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  // Ensure Admin Private Master Watchlist exists and is auto-synced
  await ensureAdminMasterWatchlist(adminUser.userId);

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');
  const visibilityFilter = searchParams.get('visibility');
  const canonicalFilter = searchParams.get('canonical');
  const statusFilter = searchParams.get('status') || 'active'; // 'active' | 'deleted' | 'all'
  const userIdFilter = searchParams.get('userId');
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 10));

  const conditions = [];

  // Status Filter (active vs deleted/trash)
  if (statusFilter === 'active') {
    conditions.push(isNull(lists.deletedAt));
  } else if (statusFilter === 'deleted' || statusFilter === 'trash') {
    conditions.push(isNotNull(lists.deletedAt));
  }

  // Specific User Filter
  if (userIdFilter && userIdFilter.trim()) {
    const target = userIdFilter.trim().toLowerCase();
    conditions.push(
      or(
        eq(lists.userId, target),
        ilike(users.email, target)
      )
    );
  }

  // Visibility Filter
  if (visibilityFilter && visibilityFilter !== 'all') {
    conditions.push(eq(lists.visibility, visibilityFilter));
  }

  // Canonical Filter
  if (canonicalFilter && canonicalFilter !== 'all') {
    if (canonicalFilter === 'canonical') {
      conditions.push(eq(lists.isCanonical, true));
    } else if (canonicalFilter === 'non-canonical') {
      conditions.push(eq(lists.isCanonical, false));
    }
  }

  // General Search (name, description, slug, user name, user email, user ID)
  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    conditions.push(
      or(
        ilike(lists.name, s),
        ilike(lists.description, s),
        ilike(lists.slug, s),
        ilike(lists.userId, s),
        ilike(users.name, s),
        ilike(users.email, s)
      )
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRes, paginatedLists] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` })
      .from(lists)
      .leftJoin(users, eq(lists.userId, users.id))
      .where(whereClause),
    db.select({
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
        deletedAt: lists.deletedAt,
        createdAt: lists.createdAt,
        updatedAt: lists.updatedAt,
        userName: users.name,
        userEmail: users.email,
        userAvatarUrl: users.avatarUrl,
      })
      .from(lists)
      .leftJoin(users, eq(lists.userId, users.id))
      .where(whereClause)
      .orderBy(desc(lists.updatedAt))
      .limit(limit)
      .offset((page - 1) * limit),
  ]);

  const total = Number(totalRes[0]?.count || 0);
  const totalPages = Math.ceil(total / limit) || 1;

  // Batch fetch company counts & job counts for ONLY the paginated list slice
  const paginatedListIds = paginatedLists.map(l => l.id);
  const companyCountMap = new Map<string, number>();
  const jobCountMap = new Map<string, number>();

  if (paginatedListIds.length > 0) {
    const [companyCounts, jobCounts] = await Promise.all([
      db.select({
        listId: listCareerPages.listId,
        companyCount: count(listCareerPages.careerPageId),
      })
      .from(listCareerPages)
      .where(inArray(listCareerPages.listId, paginatedListIds))
      .groupBy(listCareerPages.listId),
      db.select({
        listId: listCareerPages.listId,
        jobCount: count(jobs.id),
      })
      .from(listCareerPages)
      .innerJoin(jobs, and(eq(jobs.careerPageId, listCareerPages.careerPageId), eq(jobs.status, 'active')))
      .where(inArray(listCareerPages.listId, paginatedListIds))
      .groupBy(listCareerPages.listId),
    ]);

    companyCounts.forEach(c => companyCountMap.set(c.listId, Number(c.companyCount)));
    jobCounts.forEach(j => jobCountMap.set(j.listId, Number(j.jobCount)));
  }

  const enrichedLists = paginatedLists.map(l => ({
    ...l,
    companyCount: companyCountMap.get(l.id) || 0,
    jobCount: jobCountMap.get(l.id) || 0,
  }));

  return NextResponse.json({
    lists: enrichedLists,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    },
  });
}
