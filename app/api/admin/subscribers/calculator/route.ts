import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users, listSubscriptions } from '@/lib/db/schema';
import { eq, and, sql, gte, inArray } from 'drizzle-orm';
import { getTodaySentEmailCount } from '@/lib/email/brevo';
import { isFeatureEnabled } from '@/lib/flags/check';

export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const persistedLimit = await isFeatureEnabled('email.brevo_daily_limit', 300);
  const persistedBuffer = await isFeatureEnabled('email.transactional_safety_buffer', 50);

  const { searchParams } = new URL(req.url);
  const brevoDailyLimit = Math.max(1, Number(searchParams.get('brevoDailyLimit')) || persistedLimit);
  const safetyBuffer = Math.max(0, Math.min(brevoDailyLimit - 1, Number(searchParams.get('safetyBuffer')) || persistedBuffer));
  const worstCasePct = Math.max(1, Math.min(100, Number(searchParams.get('worstCasePct')) || 100));
  const avgCasePct = Math.max(1, Math.min(100, Number(searchParams.get('avgCasePct')) || 50));
  const bestCasePct = Math.max(1, Math.min(100, Number(searchParams.get('bestCasePct')) || 20));
  const customPct = Math.max(1, Math.min(100, Number(searchParams.get('customPct')) || 75));

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Fast SQL aggregate query instead of pulling all user records over wire
  const [userStatsRes, activeWatcherRes] = await Promise.all([
    db.select({
      total: sql<number>`COUNT(*)::int`,
      last30Days: sql<number>`COUNT(*) FILTER (WHERE ${users.createdAt} >= ${thirtyDaysAgo.toISOString()})::int`,
    }).from(users),

    db.select({
      activeWatchersCount: sql<number>`COUNT(DISTINCT ${users.id})::int`,
      exemptWatchersCount: sql<number>`COUNT(DISTINCT ${users.id}) FILTER (WHERE ${users.quotaExempt} = true)::int`,
    })
    .from(users)
    .innerJoin(listSubscriptions, eq(users.id, listSubscriptions.userId))
    .where(and(eq(users.isBlocked, false), eq(users.emailNotificationsEnabled, true))),
  ]);

  const totalSubscribers = Number(userStatsRes[0]?.total || 0);
  const newUsersLast30Days = Number(userStatsRes[0]?.last30Days || 0);

  const activeSubscribers = Number(activeWatcherRes[0]?.activeWatchersCount || 0);
  const exemptSubscribers = Number(activeWatcherRes[0]?.exemptWatchersCount || 0);
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
