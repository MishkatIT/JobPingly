import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, listCareerPages, listSubscriptions } from '@/lib/db/schema';
import { checkListRedundancy } from '@/lib/lists/anti-redundancy';
import { eq, and } from 'drizzle-orm';

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. Fetch original list
  const [originalList] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.slug, params.slug), eq(lists.visibility, 'public')));

  if (!originalList) {
    return NextResponse.json({ error: 'Original public list not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const targetVisibility = body.visibility === 'public' ? 'public' : 'private';

  // 2. Fetch original career pages
  const originalPages = await db
    .select({ careerPageId: listCareerPages.careerPageId })
    .from(listCareerPages)
    .where(eq(listCareerPages.listId, originalList.id));

  const pageIds = originalPages.map((p) => p.careerPageId);

  // 3. Anti-Redundancy check if trying to publish directly as public
  let isCanonical = true;
  let effectiveVisibility = targetVisibility;
  let redundancyInfo = null;

  if (targetVisibility === 'public') {
    const check = await checkListRedundancy(pageIds);
    if (check.isDuplicate) {
      isCanonical = false;
      redundancyInfo = check;
    }
  } else {
    isCanonical = false;
  }

  // 4. Generate unique slug for the fork
  const baseSlug = `${originalList.slug}-fork-${Math.floor(1000 + Math.random() * 9000)}`;

  const [newList] = await db
    .insert(lists)
    .values({
      userId: user.userId,
      name: body.name || `${originalList.name} (Fork)`,
      slug: baseSlug,
      description: originalList.description,
      visibility: effectiveVisibility,
      parentListId: originalList.id,
      isCanonical,
      followerCount: 1,
      contributionCount: 0,
    })
    .returning();

  // 5. Copy career page junction links
  if (pageIds.length > 0) {
    await db.insert(listCareerPages).values(
      pageIds.map((cId) => ({
        listId: newList.id,
        careerPageId: cId,
      }))
    );
  }

  // 6. Auto-subscribe forking user for instant email alerts
  await db.insert(listSubscriptions).values({
    userId: user.userId,
    listId: newList.id,
    digestFrequency: 'instant',
  }).catch(() => null);

  return NextResponse.json({
    success: true,
    message: 'List successfully forked!',
    list: newList,
    redundancyInfo,
  });
}
