import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users, emailVerifications } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

// GET list of unverified users/emails (emailVerified = false) with verification OTP status
export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 10));

  // Single query leftJoin to fetch unverified users with verification records
  const rawResults = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    createdAt: users.createdAt,
    verId: emailVerifications.id,
    attempts: emailVerifications.attempts,
    lastSentAt: emailVerifications.lastSentAt,
    expiresAt: emailVerifications.expiresAt,
  })
  .from(users)
  .leftJoin(emailVerifications, eq(users.id, emailVerifications.userId))
  .where(eq(users.emailVerified, false))
  .orderBy(desc(users.createdAt));

  const now = new Date();
  const unverifiedRecords = rawResults.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    createdAt: u.createdAt,
    verification: u.verId ? {
      id: u.verId,
      attempts: u.attempts ?? 0,
      lastSentAt: u.lastSentAt,
      expiresAt: u.expiresAt,
      isExpired: u.expiresAt ? now > new Date(u.expiresAt) : true,
    } : null,
  }));

  let results = unverifiedRecords;
  if (search) {
    const s = search.toLowerCase();
    results = results.filter(u =>
      u.email.toLowerCase().includes(s) ||
      (u.name && u.name.toLowerCase().includes(s))
    );
  }

  const total = results.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const startIndex = (page - 1) * limit;
  const paginatedResults = results.slice(startIndex, startIndex + limit);

  return NextResponse.json({
    unverifiedUsers: paginatedResults,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    },
  });
}
