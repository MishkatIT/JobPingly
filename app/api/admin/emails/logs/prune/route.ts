import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { sentEmailLogs, adminAuditLog } from '@/lib/db/schema';
import { eq, lt, and, isNotNull, sql } from 'drizzle-orm';

/**
 * POST /api/admin/emails/logs/prune
 * Allows admins to manage DB storage size by:
 * 1. Purging heavy HTML email bodies older than X days (preserving audit logs/counts).
 * 2. Deleting entire sent email log entries older than X days.
 * 3. Deleting single email log records.
 */
export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { action, days = 30, templateType, logId } = body;

    if (action === 'delete_single') {
      if (!logId) {
        return NextResponse.json({ error: 'logId is required for deleting a single record.' }, { status: 400 });
      }

      await db.delete(sentEmailLogs).where(eq(sentEmailLogs.id, logId));

      await db.insert(adminAuditLog).values({
        adminId: adminUser.userId,
        action: 'delete_sent_email_log',
        targetType: 'sent_email_log',
        targetId: logId,
        metadata: { logId },
      });

      return NextResponse.json({
        success: true,
        message: 'Sent email log record deleted successfully.',
      });
    }

    if (action === 'purge_html') {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - Number(days));

      const conditions = [
        lt(sentEmailLogs.createdAt, cutoffDate),
        isNotNull(sentEmailLogs.htmlContent),
      ];

      if (templateType && templateType !== 'all') {
        conditions.push(eq(sentEmailLogs.templateType, templateType));
      }

      const updateRes = await db
        .update(sentEmailLogs)
        .set({ htmlContent: null })
        .where(and(...conditions));

      await db.insert(adminAuditLog).values({
        adminId: adminUser.userId,
        action: 'purge_sent_email_html_content',
        targetType: 'sent_email_logs',
        targetId: 'batch_purge',
        metadata: { days, templateType: templateType || 'all' },
      });

      return NextResponse.json({
        success: true,
        message: `Purged HTML content bodies older than ${days} days to free up DB storage. Audit logs & delivery counts remain intact!`,
      });
    }

    if (action === 'delete_logs') {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - Number(days));

      const conditions = [lt(sentEmailLogs.createdAt, cutoffDate)];

      if (templateType && templateType !== 'all') {
        conditions.push(eq(sentEmailLogs.templateType, templateType));
      }

      await db.delete(sentEmailLogs).where(and(...conditions));

      await db.insert(adminAuditLog).values({
        adminId: adminUser.userId,
        action: 'delete_sent_email_logs_batch',
        targetType: 'sent_email_logs',
        targetId: 'batch_delete',
        metadata: { days, templateType: templateType || 'all' },
      });

      return NextResponse.json({
        success: true,
        message: `Deleted sent email log entries older than ${days} days to free up DB disk space.`,
      });
    }

    return NextResponse.json({ error: 'Invalid prune action specified.' }, { status: 400 });
  } catch (err: any) {
    console.error('[Admin Email Prune Error]', err);
    return NextResponse.json({ error: err.message || 'Failed to prune email logs.' }, { status: 500 });
  }
}
