import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, listCareerPages, careerPages, jobs, users, listCollaborators } from '@/lib/db/schema';
import { isFeatureEnabled } from '@/lib/flags/check';
import { eq, and, inArray } from 'drizzle-orm';

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const publicEnabled = await isFeatureEnabled('public_lists.enabled', true);
  if (!publicEnabled) {
    return NextResponse.json({ error: 'Public watch lists are currently disabled by administrator.' }, { status: 403 });
  }

  const slug = params.slug;
  const authUser = await getAuthUser(req);

  const [list] = await db.select({
    id: lists.id,
    name: lists.name,
    slug: lists.slug,
    description: lists.description,
    visibility: lists.visibility,
    isCanonical: lists.isCanonical,
    followerCount: lists.followerCount,
    createdAt: lists.createdAt,
    updatedAt: lists.updatedAt,
    userId: lists.userId,
    userName: users.name,
    userAvatarUrl: users.avatarUrl,
  })
  .from(lists)
  .leftJoin(users, eq(lists.userId, users.id))
  .where(eq(lists.slug, slug));

  if (!list) {
    return NextResponse.json({ error: 'Watch list not found.' }, { status: 404 });
  }

  // Authorization check for private lists
  if (list.visibility === 'private') {
    let isAuthorized = false;
    if (authUser) {
      if (authUser.role === 'admin' || authUser.userId === list.userId) {
        isAuthorized = true;
      } else {
        const [collab] = await db
          .select()
          .from(listCollaborators)
          .where(and(
            eq(listCollaborators.listId, list.id),
            eq(listCollaborators.userId, authUser.userId),
            eq(listCollaborators.status, 'accepted')
          ));
        if (collab) isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'This watch list is private. Only the curator, collaborators, or administrator can view it.' },
        { status: 403 }
      );
    }
  }

  const listPages = await db.select().from(listCareerPages).where(eq(listCareerPages.listId, list.id));
  const listPageMap = new Map(listPages.map(lp => [lp.careerPageId, lp]));
  const allPageIds = listPages.map(p => p.careerPageId);
  const activePageIdsForList = listPages.filter(p => !p.isPaused).map(p => p.careerPageId);

  const pagesPromise = allPageIds.length > 0
    ? db.select().from(careerPages).where(inArray(careerPages.id, allPageIds))
    : Promise.resolve([]);

  const jobsPromise = activePageIdsForList.length > 0
    ? db.select().from(jobs).where(and(inArray(jobs.careerPageId, activePageIdsForList), eq(jobs.status, 'active')))
    : Promise.resolve([]);

  const [pages, activeJobs] = await Promise.all([pagesPromise, jobsPromise]);

  const pagesWithListStatus = pages.map(p => ({
    ...p,
    isPaused: listPageMap.get(p.id)?.isPaused || false,
  }));

  const pageMap = new Map(pagesWithListStatus.map(p => [p.id, p]));
  const jobsWithCompany = activeJobs.map(j => {
    const parentPage = pageMap.get(j.careerPageId);
    return {
      ...j,
      companyName: parentPage?.companyName || (j.rawData as any)?.company || null,
    };
  });

  return NextResponse.json({
    list,
    pages: pagesWithListStatus,
    jobs: jobsWithCompany,
  });
}
