import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users, passwordResets } from '@/lib/db/schema';
import { generateRandomToken, hashToken } from '@/lib/auth/jwt';
import { sendPasswordResetEmail } from '@/lib/email/brevo';
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimit';
import { eq, desc } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const body = await req.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Valid email address is required.' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();

    // 1. Short-term rate limit: max 5 requests per 15 minutes
    const shortRateLimit = checkRateLimit({
      key: `forgot-password:${cleanEmail}:${clientIp}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });

    if (!shortRateLimit.success) {
      return NextResponse.json(
        { error: `Too many password reset requests. Please try again in ${shortRateLimit.resetInSeconds} seconds.` },
        { status: 429 }
      );
    }

    // 2. Daily hard limit: max 10 requests per 24 hours per email/IP
    const dailyRateLimit = checkRateLimit({
      key: `forgot-password-daily:${cleanEmail}:${clientIp}`,
      limit: 10,
      windowMs: 24 * 60 * 60 * 1000,
    });

    if (!dailyRateLimit.success) {
      return NextResponse.json(
        { error: 'Daily password reset limit reached (max 10 per day). Please try again tomorrow.' },
        { status: 429 }
      );
    }

    // Lookup user by email
    const [user] = await db.select().from(users).where(eq(users.email, cleanEmail));

    // Always return clean success message for invalid/blocked users to prevent email enumeration
    const genericSuccessResponse = NextResponse.json({
      success: true,
      message: 'Password reset instructions have been sent to your email address.',
    });

    if (!user || user.isBlocked) {
      return genericSuccessResponse;
    }

    // 3. 60-Second Cooldown Check
    const [latestReset] = await db.select()
      .from(passwordResets)
      .where(eq(passwordResets.userId, user.id))
      .orderBy(desc(passwordResets.createdAt))
      .limit(1);

    if (latestReset && latestReset.createdAt) {
      const timeSinceLastResetMs = Date.now() - new Date(latestReset.createdAt).getTime();
      const COOLDOWN_MS = 60 * 1000;

      if (timeSinceLastResetMs < COOLDOWN_MS) {
        const remainingSeconds = Math.ceil((COOLDOWN_MS - timeSinceLastResetMs) / 1000);
        return NextResponse.json(
          { error: `Please wait ${remainingSeconds} seconds before requesting another password reset email.` },
          { status: 429 }
        );
      }
    }

    // Generate secure random reset token
    const rawToken = generateRandomToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiration

    // Clean up existing reset tokens for this user
    await db.delete(passwordResets).where(eq(passwordResets.userId, user.id));

    // Insert new reset token
    await db.insert(passwordResets).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    // Construct reset link URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
    const cleanHost = baseUrl.replace(/\/$/, '');
    const resetUrl = `${cleanHost}/reset-password?token=${rawToken}`;

    // Send reset email via Brevo
    const emailResult = await sendPasswordResetEmail(cleanEmail, resetUrl, user.name || undefined);
    if (!emailResult.success) {
      console.error('[Forgot Password] Failed to send Brevo reset email:', emailResult.error);
    }

    return genericSuccessResponse;
  } catch (err: any) {
    console.error('[Forgot Password Route Error]', err);
    return NextResponse.json({ error: err.message || 'Failed to process password reset request.' }, { status: 500 });
  }
}
