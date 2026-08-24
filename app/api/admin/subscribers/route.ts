import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, invalidateUserSessionCache } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users, listSubscriptions, emailApprovals, sentEmailLogs } from '@/lib/db/schema';
import { eq, inArray, desc, sql, count, and } from 'drizzle-orm';
import { getTodaySentEmailCount } from '@/lib/email/brevo';
import { redisGet, redisSet, redisDel } from '@/lib/redis/client';

const METRICS_CACHE_KEY = 'admin:subscribers:summary_metrics';

export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search')?.trim();
  const frequencyFilter = searchParams.get('frequency');
  const groupFilter = searchParams.get('group');
  const exemptFilter = searchParams.get('exempt');
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 10));

  const conditions = [];

  if (search) {
    const s = `%${search}%`;
    conditions.push(
      sql`(${users.email} ILIKE ${s} OR ${users.name} ILIKE ${s})`
    );
  }

  if (frequencyFilter && frequencyFilter !== 'all') {
    conditions.push(eq(users.notificationPreference, frequencyFilter));
  }

  if (groupFilter && groupFilter !== 'all') {
    const gNum = Number(groupFilter);
    if (!isNaN(gNum)) {
      conditions.push(eq(users.dispatchGroup, gNum));
    }
  }

  if (exemptFilter && exemptFilter !== 'all') {
    if (exemptFilter === 'quota_exempt') conditions.push(eq(users.quotaExempt, true));
    if (exemptFilter === 'freq_exempt') conditions.push(eq(users.frequencyEnforcementExempt, true));
    if (exemptFilter === 'regular') {
      conditions.push(and(eq(users.quotaExempt, false), eq(users.frequencyEnforcementExempt, false)));
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRes, paginatedUsers] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(users).where(whereClause),
    db.select({
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
    .where(whereClause)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset((page - 1) * limit),
  ]);

  const total = Number(totalRes[0]?.count || 0);
  const totalPages = Math.ceil(total / limit) || 1;

  // Enrich ONLY the paginated user slice
  const userIds = paginatedUsers.map(u => u.id);
  const userEmails = paginatedUsers.map(u => u.email.toLowerCase());

  const [approvalsList, subCounts, latestLogs] = await Promise.all([
    userEmails.length > 0
      ? db.select({ email: emailApprovals.email, status: emailApprovals.status }).from(emailApprovals).where(inArray(emailApprovals.email, userEmails))
      : Promise.resolve([]),
    userIds.length > 0
      ? db.select({ userId: listSubscriptions.userId, watchedCount: count(listSubscriptions.id) }).from(listSubscriptions).where(inArray(listSubscriptions.userId, userIds)).groupBy(listSubscriptions.userId)
      : Promise.resolve([]),
    userEmails.length > 0
      ? db.select({ recipientEmail: sentEmailLogs.recipientEmail, lastSentAt: sql<string>`MAX(${sentEmailLogs.createdAt})` }).from(sentEmailLogs).where(inArray(sentEmailLogs.recipientEmail, userEmails)).groupBy(sentEmailLogs.recipientEmail)
      : Promise.resolve([]),
  ]);

  const approvalMap = new Map(approvalsList.map(a => [a.email.toLowerCase(), a.status]));
  const subCountMap = new Map(subCounts.map(sc => [sc.userId, Number(sc.watchedCount)]));
  const lastSentMap = new Map(latestLogs.map(l => [l.recipientEmail.toLowerCase(), l.lastSentAt]));

  const paginated = paginatedUsers.map(u => {
    const e = u.email.toLowerCase();
    const appStatus = approvalMap.get(e) || (u.emailVerified ? 'approved' : 'pending');
    return {
      ...u,
      approvalStatus: appStatus,
      watchedListsCount: subCountMap.get(u.id) || 0,
      lastSentAt: lastSentMap.get(e) || null,
    };
  });

  // Summary Metrics (Consolidated Single SQL Query + Redis Cache)
  let cachedMetrics = await redisGet<any>(METRICS_CACHE_KEY);

  if (!cachedMetrics) {
    const [summaryRes, todayStats] = await Promise.all([
      db.select({
        totalSubscribers: sql<number>`COUNT(*)::int`,
        quotaExemptCount: sql<number>`COUNT(*) FILTER (WHERE ${users.quotaExempt} = true)::int`,
        freqExemptCount: sql<number>`COUNT(*) FILTER (WHERE ${users.frequencyEnforcementExempt} = true)::int`,
        instantCount: sql<number>`COUNT(*) FILTER (WHERE ${users.notificationPreference} = 'instant')::int`,
        dailyCount: sql<number>`COUNT(*) FILTER (WHERE ${users.notificationPreference} = 'daily')::int`,
        weeklyCount: sql<number>`COUNT(*) FILTER (WHERE ${users.notificationPreference} = 'weekly')::int`,
      }).from(users),
      getTodaySentEmailCount(),
    ]);

    const row = summaryRes[0] || {};
    cachedMetrics = {
      totalSubscribers: Number(row.totalSubscribers || 0),
      quotaExemptCount: Number(row.quotaExemptCount || 0),
      freqExemptCount: Number(row.freqExemptCount || 0),
      frequencies: {
        instant: Number(row.instantCount || 0),
        daily: Number(row.dailyCount || 0),
        weekly: Number(row.weeklyCount || 0),
      },
      todaySentStats: todayStats,
    };

    redisSet(METRICS_CACHE_KEY, cachedMetrics, 15).catch(() => {});
  }

  return NextResponse.json(
    {
      subscribers: paginated,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages,
      },
      metrics: {
        ...cachedMetrics,
        activeSubscribers: total,
      },
    },
    {
      headers: {
        'Cache-Control': 's-maxage=10, stale-while-revalidate=29',
      },
    }
  );
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

  // Invalidate Redis caches
  redisDel(METRICS_CACHE_KEY).catch(() => {});
  Promise.all(userIds.map(id => invalidateUserSessionCache(id))).catch(() => {});

  return NextResponse.json({
    success: true,
    updatedCount: userIds.length,
    updatedFields: updateFields,
  });
}
