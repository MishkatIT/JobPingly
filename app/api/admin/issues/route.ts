import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { reportedIssues } from '@/lib/db/schema';
import { desc, eq, and, or, ilike, sql } from 'drizzle-orm';

// GET list of reported issues with filters and pagination pushed to PostgreSQL
export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status');
  const categoryFilter = searchParams.get('category');
  const search = searchParams.get('search')?.trim() || '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 10));

  const conditions = [];

  if (statusFilter && statusFilter !== 'all') {
    conditions.push(eq(reportedIssues.status, statusFilter));
  }

  if (categoryFilter && categoryFilter !== 'all') {
    conditions.push(eq(reportedIssues.category, categoryFilter));
  }

  if (search) {
    const s = `%${search}%`;
    conditions.push(
      or(
        ilike(reportedIssues.subject, s),
        ilike(reportedIssues.description, s),
        ilike(reportedIssues.reporterEmail, s),
        ilike(reportedIssues.targetUrl, s)
      )
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRes, openCountRes, paginatedIssues] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(reportedIssues).where(whereClause),
    db.select({ count: sql<number>`count(*)::int` }).from(reportedIssues).where(eq(reportedIssues.status, 'open')),
    db.select()
      .from(reportedIssues)
      .where(whereClause)
      .orderBy(desc(reportedIssues.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
  ]);

  const total = Number(totalRes[0]?.count || 0);
  const openCount = Number(openCountRes[0]?.count || 0);
  const totalPages = Math.ceil(total / limit) || 1;

  return NextResponse.json({
    issues: paginatedIssues,
    openCount,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    },
  });
}

