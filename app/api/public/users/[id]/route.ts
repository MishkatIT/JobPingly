import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { lists, listCareerPages, users, jobs } from '@/lib/db/schema';
import { isFeatureEnabled } from '@/lib/flags/check';
import { eq, and, inArray, count, isNull } from 'drizzle-orm';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const publicEnabled = await isFeatureEnabled('public_lists.enabled', true);
  if (!publicEnabled) {
    return NextResponse.json({ error: 'Public directory is currently disabled by administrator.' }, { status: 403 });
  }

  const userId = params.id;

  const [foundUser] = await db.select({
    id: users.id,
    name: users.name,
    avatarUrl: users.avatarUrl,
    socials: users.socials,
    createdAt: users.createdAt,
  })
  .from(users)
  .where(eq(users.id, userId));

  if (!foundUser) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  const userLists = await db.select({
    id: lists.id,
    name: lists.name,
    slug: lists.slug,
    description: lists.description,
    createdAt: lists.createdAt,
    updatedAt: lists.updatedAt,
  })
  .from(lists)
  .where(and(eq(lists.userId, userId), eq(lists.visibility, 'public'), isNull(lists.deletedAt)));

  const userListIds = userLists.map(l => l.id);

  // Bulk query all list career page links across user's public lists (No N+1)
  const allPages = userListIds.length > 0
    ? await db.select({ listId: listCareerPages.listId, careerPageId: listCareerPages.careerPageId })
        .from(listCareerPages)
        .where(inArray(listCareerPages.listId, userListIds))
    : [];

  const pagesByListId = new Map<string, string[]>();
  allPages.forEach(p => {
    const arr = pagesByListId.get(p.listId) || [];
    arr.push(p.careerPageId);
    pagesByListId.set(p.listId, arr);
  });

  const uniqueCareerPageIds = Array.from(new Set(allPages.map(p => p.careerPageId)));
  const jobCountByCareerPageId = new Map<string, number>();

  // Bulk aggregate active job counts grouped by career page ID in SQL
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
      jobCountByCareerPageId.set(g.careerPageId, Number(g.jobCount));
    });
  }

  let totalActiveJobs = 0;
  const enrichedLists = userLists.map(l => {
    const cPageIds = pagesByListId.get(l.id) || [];
    const listJobCount = cPageIds.reduce((sum, cpId) => sum + (jobCountByCareerPageId.get(cpId) || 0), 0);
    totalActiveJobs += listJobCount;

    return {
      ...l,
      companyCount: cPageIds.length,
      jobCount: listJobCount,
    };
  });

  return NextResponse.json({
    user: foundUser,
    publicLists: enrichedLists,
    stats: {
      totalLists: enrichedLists.length,
      totalCompanies: uniqueCareerPageIds.length,
      totalActiveJobs,
    },
  });
}
