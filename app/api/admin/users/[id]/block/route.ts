import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users, refreshTokens, adminAuditLog } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  const targetUserId = params.id;
  if (targetUserId === admin.userId) {
    return NextResponse.json({ error: 'You cannot block your own admin account' }, { status: 400 });
  }

  const [targetUser] = await db.select().from(users).where(eq(users.id, targetUserId));
  if (!targetUser) {
    return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const block = body.block !== undefined ? Boolean(body.block) : !targetUser.isBlocked;
  const reason = body.reason || (block ? 'Blocked by admin' : null);

  const [updatedUser] = await db
    .update(users)
    .set({
      isBlocked: block,
      blockedReason: reason,
      blockedAt: block ? new Date() : null,
    })
    .where(eq(users.id, targetUserId))
    .returning();

  // If blocking user, revoke all active refresh tokens immediately
  if (block) {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, targetUserId));
  }

  // Audit Log
  await db.insert(adminAuditLog).values({
    adminId: admin.userId,
    action: block ? 'user.block' : 'user.unblock',
    targetType: 'user',
    targetId: targetUserId,
    metadata: { reason, email: targetUser.email },
  });

  return NextResponse.json({
    success: true,
    message: block ? `User ${targetUser.email} has been blocked.` : `User ${targetUser.email} has been unblocked.`,
    user: updatedUser,
  });
}
