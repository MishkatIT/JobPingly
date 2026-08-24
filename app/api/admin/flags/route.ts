import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { featureFlags, adminAuditLog } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { invalidateFlagCache } from '@/lib/flags/check';

const DEFAULT_FLAGS = [
  { key: 'auth.login_enabled', value: true, description: 'Enable user login' },
  { key: 'auth.signup_enabled', value: true, description: 'Enable new user registration' },
  { key: 'email.auto_approve_enabled', value: false, description: 'Auto approve new email addresses' },
  { key: 'email.brevo_daily_limit', value: 300, description: 'Brevo REST API daily sending quota limit' },
  { key: 'email.transactional_safety_buffer', value: 50, description: 'Safety reserve emails/day strictly kept for OTPs & password resets' },
  { key: 'email.cohort_cycle_days', value: 3, description: 'Number of staggered daily cohorts ($K$ Days rotation)' },
  { key: 'email.cohort_grouping_enabled', value: true, description: 'Stagger non-VIP notification digests across daily cohort groups to respect Brevo daily limit' },
  { key: 'email.enforce_frequency_policy', value: false, description: 'Strictly enforce global daily digest frequency policy' },
  { key: 'limits.max_keywords_per_sub', value: 20, description: 'Max keywords per subscription filter' },
  { key: 'limits.max_lists_per_user', value: 10, description: 'Max watch lists per user account' },
  { key: 'limits.max_urls_per_list', value: 25, description: 'Max monitored career page URLs per watch list' },
  { key: 'notifications.enabled', value: true, description: 'Enable email digest sending' },
  { key: 'notifications.enforce_frequency', value: false, description: 'Enforce admin set notification digest frequency globally' },
  { key: 'notifications.enforced_frequency_value', value: 'daily', description: 'The global enforced notification digest frequency' },
  { key: 'public_lists.enabled', value: true, description: 'Enable public list directory' },
  { key: 'scraper.enabled', value: true, description: 'Enable background scraper execution' },
  { key: 'scraper.global_check_interval_minutes', value: 180, description: 'Global master scrape check interval in minutes' },
  { key: 'scraper.use_global_timer', value: true, description: 'Use global master timer for all sites' },
];

export async function GET(req: NextRequest) {
  // Ensure all default flags exist
  for (const f of DEFAULT_FLAGS) {
    await db.insert(featureFlags).values(f).onConflictDoNothing();
  }

  const flags = await db.select().from(featureFlags).orderBy(asc(featureFlags.key));
  return NextResponse.json({ flags });
}

export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const body = await req.json();
  const { key, value } = body;

  const [updated] = await db.insert(featureFlags).values({
    key,
    value,
    updatedAt: new Date(),
    updatedBy: adminUser.userId,
  }).onConflictDoUpdate({
    target: featureFlags.key,
    set: {
      value,
      updatedAt: new Date(),
      updatedBy: adminUser.userId,
    },
  }).returning();

  invalidateFlagCache(key);

  // Record audit log
  await db.insert(adminAuditLog).values({
    adminId: adminUser.userId,
    action: 'toggle_flag',
    targetType: 'feature_flag',
    targetId: key,
    metadata: { newValue: value },
  });

  return NextResponse.json({ flag: updated });
}
