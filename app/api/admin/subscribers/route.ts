import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users, listSubscriptions, emailApprovals, sentEmailLogs } from '@/lib/db/schema';
import { eq, inArray, desc, sql, count } from 'drizzle-orm';
import { getTodaySentEmailCount, ensureSentEmailLogsTable } from '@/lib/email/brevo';

export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  await ensureSentEmailLogsTable();

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search')?.trim().toLowerCase();
  const frequencyFilter = searchParams.get('frequency');
  const groupFilter = searchParams.get('group');
  const exemptFilter = searchParams.get('exempt');
  const subscriptionFilter = searchParams.get('subscription'); // 'active_subscribed' | 'zero_watched' | 'all'
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 10));

  // 1. Fetch all users with email notifications enabled
  const allSubscribers = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    emailVerified: users.emailVerified,
    role: users.role,
    isBlocked: users.isBlocked,
    emailNotificationsEnabled: users.emailNotificationsEnabled,
    notificationPreference: users.notificationPreference,
    frequencyEnforcementExempt: users.frequencyEnforcementExempt,
    quotaExempt: users.quotaExempt,
    dispatchGroup: users.dispatchGroup,
    createdAt: users.createdAt,
  })
  .from(users)
  .orderBy(desc(users.createdAt));

  // 2. Fetch email approvals map
  const approvalsList = await db.select().from(emailApprovals);
  const approvalMap = new Map<string, string>();
  for (const app of approvalsList) {
    approvalMap.set(app.email.toLowerCase(), app.status);
  }

  // 3. Fetch list subscriptions counts per user
  const subCounts = await db.select({
    userId: listSubscriptions.userId,
    watchedCount: count(listSubscriptions.id),
  })
  .from(listSubscriptions)
  .groupBy(listSubscriptions.userId);

  const subCountMap = new Map<string, number>();
  for (const sc of subCounts) {
    subCountMap.set(sc.userId, Number(sc.watchedCount));
  }

  // 4. Fetch latest sent email log per user recipient
  const latestLogs = await db.select({
    recipientEmail: sentEmailLogs.recipientEmail,
    lastSentAt: sql<string>`MAX(${sentEmailLogs.createdAt})`,
  })
  .from(sentEmailLogs)
  .groupBy(sentEmailLogs.recipientEmail);

  const lastSentMap = new Map<string, string>();
  for (const l of latestLogs) {
    lastSentMap.set(l.recipientEmail.toLowerCase(), l.lastSentAt);
  }

  // Format recipient roster
  const fullRoster = allSubscribers.map(u => {
    const e = u.email.toLowerCase();
    const appStatus = approvalMap.get(e) || (u.emailVerified ? 'approved' : 'pending');
    return {
      ...u,
      approvalStatus: appStatus,
      watchedListsCount: subCountMap.get(u.id) || 0,
      lastSentAt: lastSentMap.get(e) || null,
    };
  });

  // Apply filters
  let filtered = fullRoster;

  if (search) {
    filtered = filtered.filter(u =>
      u.email.toLowerCase().includes(search) ||
      (u.name && u.name.toLowerCase().includes(search))
    );
  }

  if (frequencyFilter && frequencyFilter !== 'all') {
    filtered = filtered.filter(u => u.notificationPreference === frequencyFilter);
  }

  if (groupFilter && groupFilter !== 'all') {
    const gNum = Number(groupFilter);
    if (!isNaN(gNum)) {
      filtered = filtered.filter(u => u.dispatchGroup === gNum);
    }
  }

  if (exemptFilter && exemptFilter !== 'all') {
    if (exemptFilter === 'quota_exempt') filtered = filtered.filter(u => u.quotaExempt);
    if (exemptFilter === 'freq_exempt') filtered = filtered.filter(u => u.frequencyEnforcementExempt);
    if (exemptFilter === 'regular') filtered = filtered.filter(u => !u.quotaExempt && !u.frequencyEnforcementExempt);
  }

  if (subscriptionFilter && subscriptionFilter !== 'all') {
    if (subscriptionFilter === 'active_subscribed') {
      filtered = filtered.filter(u => u.watchedListsCount > 0 && u.emailNotificationsEnabled && !u.isBlocked);
    } else if (subscriptionFilter === 'zero_watched') {
      filtered = filtered.filter(u => u.watchedListsCount === 0);
    }
  }

  // Summary Metrics: Active Subscribers strictly require watchedListsCount > 0, notifications enabled, and not blocked!
  const totalSubscribers = fullRoster.length;
  const activeSubscribersList = fullRoster.filter(u => !u.isBlocked && u.emailNotificationsEnabled && u.watchedListsCount > 0);
  const activeSubscribers = activeSubscribersList.length;
  const zeroWatchedCount = fullRoster.filter(u => u.watchedListsCount === 0).length;
  const quotaExemptCount = fullRoster.filter(u => u.quotaExempt).length;
  const freqExemptCount = fullRoster.filter(u => u.frequencyEnforcementExempt).length;

  const instantCount = fullRoster.filter(u => u.notificationPreference === 'instant').length;
  const dailyCount = fullRoster.filter(u => u.notificationPreference === 'daily').length;
  const weeklyCount = fullRoster.filter(u => u.notificationPreference === 'weekly').length;

  // Cohort breakdown map (only for active subscribers watching at least 1 list)
  const cohortMap: Record<number, number> = {};
  activeSubscribersList.forEach(u => {
    cohortMap[u.dispatchGroup] = (cohortMap[u.dispatchGroup] || 0) + 1;
  });

  // Pagination
  const total = filtered.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const startIndex = (page - 1) * limit;
  const paginated = filtered.slice(startIndex, startIndex + limit);

  const todayStats = await getTodaySentEmailCount();

  return NextResponse.json({
    subscribers: paginated,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    },
    metrics: {
      totalSubscribers,
      activeSubscribers,
      quotaExemptCount,
      freqExemptCount,
      frequencies: {
        instant: instantCount,
        daily: dailyCount,
        weekly: weeklyCount,
      },
      cohortDistribution: cohortMap,
      todaySentStats: todayStats,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const body = await req.json();
  const { userIds, quotaExempt, frequencyEnforcementExempt, dispatchGroup } = body;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return NextResponse.json({ error: 'userIds array is required.' }, { status: 400 });
  }

  const updateFields: any = {};
  if (typeof quotaExempt === 'boolean') updateFields.quotaExempt = quotaExempt;
  if (typeof frequencyEnforcementExempt === 'boolean') updateFields.frequencyEnforcementExempt = frequencyEnforcementExempt;
  if (typeof dispatchGroup === 'number' && dispatchGroup >= 1) updateFields.dispatchGroup = Math.floor(dispatchGroup);

  if (Object.keys(updateFields).length === 0) {
    return NextResponse.json({ error: 'No valid update fields provided.' }, { status: 400 });
  }

  await db.update(users)
    .set(updateFields)
    .where(inArray(users.id, userIds));

  return NextResponse.json({
    success: true,
    updatedCount: userIds.length,
    updatedFields: updateFields,
  });
}
