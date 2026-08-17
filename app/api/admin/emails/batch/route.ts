import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { emailApprovals, adminAuditLog } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import { sendWelcomeEmail } from '@/lib/email/brevo';

export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const body = await req.json();
  const { emailIds, action } = body; // action: 'approve' | 'unapprove'

  if (!Array.isArray(emailIds) || emailIds.length === 0) {
    return NextResponse.json({ error: 'emailIds array is required.' }, { status: 400 });
  }

  if (!['approve', 'unapprove'].includes(action)) {
    return NextResponse.json({ error: 'Action must be "approve" or "unapprove".' }, { status: 400 });
  }

  const targetStatus = action === 'approve' ? 'approved' : 'unapproved';

  // Batch update in a single SQL query
  const updatedRecords = await db.update(emailApprovals).set({
    status: targetStatus,
    approvedAt: action === 'approve' ? new Date() : null,
    approvedBy: adminUser.userId,
  }).where(inArray(emailApprovals.id, emailIds)).returning();

  if (action === 'approve') {
    for (const record of updatedRecords) {
      sendWelcomeEmail(record.email, { senderId: adminUser.userId }).catch(err => {
        console.error(`[Welcome Email Send Error - Batch Approve (${record.email})]`, err);
      });
    }
  }

  // Audit log entry for batch action
  await db.insert(adminAuditLog).values({
    adminId: adminUser.userId,
    action: `batch_${action}_emails`,
    targetType: 'email_approval',
    metadata: { count: updatedRecords.length, emailIds },
  });

  return NextResponse.json({
    success: true,
    action,
    processedCount: updatedRecords.length,
    updatedRecords,
  });
}

