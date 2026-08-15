import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { featureFlags, adminAuditLog } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/admin/banner
 * Fetch full banner config for admin management
 */
export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const [flagRecord] = await db.select().from(featureFlags).where(eq(featureFlags.key, 'banner.config'));

  if (!flagRecord || !flagRecord.value) {
    return NextResponse.json({
      enabled: false,
      message: '',
      type: 'info',
      linkUrl: '',
      linkText: '',
      bannerId: 'default',
    });
  }

  const config = typeof flagRecord.value === 'object'
    ? flagRecord.value
    : JSON.parse(String(flagRecord.value));

  return NextResponse.json(config);
}

/**
 * POST /api/admin/banner
 * Save & update banner config. Automatically generates a fresh bannerId timestamp if message changes.
 */
export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const body = await req.json();
  const {
    enabled = false,
    message = '',
    type = 'info',
    linkUrl = '',
    linkText = '',
    forceResetDismissal = false,
  } = body;

  const validTypes = ['info', 'warning', 'danger', 'success'];
  const bannerType = validTypes.includes(type) ? type : 'info';

  const [existingRecord] = await db.select().from(featureFlags).where(eq(featureFlags.key, 'banner.config'));
  const existingConfig = existingRecord?.value ? (typeof existingRecord.value === 'object' ? existingRecord.value as any : {}) : {};

  // If message or type changed or forceResetDismissal requested, generate new bannerId timestamp
  const isMessageOrTypeChanged = existingConfig.message !== message || existingConfig.type !== bannerType;
  const newBannerId = (isMessageOrTypeChanged || forceResetDismissal || !existingConfig.bannerId)
    ? `banner_${Date.now()}`
    : existingConfig.bannerId;

  const bannerConfigData = {
    enabled: Boolean(enabled),
    message: String(message).trim(),
    type: bannerType,
    linkUrl: String(linkUrl).trim(),
    linkText: String(linkText).trim(),
    bannerId: newBannerId,
    updatedAt: new Date().toISOString(),
  };

  if (existingRecord) {
    await db.update(featureFlags).set({
      value: bannerConfigData as any,
      description: 'Site-wide announcement banner configuration',
      updatedAt: new Date(),
      updatedBy: adminUser.userId,
    }).where(eq(featureFlags.key, 'banner.config'));
  } else {
    await db.insert(featureFlags).values({
      key: 'banner.config',
      value: bannerConfigData as any,
      description: 'Site-wide announcement banner configuration',
      updatedAt: new Date(),
      updatedBy: adminUser.userId,
    });
  }

  // Record Admin Audit Log
  await db.insert(adminAuditLog).values({
    adminId: adminUser.userId,
    action: 'update_site_announcement_banner',
    targetType: 'feature_flag',
    targetId: 'banner.config',
    metadata: bannerConfigData,
  });

  return NextResponse.json({
    success: true,
    message: enabled ? 'Site announcement banner published!' : 'Site announcement banner updated & disabled.',
    config: bannerConfigData,
  });
}
