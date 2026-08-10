import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, users, listCareerPages, jobs } from '@/lib/db/schema';
import { eq, desc, inArray, count } from 'drizzle-orm';

// GET paginated watch lists for admin moderation
export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');
  const visibilityFilter = searchParams.get('visibility');
  const canonicalFilter = searchParams.get('canonical');
  const userIdFilter = searchParams.get('userId');
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 10));

  const allLists = await db
    .select({
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
      userName: users.name,
      userEmail: users.email,
      userAvatarUrl: users.avatarUrl,
    })
    .from(lists)
    .leftJoin(users, eq(lists.userId, users.id))
    .orderBy(desc(lists.createdAt));

  let results = [...allLists];

  // Specific User Filter
  if (userIdFilter && userIdFilter.trim()) {
    const target = userIdFilter.trim().toLowerCase();
    results = results.filter(l =>
      l.userId.toLowerCase() === target ||
      (l.userEmail && l.userEmail.toLowerCase() === target)
    );
  }

  // Visibility Filter
  if (visibilityFilter && visibilityFilter !== 'all') {
    results = results.filter(l => l.visibility === visibilityFilter);
  }

  // Canonical Filter
  if (canonicalFilter && canonicalFilter !== 'all') {
    if (canonicalFilter === 'canonical') {
      results = results.filter(l => l.isCanonical === true);
    } else if (canonicalFilter === 'non-canonical') {
      results = results.filter(l => l.isCanonical === false);
    }
  }

  // General Search (name, description, slug, user name, user email, user ID)
  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    results = results.filter(l =>
      l.name.toLowerCase().includes(s) ||
      (l.description && l.description.toLowerCase().includes(s)) ||
      l.slug.toLowerCase().includes(s) ||
      l.userId.toLowerCase().includes(s) ||
      (l.userName && l.userName.toLowerCase().includes(s)) ||
      (l.userEmail && l.userEmail.toLowerCase().includes(s))
    );
  }

  const total = results.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const startIndex = (page - 1) * limit;
  const paginatedLists = results.slice(startIndex, startIndex + limit);

  // Fetch company counts & job counts for the current page slice
  const enrichedLists = await Promise.all(
    paginatedLists.map(async (l) => {
      const pageRows = await db
        .select({ careerPageId: listCareerPages.careerPageId })
        .from(listCareerPages)
        .where(eq(listCareerPages.listId, l.id));

      const companyCount = pageRows.length;
      let jobCount = 0;

      if (companyCount > 0) {
        const pageIds = pageRows.map(r => r.careerPageId);
        const [jobCountRes] = await db
          .select({ count: count() })
          .from(jobs)
          .where(inArray(jobs.careerPageId, pageIds));
        jobCount = Number(jobCountRes?.count || 0);
      }

      return {
        ...l,
        companyCount,
        jobCount,
      };
    })
  );

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
