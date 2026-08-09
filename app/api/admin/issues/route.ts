import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { reportedIssues } from '@/lib/db/schema';
import { desc, eq, and, or, ilike } from 'drizzle-orm';

// GET list of reported issues with filters and pagination
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

  let allIssues = await db.select()
    .from(reportedIssues)
    .orderBy(desc(reportedIssues.createdAt));

  let filtered = allIssues;

  if (statusFilter && statusFilter !== 'all') {
    filtered = filtered.filter(i => i.status === statusFilter);
  }

  if (categoryFilter && categoryFilter !== 'all') {
    filtered = filtered.filter(i => i.category === categoryFilter);
  }

  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(i =>
      i.subject.toLowerCase().includes(s) ||
      i.description.toLowerCase().includes(s) ||
      i.reporterEmail.toLowerCase().includes(s) ||
      (i.targetUrl && i.targetUrl.toLowerCase().includes(s))
    );
  }

  const total = filtered.length;
  const openCount = allIssues.filter(i => i.status === 'open').length;
  const totalPages = Math.ceil(total / limit) || 1;
  const startIndex = (page - 1) * limit;
  const paginatedIssues = filtered.slice(startIndex, startIndex + limit);

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
