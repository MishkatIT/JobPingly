import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { featureFlags, users, adminAuditLog } from '@/lib/db/schema';
import { isFeatureEnabled, invalidateFlagCache } from '@/lib/flags/check';
import { eq, sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  // Clear in-memory flag cache for frequency enforcement keys to prevent stale read
  invalidateFlagCache('notifications.enforce_frequency');
  invalidateFlagCache('email.enforce_frequency_policy');
  invalidateFlagCache('notifications.enforced_frequency_value');

  const isEnforced1 = await isFeatureEnabled('notifications.enforce_frequency', false);
  const isEnforced2 = await isFeatureEnabled('email.enforce_frequency_policy', false);
  const isEnforced = Boolean(isEnforced1 || isEnforced2);
  const enforcedFrequency = await isFeatureEnabled('notifications.enforced_frequency_value', 'daily');

  const [totalRes] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [exemptRes] = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.frequencyEnforcementExempt, true));

  const totalUsers = Number(totalRes?.count || 0);
  const exemptUsersCount = Number(exemptRes?.count || 0);
  const enforcedUsersCount = isEnforced ? totalUsers - exemptUsersCount : 0;

  return NextResponse.json({
    isEnforced,
    enforcedFrequency: typeof enforcedFrequency === 'string' ? enforcedFrequency : 'daily',
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
  const { isEnforced, enforcedFrequency } = body;

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

  // Record audit log
  await db.insert(adminAuditLog).values({
    adminId: adminUser.userId,
    action: 'update_frequency_enforcement_policy',
    targetType: 'system_setting',
    targetId: 'notifications.enforce_frequency',
    metadata: { isEnforced, enforcedFrequency },
  });

  return NextResponse.json({
    success: true,
    isEnforced: Boolean(isEnforced),
    enforcedFrequency: enforcedFrequency || 'daily',
  });
}
