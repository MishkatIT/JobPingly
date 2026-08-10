import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, listSubscriptions, listCareerPages, careerPages, users } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. Fetch user's subscriptions
  const subs = await db
    .select({
      subId: listSubscriptions.id,
      digestFrequency: listSubscriptions.digestFrequency,
      positiveKeywords: listSubscriptions.positiveKeywords,
      negativeKeywords: listSubscriptions.negativeKeywords,
      subscribedAt: listSubscriptions.createdAt,
      listId: lists.id,
      listName: lists.name,
      listSlug: lists.slug,
      listDescription: lists.description,
      listVisibility: lists.visibility,
      listUserId: lists.userId,
      curatorName: users.name,
      curatorEmail: users.email,
      curatorAvatarUrl: users.avatarUrl,
    })
    .from(listSubscriptions)
    .innerJoin(lists, eq(listSubscriptions.listId, lists.id))
    .leftJoin(users, eq(lists.userId, users.id))
    .where(eq(listSubscriptions.userId, user.userId));

  if (subs.length === 0) {
    return NextResponse.json({ subscriptions: [] });
  }

  // 2. Fetch company links for each subscribed list
  const listIds = subs.map((s) => s.listId);
  const listPages = await db.select().from(listCareerPages).where(inArray(listCareerPages.listId, listIds));
  const careerPageIds = Array.from(new Set(listPages.map((lp) => lp.careerPageId)));

  let careerPagesMap = new Map<string, any>();
  if (careerPageIds.length > 0) {
    const pageRecords = await db.select().from(careerPages).where(inArray(careerPages.id, careerPageIds));
    for (const cp of pageRecords) {
      careerPagesMap.set(cp.id, cp);
    }
  }

  const listPagesGroup = new Map<string, any[]>();
  for (const lp of listPages) {
    if (!listPagesGroup.has(lp.listId)) {
      listPagesGroup.set(lp.listId, []);
    }
    const cp = careerPagesMap.get(lp.careerPageId);
    if (cp) {
      listPagesGroup.get(lp.listId)!.push({ ...cp, isPausedInList: lp.isPaused });
    }
  }

  const formatted = subs.map((s) => {
    const attachedPages = listPagesGroup.get(s.listId) || [];
    return {
      subId: s.subId,
      listId: s.listId,
      name: s.listName,
      slug: s.listSlug,
      description: s.listDescription,
      visibility: s.listVisibility,
      digestFrequency: s.digestFrequency,
      positiveKeywords: s.positiveKeywords || [],
      negativeKeywords: s.negativeKeywords || [],
      subscribedAt: s.subscribedAt,
      curator: {
        id: s.listUserId,
        name: s.curatorName || 'Curator',
        email: s.curatorEmail || '',
        avatarUrl: s.curatorAvatarUrl || null,
      },
      isOwner: s.listUserId === user.userId,
      companyCount: attachedPages.length,
      careerPages: attachedPages,
    };
  });

  return NextResponse.json({ subscriptions: formatted });
}
