import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, invalidateUserSessionCache } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users, listSubscriptions } from '@/lib/db/schema';
import { eq, asc, inArray, count, and } from 'drizzle-orm';
import { redisDel } from '@/lib/redis/client';

export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const body = await req.json();
  const cycleDays = Math.max(1, Math.min(30, Number(body.cycleDays) || 3));
  const userIds: string[] = Array.isArray(body.userIds) ? body.userIds : [];

  let targetUsers: { id: string }[] = [];

  if (userIds.length > 0) {
    targetUsers = userIds.map(id => ({ id }));
  } else {
    // Fetch all active subscribers who watch AT LEAST 1 list, are not blocked, and have notifications enabled
    const subCounts = await db.select({
      userId: listSubscriptions.userId,
      watchedCount: count(listSubscriptions.id),
    })
    .from(listSubscriptions)
    .groupBy(listSubscriptions.userId);

    const activeUserIds = subCounts.map(s => s.userId);

    if (activeUserIds.length === 0) {
      targetUsers = [];
    } else {
      targetUsers = await db.select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.emailNotificationsEnabled, true),
            eq(users.isBlocked, false),
            inArray(users.id, activeUserIds)
          )
        )
        .orderBy(asc(users.createdAt));
    }
  }

  if (targetUsers.length === 0) {
    return NextResponse.json({ error: 'No subscribers available to rebalance.' }, { status: 400 });
  }

  // Group user IDs by assigned dispatch group (1..cycleDays) to perform bulk batch UPDATE queries
  const groupToUserIdsMap = new Map<number, string[]>();
  for (let i = 0; i < targetUsers.length; i++) {
    const assignedGroup = (i % cycleDays) + 1;
    const uId = targetUsers[i].id;
    if (!groupToUserIdsMap.has(assignedGroup)) {
      groupToUserIdsMap.set(assignedGroup, []);
    }
    groupToUserIdsMap.get(assignedGroup)!.push(uId);
  }

  const groupDistribution: Record<number, number> = {};
  const updatePromises: Promise<any>[] = [];

  for (const [groupNum, ids] of groupToUserIdsMap.entries()) {
    groupDistribution[groupNum] = ids.length;
    updatePromises.push(
      db.update(users)
        .set({ dispatchGroup: groupNum })
        .where(inArray(users.id, ids))
    );
  }

  await Promise.all(updatePromises);

  // Invalidate Redis caches
  redisDel('admin:subscribers:summary_metrics').catch(() => {});
  Promise.all(targetUsers.map(u => invalidateUserSessionCache(u.id))).catch(() => {});

  return NextResponse.json({
    success: true,
    rebalancedCount: targetUsers.length,
    cycleDays,
    groupDistribution,
  });
}
