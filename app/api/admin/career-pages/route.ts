import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { careerPages } from '@/lib/db/schema';
import { desc, ilike, or, sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 10));
  const search = searchParams.get('search')?.trim() || '';

  let whereCondition;
  if (search) {
    whereCondition = or(
      ilike(careerPages.companyName, `%${search}%`),
      ilike(careerPages.url, `%${search}%`)
    );
  }

  // Count total matching pages
  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(careerPages)
    .where(whereCondition);

  const total = Number(countResult[0]?.count || 0);
  const totalPages = Math.ceil(total / limit) || 1;
  const offset = (page - 1) * limit;

  // Query paginated results
  const items = await db.select()
    .from(careerPages)
    .where(whereCondition)
    .orderBy(desc(careerPages.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    careerPages: items,
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
  });
}
