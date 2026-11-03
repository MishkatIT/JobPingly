import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, listSubscriptions, listCollaborators } from '@/lib/db/schema';
import { eq, and, sql, isNull } from 'drizzle-orm';
import { INHERIT_FREQUENCY, isSupportedFrequency, normalizeFrequencyValue } from '@/lib/utils/frequency';

// Helper to check authorization for private lists
async function getAuthorizedList(slug: string, userId?: string, isAdmin?: boolean) {
  const [list] = await db.select().from(lists).where(and(eq(lists.slug, slug), isNull(lists.deletedAt)));
  if (!list) return null;
  if (list.visibility === 'public') return list;

  if (userId) {
    if (isAdmin || list.userId === userId) return list;
    const [collab] = await db.select().from(listCollaborators).where(and(
      eq(listCollaborators.listId, list.id),
      eq(listCollaborators.userId, userId),
      eq(listCollaborators.status, 'accepted')
    ));
    if (collab) return list;
  }

  return null;
}

// GET current user's follow status for a list
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ following: false });
  }

  const list = await getAuthorizedList(params.slug, user.userId, user.role === 'admin');
  if (!list) {
    return NextResponse.json({ error: 'Watch list not found or unauthorized' }, { status: 404 });
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

  const list = await getAuthorizedList(params.slug, user.userId, user.role === 'admin');
  if (!list) {
    return NextResponse.json({ error: 'Watch list not found or unauthorized' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { action, positiveKeywords, negativeKeywords, digestFrequency } = body;

  // 'inherit' means "use my account digest preference" and is the default.
  let requestedFrequency: string | undefined;
  if (digestFrequency !== undefined && digestFrequency !== null && String(digestFrequency).trim().length > 0) {
    const candidate = String(digestFrequency).trim();
    if (!isSupportedFrequency(candidate, { allowInherit: true })) {
      return NextResponse.json(
        { error: `Unsupported digest frequency '${candidate}'.` },
        { status: 400 },
      );
    }
    requestedFrequency = candidate === INHERIT_FREQUENCY ? INHERIT_FREQUENCY : normalizeFrequencyValue(candidate);
  }

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
        digestFrequency: requestedFrequency || existingSub.digestFrequency,
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
        digestFrequency: requestedFrequency || INHERIT_FREQUENCY,
      })
      .returning();

    await db
      .update(lists)
      .set({ followerCount: sql`${lists.followerCount} + 1` })
      .where(eq(lists.id, list.id));

    return NextResponse.json({ success: true, following: true, subscription: newSub });
  }
}
