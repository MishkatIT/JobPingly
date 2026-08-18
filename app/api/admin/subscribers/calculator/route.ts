import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users, listSubscriptions } from '@/lib/db/schema';
import { eq, gte, count, sql } from 'drizzle-orm';
import { getTodaySentEmailCount, ensureSentEmailLogsTable } from '@/lib/email/brevo';

import { isFeatureEnabled } from '@/lib/flags/check';

export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  await ensureSentEmailLogsTable();

  const persistedLimit = await isFeatureEnabled('email.brevo_daily_limit', 300);
  const persistedBuffer = await isFeatureEnabled('email.transactional_safety_buffer', 50);

  const { searchParams } = new URL(req.url);
  const brevoDailyLimit = Math.max(1, Number(searchParams.get('brevoDailyLimit')) || persistedLimit);
  const safetyBuffer = Math.max(0, Math.min(brevoDailyLimit - 1, Number(searchParams.get('safetyBuffer')) || persistedBuffer));
  const worstCasePct = Math.max(1, Math.min(100, Number(searchParams.get('worstCasePct')) || 100));
  const avgCasePct = Math.max(1, Math.min(100, Number(searchParams.get('avgCasePct')) || 50));
  const bestCasePct = Math.max(1, Math.min(100, Number(searchParams.get('bestCasePct')) || 20));
  const customPct = Math.max(1, Math.min(100, Number(searchParams.get('customPct')) || 75));

  // 1. Fetch total subscribers & active subscriptions count per user
  const allUsers = await db.select({
    id: users.id,
    isBlocked: users.isBlocked,
    emailNotificationsEnabled: users.emailNotificationsEnabled,
    quotaExempt: users.quotaExempt,
    createdAt: users.createdAt,
  }).from(users);

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

  const totalSubscribers = allUsers.length;
  // Active subscribers are strictly users with notifications enabled, not blocked, and watching AT LEAST 1 list!
  const activeSubscribersList = allUsers.filter(u =>
    !u.isBlocked &&
    u.emailNotificationsEnabled &&
    (subCountMap.get(u.id) || 0) > 0
  );
  const activeSubscribers = activeSubscribersList.length;
  const exemptSubscribers = activeSubscribersList.filter(u => u.quotaExempt).length;
  const regularActiveSubscribers = Math.max(0, activeSubscribers - exemptSubscribers);

  // Effective daily limit for digest emails
  const effectiveDigestLimit = Math.max(1, brevoDailyLimit - safetyBuffer);

  const calculateScenario = (pct: number) => {
    const dailyVolume = Math.ceil(activeSubscribers * (pct / 100));
    const daysRequired = Math.ceil(dailyVolume / effectiveDigestLimit);
    const quotaLoadPct = Math.round((dailyVolume / effectiveDigestLimit) * 100);
    const margin = effectiveDigestLimit - dailyVolume;

    let status: 'safe' | 'warning' | 'exceeded' = 'safe';
    if (dailyVolume > effectiveDigestLimit) {
      status = 'exceeded';
    } else if (quotaLoadPct >= 80) {
      status = 'warning';
    }

    return {
      percentage: pct,
      dailyVolume,
      daysRequired,
      quotaLoadPct,
      margin,
      status,
    };
  };

  const worstCase = calculateScenario(worstCasePct);
  const avgCase = calculateScenario(avgCasePct);
  const bestCase = calculateScenario(bestCasePct);
  const customCase = calculateScenario(customPct);

  // Recommended Cohort Cycle Days K
  const recommendedCohortCount = Math.max(1, Math.ceil(activeSubscribers / effectiveDigestLimit));

  // 2. Growth Rate & Quota Exhaustion Forecasting
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const newUsersLast30Days = allUsers.filter(u => u.createdAt && new Date(u.createdAt) >= thirtyDaysAgo).length;
  const weeklyGrowthRate = Math.round((newUsersLast30Days / 30) * 7 * 10) / 10; // new users per week

  let daysUntilLimitExceeded: number | null = null;
  if (weeklyGrowthRate > 0 && activeSubscribers < effectiveDigestLimit) {
    const dailyGrowthRate = weeklyGrowthRate / 7;
    const bufferRemaining = effectiveDigestLimit - activeSubscribers;
    daysUntilLimitExceeded = Math.ceil(bufferRemaining / dailyGrowthRate);
  }

  // Recommended Tier
  let recommendedTier = 'Brevo Free (300 emails/day)';
  if (activeSubscribers > 15000) {
    recommendedTier = 'Brevo Enterprise (Custom)';
  } else if (activeSubscribers > 4000) {
    recommendedTier = 'Brevo Business (20,000 emails/day)';
  } else if (activeSubscribers > 250) {
    recommendedTier = 'Brevo Starter (5,000 emails/day)';
  }

  const todaySentStats = await getTodaySentEmailCount();

  return NextResponse.json({
    config: {
      brevoDailyLimit,
      safetyBuffer,
      effectiveDigestLimit,
    },
    subscribers: {
      total: totalSubscribers,
      active: activeSubscribers,
      exempt: exemptSubscribers,
      regularActive: regularActiveSubscribers,
    },
    scenarios: {
      worstCase,
      avgCase,
      bestCase,
      customCase,
    },
    recommendations: {
      recommendedCohortCount,
      recommendedTier,
      weeklyGrowthRate,
      daysUntilLimitExceeded,
    },
    todaySentStats,
  });
}
