import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db, client } from '@/lib/db/client';
import { sentEmailLogs } from '@/lib/db/schema';
import { desc, eq, inArray, ilike, or, and, sql } from 'drizzle-orm';

/**
 * GET /api/admin/emails/logs
 * Returns detailed logs for Admin-dispatched emails (broadcast, test)
 * and aggregate counts for outer automated system emails (otp, digest, invite, reset).
 */
export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');
  const templateType = searchParams.get('type');
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 15));

  try {
    const conditions = [];

    if (templateType && templateType !== 'all') {
      if (templateType === 'admin_all') {
        conditions.push(or(inArray(sentEmailLogs.templateType, ['broadcast', 'test', 'admin_custom']), sql`${sentEmailLogs.senderId} IS NOT NULL`));
      } else if (templateType === 'system_all') {
        conditions.push(and(inArray(sentEmailLogs.templateType, ['otp', 'digest', 'invite', 'reset']), sql`${sentEmailLogs.senderId} IS NULL`));
      } else {
        conditions.push(eq(sentEmailLogs.templateType, templateType));
      }
    }

    if (search && search.trim()) {
      const searchPattern = `%${search.trim().toLowerCase()}%`;
      conditions.push(
        or(
          ilike(sentEmailLogs.recipientEmail, searchPattern),
          ilike(sentEmailLogs.subject, searchPattern),
          ilike(sentEmailLogs.senderEmail, searchPattern)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const logs = await db
      .select()
      .from(sentEmailLogs)
      .where(whereClause)
      .orderBy(desc(sentEmailLogs.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const totalLogs = await db
      .select({ count: sql<number>`count(*)` })
      .from(sentEmailLogs)
      .where(whereClause);

    const total = Number(totalLogs[0]?.count || 0);
    const totalPages = Math.ceil(total / limit) || 1;

    // Aggregate delivery counts for all email categories (Admin + System automated)
    const typeCounts: Record<string, number> = {
      all: 0,
      allAdmin: 0,
      allSystem: 0,
      broadcast: 0,
      test: 0,
      admin_custom: 0,
      otp: 0,
      digest: 0,
      invite: 0,
      reset: 0,
    };

    const typeCountRows = await db
      .select({
        templateType: sentEmailLogs.templateType,
        count: sql<number>`count(*)::int`,
      })
      .from(sentEmailLogs)
      .groupBy(sentEmailLogs.templateType);

    const adminCountRes = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sentEmailLogs)
      .where(or(inArray(sentEmailLogs.templateType, ['broadcast', 'test', 'admin_custom']), sql`${sentEmailLogs.senderId} IS NOT NULL`));

    const totalAdmin = Number(adminCountRes[0]?.count || 0);
    let grandTotal = 0;

    typeCountRows.forEach(row => {
      const typeKey = row.templateType || 'general';
      const cnt = Number(row.count) || 0;
      typeCounts[typeKey] = (typeCounts[typeKey] || 0) + cnt;
      grandTotal += cnt;
    });

    typeCounts.all = grandTotal;
    typeCounts.allAdmin = totalAdmin;
    typeCounts.allSystem = Math.max(0, grandTotal - totalAdmin);

    return NextResponse.json({
      logs,
      typeCounts,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages,
      },
    });
  } catch (err: any) {
    console.error('[Admin Email Logs API Error]', err.message);
    return NextResponse.json({
      logs: [],
      typeCounts: { allAdmin: 0, broadcast: 0, test: 0, admin_custom: 0, otp: 0, digest: 0, invite: 0, reset: 0, totalSystem: 0 },
      pagination: { total: 0, page: 1, limit, totalPages: 1, hasMore: false }
    });
  }
}
