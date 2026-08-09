import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { lists, listCareerPages, careerPages, jobs, users } from '@/lib/db/schema';
import { isFeatureEnabled } from '@/lib/flags/check';
import { eq, and, inArray } from 'drizzle-orm';

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const publicEnabled = await isFeatureEnabled('public_lists.enabled', true);
  if (!publicEnabled) {
    return NextResponse.json({ error: 'Public watch lists are currently disabled by administrator.' }, { status: 403 });
  }

  const slug = params.slug;

  const [list] = await db.select({
    id: lists.id,
    name: lists.name,
    slug: lists.slug,
    description: lists.description,
    visibility: lists.visibility,
    createdAt: lists.createdAt,
    updatedAt: lists.updatedAt,
    userId: lists.userId,
    userName: users.name,
    userAvatarUrl: users.avatarUrl,
  })
  .from(lists)
  .leftJoin(users, eq(lists.userId, users.id))
  .where(and(eq(lists.slug, slug), eq(lists.visibility, 'public')));

  if (!list) {
    return NextResponse.json({ error: 'Public list not found.' }, { status: 404 });
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
