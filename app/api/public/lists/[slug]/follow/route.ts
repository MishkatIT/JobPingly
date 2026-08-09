import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, listSubscriptions } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

// GET current user's follow status for a list
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ following: false });
  }

  const [list] = await db.select().from(lists).where(and(eq(lists.slug, params.slug), eq(lists.visibility, 'public')));
  if (!list) {
    return NextResponse.json({ error: 'Public list not found' }, { status: 404 });
  }

  const [sub] = await db
    .select()
    .from(listSubscriptions)
    .where(and(eq(listSubscriptions.userId, user.userId), eq(listSubscriptions.listId, list.id)));

  return NextResponse.json({
    following: !!sub,
    subscription: sub || null,
  });
}

// POST toggle follow or update alert settings
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [list] = await db.select().from(lists).where(and(eq(lists.slug, params.slug), eq(lists.visibility, 'public')));
  if (!list) {
    return NextResponse.json({ error: 'Public list not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { action, positiveKeywords, negativeKeywords, digestFrequency } = body;

  const [existingSub] = await db
    .select()
    .from(listSubscriptions)
    .where(and(eq(listSubscriptions.userId, user.userId), eq(listSubscriptions.listId, list.id)));

  if (action === 'unfollow') {
    if (existingSub) {
      await db.delete(listSubscriptions).where(eq(listSubscriptions.id, existingSub.id));
      await db
        .update(lists)
        .set({ followerCount: sql`GREATEST(0, ${lists.followerCount} - 1)` })
        .where(eq(lists.id, list.id));
    }
    return NextResponse.json({ success: true, following: false });
  }

  // Follow or update alert settings
  if (existingSub) {
    const [updated] = await db
      .update(listSubscriptions)
      .set({
        positiveKeywords: positiveKeywords !== undefined ? positiveKeywords : existingSub.positiveKeywords,
        negativeKeywords: negativeKeywords !== undefined ? negativeKeywords : existingSub.negativeKeywords,
        digestFrequency: digestFrequency || existingSub.digestFrequency,
      })
      .where(eq(listSubscriptions.id, existingSub.id))
      .returning();

    return NextResponse.json({ success: true, following: true, subscription: updated });
  } else {
    const [newSub] = await db
      .insert(listSubscriptions)
      .values({
        userId: user.userId,
        listId: list.id,
        positiveKeywords: positiveKeywords || [],
        negativeKeywords: negativeKeywords || [],
        digestFrequency: digestFrequency || 'instant',
      })
      .returning();

    await db
      .update(lists)
      .set({ followerCount: sql`${lists.followerCount} + 1` })
      .where(eq(lists.id, list.id));

    return NextResponse.json({ success: true, following: true, subscription: newSub });
  }
}
