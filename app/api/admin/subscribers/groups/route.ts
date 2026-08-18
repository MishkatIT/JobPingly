import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users, listSubscriptions } from '@/lib/db/schema';
import { eq, asc, inArray, count, and } from 'drizzle-orm';
import { ensureSentEmailLogsTable } from '@/lib/email/brevo';

export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  await ensureSentEmailLogsTable();

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

  const groupDistribution: Record<number, number> = {};

  // Rebalance round-robin modulo cycleDays
  for (let i = 0; i < targetUsers.length; i++) {
    const assignedGroup = (i % cycleDays) + 1;
    const uId = targetUsers[i].id;

    await db.update(users)
      .set({ dispatchGroup: assignedGroup })
      .where(eq(users.id, uId));

    groupDistribution[assignedGroup] = (groupDistribution[assignedGroup] || 0) + 1;
  }

  return NextResponse.json({
    success: true,
    rebalancedCount: targetUsers.length,
    cycleDays,
    groupDistribution,
  });
}
