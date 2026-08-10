import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users, lists, listSubscriptions, listCareerPages, careerPages, emailApprovals } from '@/lib/db/schema';
import { eq, inArray, or } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const emailInput = searchParams.get('email')?.trim().toLowerCase();
  const userIdInput = searchParams.get('userId')?.trim();

  if (!emailInput && !userIdInput) {
    return NextResponse.json({ error: 'Either email or userId query parameter is required.' }, { status: 400 });
  }

  // Find user account or approval record
  let targetUser: any = null;
  if (userIdInput) {
    [targetUser] = await db.select().from(users).where(eq(users.id, userIdInput));
  } else if (emailInput) {
    [targetUser] = await db.select().from(users).where(eq(users.email, emailInput));
  }

  const effectiveEmail = targetUser?.email || emailInput;
  const effectiveUserId = targetUser?.id || null;

  // 1. Fetch Owned Lists (created by user if user account exists)
  const ownedLists = effectiveUserId
    ? await db.select().from(lists).where(eq(lists.userId, effectiveUserId))
    : [];

  // 2. Fetch Subscribed Lists (followed by user)
  const subscriptions = effectiveUserId
    ? await db.select({
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
      })
      .from(listSubscriptions)
      .innerJoin(lists, eq(listSubscriptions.listId, lists.id))
      .where(eq(listSubscriptions.userId, effectiveUserId))
    : [];

  // Combine list IDs to fetch all associated career page URLs
  const allListIds = Array.from(new Set([
    ...ownedLists.map(l => l.id),
    ...subscriptions.map(s => s.listId),
  ]));

  let listPagesMap = new Map<string, any[]>();
  let careerPagesMap = new Map<string, any>();
  const allCareerPageIdsSet = new Set<string>();

  if (allListIds.length > 0) {
    const listPages = await db.select().from(listCareerPages).where(inArray(listCareerPages.listId, allListIds));
    for (const lp of listPages) {
      allCareerPageIdsSet.add(lp.careerPageId);
      if (!listPagesMap.has(lp.listId)) {
        listPagesMap.set(lp.listId, []);
      }
      listPagesMap.get(lp.listId)!.push(lp);
    }

    const pageIds = Array.from(allCareerPageIdsSet);
    if (pageIds.length > 0) {
      const pageRecords = await db.select().from(careerPages).where(inArray(careerPages.id, pageIds));
      for (const p of pageRecords) {
        careerPagesMap.set(p.id, p);
      }
    }
  }

  // Format Owned Lists with URLs
  const formattedOwnedLists = ownedLists.map(l => {
    const lPages = listPagesMap.get(l.id) || [];
    const attachedPages = lPages.map(lp => ({
      ...careerPagesMap.get(lp.careerPageId),
      isPausedInList: lp.isPaused,
    })).filter(p => p.url);

    return {
      id: l.id,
      name: l.name,
      slug: l.slug,
      description: l.description,
      visibility: l.visibility,
      isCanonical: l.isCanonical,
      createdAt: l.createdAt,
      type: 'owned',
      careerPages: attachedPages,
    };
  });

  // Format Subscribed Lists with URLs
  const formattedSubscribedLists = subscriptions.map(s => {
    const lPages = listPagesMap.get(s.listId) || [];
    const attachedPages = lPages.map(lp => ({
      ...careerPagesMap.get(lp.careerPageId),
      isPausedInList: lp.isPaused,
    })).filter(p => p.url);

    return {
      id: s.listId,
      subId: s.subId,
      name: s.listName,
      slug: s.listSlug,
      description: s.listDescription,
      visibility: s.listVisibility,
      digestFrequency: s.digestFrequency,
      positiveKeywords: s.positiveKeywords || [],
      negativeKeywords: s.negativeKeywords || [],
      subscribedAt: s.subscribedAt,
      type: 'subscribed',
      careerPages: attachedPages,
    };
  });

  // Unique URLs summary
  const allUniquePageMap = new Map<string, any>();
  [...formattedOwnedLists, ...formattedSubscribedLists].forEach(l => {
    l.careerPages.forEach(cp => {
      if (cp.url && !allUniquePageMap.has(cp.url)) {
        allUniquePageMap.set(cp.url, cp);
      }
    });
  });

  const uniqueUrls = Array.from(allUniquePageMap.values());

  return NextResponse.json({
    email: effectiveEmail,
    userId: effectiveUserId,
    userName: targetUser?.name || null,
    ownedListsCount: formattedOwnedLists.length,
    subscribedListsCount: formattedSubscribedLists.length,
    totalListsCount: formattedOwnedLists.length + formattedSubscribedLists.length,
    totalUniqueUrlsCount: uniqueUrls.length,
    ownedLists: formattedOwnedLists,
    subscribedLists: formattedSubscribedLists,
    uniqueUrls,
  });
}
