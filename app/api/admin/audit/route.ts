import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { adminAuditLog, users } from '@/lib/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 20));
  const offset = (page - 1) * limit;

  // Count total audit log entries
  const countResult = await db.select({ count: sql<number>`count(*)` }).from(adminAuditLog);
  const total = Number(countResult[0]?.count || 0);
  const totalPages = Math.ceil(total / limit) || 1;

  const logs = await db.select({
    id: adminAuditLog.id,
    adminId: adminAuditLog.adminId,
    adminName: users.name,
    adminEmail: users.email,
    action: adminAuditLog.action,
    targetType: adminAuditLog.targetType,
    targetId: adminAuditLog.targetId,
    metadata: adminAuditLog.metadata,
    createdAt: adminAuditLog.createdAt,
  })
  .from(adminAuditLog)
  .leftJoin(users, eq(adminAuditLog.adminId, users.id))
  .orderBy(desc(adminAuditLog.createdAt))
  .limit(limit)
  .offset(offset);

  return NextResponse.json({
    auditLogs: logs,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    },
  });
}
