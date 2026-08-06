import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, listCareerPages, jobs } from '@/lib/db/schema';
import { isFeatureEnabled } from '@/lib/flags/check';
import { eq, inArray, and } from 'drizzle-orm';

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

  const rawUserLists = await db.select().from(lists).where(eq(lists.userId, user.userId));

  let filtered = rawUserLists;
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

  // Enrich with company count & active job count
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
  }).returning();

  return NextResponse.json({ list: newList });
}
