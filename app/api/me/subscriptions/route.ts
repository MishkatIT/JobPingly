import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, listSubscriptions, listCareerPages, careerPages, users } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const tTotalStart = performance.now();

  const tAuthStart = performance.now();
  const user = await getAuthUser(req);
  const tAuthEnd = performance.now();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. Fetch user's subscriptions
  const tSubsStart = performance.now();
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
  const tSubsEnd = performance.now();

  if (subs.length === 0) {
    const tTotalEnd = performance.now();
    console.log(`[PERF /api/me/subscriptions] Total: ${(tTotalEnd - tTotalStart).toFixed(2)}ms | Auth: ${(tAuthEnd - tAuthStart).toFixed(2)}ms | Subs: ${(tSubsEnd - tSubsStart).toFixed(2)}ms`);
    return NextResponse.json({ subscriptions: [] });
  }

  // 2. Fetch company links for each subscribed list (Single innerJoin query)
  const tPagesStart = performance.now();
  const listIds = subs.map((s) => s.listId);
  const pageRecords = listIds.length > 0
    ? await db
        .select({
          listId: listCareerPages.listId,
          isPaused: listCareerPages.isPaused,
          careerPage: careerPages,
        })
        .from(listCareerPages)
        .innerJoin(careerPages, eq(listCareerPages.careerPageId, careerPages.id))
        .where(inArray(listCareerPages.listId, listIds))
    : [];
  const tPagesEnd = performance.now();

  const listPagesGroup = new Map<string, any[]>();
  for (const pr of pageRecords) {
    if (!listPagesGroup.has(pr.listId)) {
      listPagesGroup.set(pr.listId, []);
    }
    listPagesGroup.get(pr.listId)!.push({ ...pr.careerPage, isPausedInList: pr.isPaused });
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

  const tTotalEnd = performance.now();
  console.log(`[PERF /api/me/subscriptions] Total: ${(tTotalEnd - tTotalStart).toFixed(2)}ms | Auth: ${(tAuthEnd - tAuthStart).toFixed(2)}ms | Subs: ${(tSubsEnd - tSubsStart).toFixed(2)}ms | Pages: ${(tPagesEnd - tPagesStart).toFixed(2)}ms`);

  return NextResponse.json({ subscriptions: formatted });
}
