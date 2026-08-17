import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users, adminAuditLog } from '@/lib/db/schema';
import { isFeatureEnabled } from '@/lib/flags/check';
import { eq, inArray, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get('filter') || 'all'; // 'all' | 'enforced' | 'exempt'
  const search = searchParams.get('search') || '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 10));

  const isEnforcedGlobal = await isFeatureEnabled('notifications.enforce_frequency', false);
  const enforcedFrequencyValue = await isFeatureEnabled('notifications.enforced_frequency_value', 'daily');

  const rawUsers = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    role: users.role,
    notificationPreference: users.notificationPreference,
    frequencyEnforcementExempt: users.frequencyEnforcementExempt,
    createdAt: users.createdAt,
  })
  .from(users)
  .orderBy(desc(users.createdAt));

  let results = rawUsers.map(u => {
    const isEnforced = isEnforcedGlobal && !u.frequencyEnforcementExempt;
    return {
      ...u,
      isEnforced,
      effectiveFrequency: isEnforced ? enforcedFrequencyValue : u.notificationPreference,
    };
  });

  if (filter === 'enforced') {
    results = results.filter(u => u.isEnforced);
  } else if (filter === 'exempt') {
    results = results.filter(u => u.frequencyEnforcementExempt);
  }

  if (search) {
    const s = search.toLowerCase().trim();
    results = results.filter(u =>
      u.email.toLowerCase().includes(s) ||
      (u.name && u.name.toLowerCase().includes(s))
    );
  }

  const total = results.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const startIndex = (page - 1) * limit;
  const paginatedUsers = results.slice(startIndex, startIndex + limit);

  return NextResponse.json({
    users: paginatedUsers,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    },
  });
}

export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const body = await req.json();
  const { userIds, exempt } = body;

  if (!Array.isArray(userIds) || userIds.length === 0 || typeof exempt !== 'boolean') {
    return NextResponse.json({ error: 'userIds (non-empty array) and exempt (boolean) are required.' }, { status: 400 });
  }

  await db.update(users)
    .set({ frequencyEnforcementExempt: exempt })
    .where(inArray(users.id, userIds));

  // Record audit log
  await db.insert(adminAuditLog).values({
    adminId: adminUser.userId,
    action: exempt ? 'exempt_users_from_frequency_enforcement' : 'enforce_users_frequency',
    targetType: 'users',
    targetId: userIds.join(','),
    metadata: { userCount: userIds.length, exempt },
  });

  return NextResponse.json({ success: true, updatedCount: userIds.length, exempt });
}
