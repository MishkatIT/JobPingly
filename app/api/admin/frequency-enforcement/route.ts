import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { featureFlags, users, adminAuditLog } from '@/lib/db/schema';
import { isFeatureEnabled, invalidateFlagCache } from '@/lib/flags/check';
import { eq, sql } from 'drizzle-orm';
import { isSupportedFrequency, formatFrequencyLabel } from '@/lib/utils/frequency';
import { normalizeDigestHour, normalizeDigestMinute, describeDigestSchedule } from '@/lib/utils/digestSchedule';

export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  // Clear in-memory flag cache for frequency enforcement keys to prevent stale read
  invalidateFlagCache('notifications.enforce_frequency');
  invalidateFlagCache('email.enforce_frequency_policy');
  invalidateFlagCache('notifications.enforced_frequency_value');
  invalidateFlagCache('notifications.enforced_digest_hour');
  invalidateFlagCache('notifications.enforced_digest_minute');

  const isEnforced1 = await isFeatureEnabled('notifications.enforce_frequency', false);
  const isEnforced2 = await isFeatureEnabled('email.enforce_frequency_policy', false);
  const isEnforced = Boolean(isEnforced1 || isEnforced2);
  const enforcedFrequency = await isFeatureEnabled('notifications.enforced_frequency_value', 'daily');
  const rawHour = Number(await isFeatureEnabled('notifications.enforced_digest_hour', -1));
  const rawMinute = Number(await isFeatureEnabled('notifications.enforced_digest_minute', -1));
  const hourPinned = Number.isFinite(rawHour) && rawHour >= 0 && rawHour <= 23;
  const enforcedDigestHour = hourPinned ? normalizeDigestHour(rawHour) : null;
  const enforcedDigestMinute = hourPinned ? normalizeDigestMinute(rawMinute >= 0 ? rawMinute : 0) : null;

  const [totalRes] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [exemptRes] = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.frequencyEnforcementExempt, true));

  const totalUsers = Number(totalRes?.count || 0);
  const exemptUsersCount = Number(exemptRes?.count || 0);
  const enforcedUsersCount = isEnforced ? totalUsers - exemptUsersCount : 0;

  const frequencyValue = typeof enforcedFrequency === 'string' ? enforcedFrequency : 'daily';

  return NextResponse.json({
    isEnforced,
    enforcedFrequency: frequencyValue,
    // null means "each user keeps their own delivery time".
    enforcedDigestHour,
    enforcedDigestMinute,
    scheduleLabel: hourPinned
      ? `${describeDigestSchedule(frequencyValue, enforcedDigestHour, enforcedDigestMinute, 'UTC').replace(' UTC', '')} in each user's timezone`
      : `${formatFrequencyLabel(frequencyValue)} — delivered at each user's own digest time`,
    stats: {
      totalUsers,
      enforcedUsersCount,
      exemptUsersCount,
    },
  });
}

