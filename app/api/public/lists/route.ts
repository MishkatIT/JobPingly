import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { lists, listCareerPages, users, jobs } from '@/lib/db/schema';
import { isFeatureEnabled } from '@/lib/flags/check';
import { eq, inArray, and } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const publicEnabled = await isFeatureEnabled('public_lists.enabled', true);
  if (!publicEnabled) {
    return NextResponse.json({ error: 'Public lists directory is currently disabled by administrator.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 9));
  const search = searchParams.get('search') || '';

  const rawPublicLists = await db.select({
    id: lists.id,
    name: lists.name,
    slug: lists.slug,
    description: lists.description,
    createdAt: lists.createdAt,
    updatedAt: lists.updatedAt,
    userId: lists.userId,
    userName: users.name,
  })
  .from(lists)
  .leftJoin(users, eq(lists.userId, users.id))
  .where(eq(lists.visibility, 'public'));

  let filtered = rawPublicLists;
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

  const enriched = await Promise.all(paginated.map(async (l) => {
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

    return {
      ...l,
      companyCount: pages.length,
      jobCount,
    };
  }));

  return NextResponse.json({
    lists: enriched,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    },
  });
}
