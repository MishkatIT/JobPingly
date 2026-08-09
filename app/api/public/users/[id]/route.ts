import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { lists, listCareerPages, users, jobs } from '@/lib/db/schema';
import { isFeatureEnabled } from '@/lib/flags/check';
import { eq, and, inArray } from 'drizzle-orm';

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
  .where(and(eq(lists.userId, userId), eq(lists.visibility, 'public')));

  let totalCompanies = 0;
  let totalActiveJobs = 0;

  const enrichedLists = await Promise.all(userLists.map(async (l) => {
    const pages = await db.select().from(listCareerPages).where(eq(listCareerPages.listId, l.id));
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

    totalCompanies += pages.length;
    totalActiveJobs += jobCount;

    return {
      ...l,
      companyCount: pages.length,
      jobCount,
    };
  }));

  return NextResponse.json({
    user: foundUser,
    publicLists: enrichedLists,
    stats: {
      totalLists: enrichedLists.length,
      totalCompanies,
      totalActiveJobs,
    },
  });
}
