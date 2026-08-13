import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { processNotificationQueue } from '@/packages/notifications/src/processor';
import { db } from '@/lib/db/client';
import { adminAuditLog } from '@/lib/db/schema';

export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  try {
    const result = await processNotificationQueue();

    // Log admin audit trail
    await db.insert(adminAuditLog).values({
      adminId: adminUser.userId,
      action: 'process_notification_queue',
      targetType: 'notification_queue',
      metadata: { processedCount: result.processedCount, emailsSent: result.emailsSent, errors: result.errors },
    });

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${result.processedCount} queued notification item(s). Dispatched ${result.emailsSent} email(s).`,
      processedCount: result.processedCount,
      emailsSent: result.emailsSent,
      errors: result.errors,
    });
  } catch (err: any) {
    console.error('[Admin Process Notifications Error]', err);
    return NextResponse.json({ error: err.message || 'Internal server error processing notification queue.' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  try {
    const result = await processNotificationQueue();
    return NextResponse.json({
      success: true,
      processedCount: result.processedCount,
      emailsSent: result.emailsSent,
      errors: result.errors,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
