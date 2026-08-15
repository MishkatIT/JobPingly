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
    // Auto-create/alter table if missing
    await client`
      CREATE TABLE IF NOT EXISTS sent_email_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        recipient_email TEXT NOT NULL,
        sender_email TEXT,
        subject TEXT NOT NULL,
        template_type TEXT NOT NULL DEFAULT 'general',
        status TEXT NOT NULL DEFAULT 'sent',
        error_message TEXT,
        html_content TEXT,
        sender_id UUID,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE sent_email_logs ADD COLUMN IF NOT EXISTS html_content TEXT;
      ALTER TABLE sent_email_logs ADD COLUMN IF NOT EXISTS sender_email TEXT;
    `;

    const conditions = [];

    // The audit table ONLY lists emails dispatched from the Admin Panel ('broadcast', 'test', 'admin_custom')
    if (templateType && ['broadcast', 'test', 'admin_custom'].includes(templateType)) {
      conditions.push(eq(sentEmailLogs.templateType, templateType));
    } else {
      conditions.push(inArray(sentEmailLogs.templateType, ['broadcast', 'test', 'admin_custom']));
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

    const whereClause = and(...conditions);

    const logs = await db
      .select()
      .from(sentEmailLogs)
      .where(whereClause)
      .orderBy(desc(sentEmailLogs.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const totalLogs = await db
      .select({ id: sentEmailLogs.id })
      .from(sentEmailLogs)
      .where(whereClause);

    const total = totalLogs.length;
    const totalPages = Math.ceil(total / limit) || 1;

    // Aggregate delivery counts for all email categories (Admin + System automated)
    const typeCounts: Record<string, number> = {
      allAdmin: 0,
      broadcast: 0,
      test: 0,
      admin_custom: 0,
      otp: 0,
      digest: 0,
      invite: 0,
      reset: 0,
      totalSystem: 0,
    };

    const typeCountRows = await db
      .select({
        templateType: sentEmailLogs.templateType,
        count: sql<number>`count(*)::int`,
      })
      .from(sentEmailLogs)
      .groupBy(sentEmailLogs.templateType);

    let totalSystem = 0;
    let totalAdmin = 0;
    typeCountRows.forEach(row => {
      const typeKey = row.templateType || 'general';
      typeCounts[typeKey] = (typeCounts[typeKey] || 0) + row.count;
      totalSystem += row.count;
      if (['broadcast', 'test', 'admin_custom'].includes(typeKey)) {
        totalAdmin += row.count;
      }
    });
    typeCounts.allAdmin = totalAdmin;
    typeCounts.totalSystem = totalSystem;

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
