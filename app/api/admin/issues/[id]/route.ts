import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { reportedIssues, adminAuditLog } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// PUT update status, priority, or admin notes for an issue report
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const issueId = params.id;
  const body = await req.json();
  const { status, priority, adminNotes } = body;

  const [existing] = await db.select().from(reportedIssues).where(eq(reportedIssues.id, issueId));
  if (!existing) {
    return NextResponse.json({ error: 'Issue report not found.' }, { status: 404 });
  }

  const isResolving = status === 'resolved' || status === 'closed';

  const [updated] = await db.update(reportedIssues).set({
    status: status || existing.status,
    priority: priority || existing.priority,
    adminNotes: adminNotes !== undefined ? adminNotes : existing.adminNotes,
    resolvedAt: isResolving ? (existing.resolvedAt || new Date()) : (status && !isResolving ? null : existing.resolvedAt),
    resolvedBy: isResolving ? adminUser.userId : (status && !isResolving ? null : existing.resolvedBy),
  }).where(eq(reportedIssues.id, issueId)).returning();

  await db.insert(adminAuditLog).values({
    adminId: adminUser.userId,
    action: 'update_reported_issue',
    targetType: 'reported_issue',
    targetId: issueId,
    metadata: { status, priority, adminNotes },
  });

  return NextResponse.json({
    success: true,
    issue: updated,
    message: `Issue report status updated to ${updated.status.toUpperCase()}.`,
  });
}

// DELETE an issue report
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const issueId = params.id;
  const [existing] = await db.select().from(reportedIssues).where(eq(reportedIssues.id, issueId));
  if (!existing) {
    return NextResponse.json({ error: 'Issue report not found.' }, { status: 404 });
  }

  await db.delete(reportedIssues).where(eq(reportedIssues.id, issueId));

  await db.insert(adminAuditLog).values({
    adminId: adminUser.userId,
    action: 'delete_reported_issue',
    targetType: 'reported_issue',
    targetId: issueId,
    metadata: { subject: existing.subject, email: existing.reporterEmail },
  });

  return NextResponse.json({
    success: true,
    message: 'Issue report deleted successfully.',
  });
}