export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const body = await req.json();
  const { isEnforced, enforcedFrequency, enforcedDigestHour, enforcedDigestMinute } = body;

  // Reject values the scheduler cannot interpret. Previously any string was
  // stored verbatim and silently degraded to a daily cadence at send time.
  if (enforcedFrequency !== undefined && enforcedFrequency !== null && String(enforcedFrequency).trim().length > 0) {
    if (!isSupportedFrequency(String(enforcedFrequency))) {
      return NextResponse.json(
        { error: `Unsupported enforced frequency '${enforcedFrequency}'.` },
        { status: 400 },
      );
    }
  }

  if (enforcedDigestHour !== undefined && enforcedDigestHour !== null) {
    const h = Number(enforcedDigestHour);
    // -1 clears the pin and hands the delivery time back to each user.
    if (!Number.isFinite(h) || h < -1 || h > 23) {
      return NextResponse.json({ error: 'Enforced digest hour must be 0-23, or -1 to unset.' }, { status: 400 });
    }
  }

  if (enforcedDigestMinute !== undefined && enforcedDigestMinute !== null) {
    const m = Number(enforcedDigestMinute);
    if (!Number.isFinite(m) || m < -1 || m > 59) {
      return NextResponse.json({ error: 'Enforced digest minute must be 0-59, or -1 to unset.' }, { status: 400 });
    }
  }

  if (typeof isEnforced === 'boolean') {
    // Synchronize both flag keys across the system
    await db.insert(featureFlags).values({
      key: 'notifications.enforce_frequency',
      value: isEnforced,
      description: 'Enforce admin set notification digest frequency globally',
      updatedAt: new Date(),
      updatedBy: adminUser.userId,
    }).onConflictDoUpdate({
      target: featureFlags.key,
      set: {
        value: isEnforced,
        updatedAt: new Date(),
        updatedBy: adminUser.userId,
      },
    });

    await db.insert(featureFlags).values({
      key: 'email.enforce_frequency_policy',
      value: isEnforced,
      description: 'Strictly enforce global daily digest frequency policy',
      updatedAt: new Date(),
      updatedBy: adminUser.userId,
    }).onConflictDoUpdate({
      target: featureFlags.key,
      set: {
        value: isEnforced,
        updatedAt: new Date(),
        updatedBy: adminUser.userId,
      },
    });

    invalidateFlagCache('notifications.enforce_frequency');
    invalidateFlagCache('email.enforce_frequency_policy');
  }

  if (enforcedFrequency && typeof enforcedFrequency === 'string' && enforcedFrequency.trim().length > 0) {
    const cleanFreq = enforcedFrequency.trim();
    await db.insert(featureFlags).values({
      key: 'notifications.enforced_frequency_value',
      value: cleanFreq,
      description: 'The global enforced notification digest frequency',
      updatedAt: new Date(),
      updatedBy: adminUser.userId,
    }).onConflictDoUpdate({
      target: featureFlags.key,
      set: {
        value: cleanFreq,
        updatedAt: new Date(),
        updatedBy: adminUser.userId,
      },
    });

    invalidateFlagCache('notifications.enforced_frequency_value');
  }

  // Optional global delivery time. -1 means "leave each user's own time alone".
  if (enforcedDigestHour !== undefined && enforcedDigestHour !== null) {
    const hourValue = Math.floor(Number(enforcedDigestHour));
    const minuteValue = enforcedDigestMinute === undefined || enforcedDigestMinute === null
      ? 0
      : Math.max(0, Math.floor(Number(enforcedDigestMinute)));

    for (const [key, value, description] of [
      ['notifications.enforced_digest_hour', hourValue, 'Global enforced digest delivery hour (0-23), or -1 to use each user\'s own time'],
      ['notifications.enforced_digest_minute', hourValue < 0 ? -1 : minuteValue, 'Global enforced digest delivery minute (0-59)'],
    ] as [string, number, string][]) {
      await db.insert(featureFlags).values({
        key,
        value,
        description,
        updatedAt: new Date(),
        updatedBy: adminUser.userId,
      }).onConflictDoUpdate({
        target: featureFlags.key,
        set: { value, updatedAt: new Date(), updatedBy: adminUser.userId },
      });
      invalidateFlagCache(key);
    }
  }

  // Record audit log
  await db.insert(adminAuditLog).values({
    adminId: adminUser.userId,
    action: 'update_frequency_enforcement_policy',
    targetType: 'system_setting',
    targetId: 'notifications.enforce_frequency',
    metadata: { isEnforced, enforcedFrequency, enforcedDigestHour, enforcedDigestMinute },
  });

  return NextResponse.json({
    success: true,
    isEnforced: Boolean(isEnforced),
    enforcedFrequency: enforcedFrequency || 'daily',
    enforcedDigestHour: enforcedDigestHour === undefined ? undefined : Number(enforcedDigestHour),
    enforcedDigestMinute: enforcedDigestMinute === undefined ? undefined : Number(enforcedDigestMinute),
  });
}
