import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users, adminAuditLog } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

const getBootstrapEmail = () => {
  return (process.env.ADMIN_BOOTSTRAP_EMAIL || process.env.ADMIN_EMAIL || 'admin@jobpingly.com').toLowerCase();
};

// GET all users for admin management
export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const bootstrapEmail = getBootstrapEmail();

  const rawUsers = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    role: users.role,
    emailVerified: users.emailVerified,
    createdAt: users.createdAt,
  })
  .from(users)
  .orderBy(desc(users.createdAt));

  const allUsers = rawUsers.map(u => ({
    ...u,
    isEnvAdmin: u.email.toLowerCase() === bootstrapEmail,
  }));

  return NextResponse.json({ users: allUsers });
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
