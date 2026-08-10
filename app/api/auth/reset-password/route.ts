import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users, passwordResets, refreshTokens } from '@/lib/db/schema';
import { hashToken } from '@/lib/auth/jwt';
import { hashPassword } from '@/lib/auth/password';
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimit';
import { eq, and, gt, isNull } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const body = await req.json();
    const { token, password } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Reset token is required.' }, { status: 400 });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long.' }, { status: 400 });
    }

    // Rate limiting: 10 reset attempts per IP in 15 mins
    const rateLimit = checkRateLimit({
      key: `reset-password:${clientIp}`,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: `Too many password reset attempts. Please try again in ${rateLimit.resetInSeconds} seconds.` },
        { status: 429 }
      );
    }

    const tokenHash = hashToken(token.trim());

    // Find valid, unused token that has not expired
    const [resetRecord] = await db
      .select()
      .from(passwordResets)
      .where(
        and(
          eq(passwordResets.tokenHash, tokenHash),
          isNull(passwordResets.usedAt),
          gt(passwordResets.expiresAt, new Date())
        )
      );

    if (!resetRecord) {
      return NextResponse.json(
        { error: 'Invalid or expired password reset link. Please request a new link.' },
        { status: 400 }
      );
    }

    // Find target user
    const [user] = await db.select().from(users).where(eq(users.id, resetRecord.userId));
    if (!user) {
      return NextResponse.json({ error: 'User account not found.' }, { status: 404 });
    }

    if (user.isBlocked) {
      return NextResponse.json(
        { error: `Account suspended: ${user.blockedReason || 'Blocked by administrator.'}` },
        { status: 403 }
      );
    }

    // Hash new password
    const newPasswordHash = await hashPassword(password);

    // Update user password
    await db.update(users)
      .set({ passwordHash: newPasswordHash })
      .where(eq(users.id, user.id));

    // Mark reset token as used
    await db.update(passwordResets)
      .set({ usedAt: new Date() })
      .where(eq(passwordResets.id, resetRecord.id));

    // Revoke old refresh tokens for security
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, user.id));

    return NextResponse.json({
      success: true,
      message: 'Your password has been reset successfully. You can now log in with your new password.',
    });
  } catch (err: any) {
    console.error('[Reset Password Route Error]', err);
    return NextResponse.json({ error: err.message || 'Failed to reset password.' }, { status: 500 });
  }
}
