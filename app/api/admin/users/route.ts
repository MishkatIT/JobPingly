import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users, adminAuditLog } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

const getBootstrapEmail = () => {
  return (process.env.ADMIN_BOOTSTRAP_EMAIL || process.env.ADMIN_EMAIL || 'admin@jobpingly.com').toLowerCase();
};

// GET list of users with backend pagination + search + role filter
export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const roleFilter = searchParams.get('role');
  const search = searchParams.get('search');
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 10));

  const bootstrapEmail = getBootstrapEmail();

  const rawUsers = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    role: users.role,
    emailVerified: users.emailVerified,
    isBlocked: users.isBlocked,
    blockedReason: users.blockedReason,
    blockedAt: users.blockedAt,
    notificationPreference: users.notificationPreference,
    frequencyEnforcementExempt: users.frequencyEnforcementExempt,
    createdAt: users.createdAt,
  })
  .from(users)
  .where(eq(users.emailVerified, true))
  .orderBy(desc(users.createdAt));

  let results = rawUsers.map(u => ({
    ...u,
    isEnvAdmin: u.email.toLowerCase() === bootstrapEmail,
  }));

  if (roleFilter && roleFilter !== 'all') {
    results = results.filter(u => u.role === roleFilter);
  }

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

// POST update user role (protecting ENV bootstrap administrator from downgrade)
export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const body = await req.json();
  const { targetUserId, newRole } = body;

  if (!targetUserId || !newRole) {
    return NextResponse.json({ error: 'targetUserId and newRole are required.' }, { status: 400 });
  }

  if (!['user', 'admin', 'moderator'].includes(newRole)) {
    return NextResponse.json({ error: 'Invalid role value.' }, { status: 400 });
  }

  // Fetch target user to check if ENV Admin
  const [targetUser] = await db.select().from(users).where(eq(users.id, targetUserId));
  if (!targetUser) {
    return NextResponse.json({ error: 'Target user not found.' }, { status: 404 });
  }

  const bootstrapEmail = getBootstrapEmail();
  if (targetUser.email.toLowerCase() === bootstrapEmail && newRole !== 'admin') {
    return NextResponse.json({
      error: `Forbidden: Primary ENV administrator (${targetUser.email}) cannot be downgraded to user.`
    }, { status: 400 });
  }

  const [updatedUser] = await db.update(users)
    .set({ role: newRole })
    .where(eq(users.id, targetUserId))
    .returning();

  // Audit log entry
  await db.insert(adminAuditLog).values({
    adminId: adminUser.userId,
    action: 'change_role',
    targetType: 'user',
    targetId: targetUserId,
    metadata: { newRole },
  });

  return NextResponse.json({ user: updatedUser });
}
