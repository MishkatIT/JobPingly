import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users, emailVerifications } from '@/lib/db/schema';
import { generateOtp, hashOtp } from '@/lib/auth/otp';
import { sendOtpVerificationEmail } from '@/lib/email/brevo';
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimit';
import { eq, desc } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const body = await req.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email address is required.' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();

    // 1. Short-term rate limit: max 5 resends per email/IP in 15 mins
    const rateLimit = checkRateLimit({
      key: `resend:${cleanEmail}:${clientIp}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: `Too many resend requests. Please try again in ${rateLimit.resetInSeconds} seconds.` },
        { status: 429 }
      );
    }

    // 2. Daily hard limit: max 10 OTP resend requests per 24 hours per email/IP
    const dailyRateLimit = checkRateLimit({
      key: `resend-daily:${cleanEmail}:${clientIp}`,
      limit: 10,
      windowMs: 24 * 60 * 60 * 1000,
    });

    if (!dailyRateLimit.success) {
      return NextResponse.json(
        { error: 'Daily verification code limit reached (max 10 per day). Please try again tomorrow.' },
        { status: 429 }
      );
    }

    const [user] = await db.select().from(users).where(eq(users.email, cleanEmail));

    // To prevent email enumeration, return generic message if user doesn't exist or is already verified
    if (!user || user.emailVerified) {
      return NextResponse.json({
        success: true,
        message: 'If an unverified account exists with this email address, a new verification code has been sent.',
      });
    }

    // Check 60-second cooldown
    const [latestRecord] = await db.select()
      .from(emailVerifications)
      .where(eq(emailVerifications.userId, user.id))
      .orderBy(desc(emailVerifications.createdAt))
      .limit(1);

    if (latestRecord && latestRecord.lastSentAt) {
      const timeSinceLastSentMs = Date.now() - new Date(latestRecord.lastSentAt).getTime();
      const COOLDOWN_MS = 60 * 1000;

      if (timeSinceLastSentMs < COOLDOWN_MS) {
        const remainingSeconds = Math.ceil((COOLDOWN_MS - timeSinceLastSentMs) / 1000);
        return NextResponse.json(
          { error: `Please wait ${remainingSeconds} seconds before requesting another code.` },
          { status: 429 }
        );
      }
    }

    // Invalidate old records
    await db.delete(emailVerifications).where(eq(emailVerifications.userId, user.id));

    // Generate new OTP & record
    const otp = generateOtp();
    const tokenHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.insert(emailVerifications).values({
      userId: user.id,
      tokenHash,
      expiresAt,
      attempts: 0,
      lastSentAt: new Date(),
    });

    // Send email via Brevo
    const emailResult = await sendOtpVerificationEmail(cleanEmail, otp);
    if (!emailResult.success) {
      console.error('[Resend Verification] Failed to send Brevo email:', emailResult.error);
    }

    return NextResponse.json({
      success: true,
      message: 'A new verification code has been sent to your email address.',
    });
  } catch (err: any) {
    console.error('[Resend Verification Route Error]', err);
    return NextResponse.json({ error: err.message || 'Resend verification failed' }, { status: 500 });
  }
}
