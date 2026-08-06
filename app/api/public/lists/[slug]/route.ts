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
    userName: users.name,
  })
  .from(lists)
  .leftJoin(users, eq(lists.userId, users.id))
  .where(and(eq(lists.slug, slug), eq(lists.visibility, 'public')));

  if (!list) {
    return NextResponse.json({ error: 'Public list not found.' }, { status: 404 });
  }

  const listPages = await db.select().from(listCareerPages).where(eq(listCareerPages.listId, list.id));
  const pageIds = listPages.map(p => p.careerPageId);

  const pages = pageIds.length > 0
    ? await db.select().from(careerPages).where(inArray(careerPages.id, pageIds))
    : [];

  const activeJobs = pageIds.length > 0
    ? await db.select().from(jobs).where(and(inArray(jobs.careerPageId, pageIds), eq(jobs.status, 'active')))
    : [];

  return NextResponse.json({
    list,
    pages,
    jobs: activeJobs,
  });
}
