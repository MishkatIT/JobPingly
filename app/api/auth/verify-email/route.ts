import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users, emailVerifications, refreshTokens, emailApprovals } from '@/lib/db/schema';
import { verifyOtpHash } from '@/lib/auth/otp';
import { signAccessToken, generateRandomToken, hashToken } from '@/lib/auth/jwt';
import { isFeatureEnabled } from '@/lib/flags/check';
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimit';
import { eq, desc } from 'drizzle-orm';
import { pluralize } from '@/lib/utils/pluralize';
import { sendWelcomeEmail } from '@/lib/email/brevo';

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const body = await req.json();
    const { email, otp } = body;

    if (!email || !otp) {
      return NextResponse.json({ error: 'Email and OTP code are required.' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanOtp = otp.toString().trim();

    if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      return NextResponse.json({ error: 'OTP must be a 6-digit number.' }, { status: 400 });
    }

    // Rate limiting per email and IP
    const rateLimit = checkRateLimit({
      key: `verify-email:${cleanEmail}:${clientIp}`,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: `Too many verification attempts. Please try again in ${rateLimit.resetInSeconds} seconds.` },
        { status: 429 }
      );
    }

    const [user] = await db.select().from(users).where(eq(users.email, cleanEmail));
    if (!user) {
      return NextResponse.json({ error: 'Invalid verification request.' }, { status: 400 });
    }

    if (user.emailVerified) {
      // User is already verified. Let's return existing auth token if possible or status message.
      const accessToken = await signAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      return NextResponse.json({
        message: 'Account is already verified.',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          emailVerified: true,
        },
        accessToken,
      });
    }

    // Fetch latest verification record for this user
    const [record] = await db.select()
      .from(emailVerifications)
      .where(eq(emailVerifications.userId, user.id))
      .orderBy(desc(emailVerifications.createdAt))
      .limit(1);

    if (!record) {
      return NextResponse.json(
        { error: 'No verification code found. Please request a new verification code.' },
        { status: 400 }
      );
    }

    // Check maximum attempts limit (5 max attempts)
    if (record.attempts >= 5) {
      return NextResponse.json(
        { error: 'Maximum verification attempts exceeded. Please request a new verification code.' },
        { status: 400 }
      );
    }

    // Check expiration (10 minutes)
    if (new Date() > new Date(record.expiresAt)) {
      return NextResponse.json(
        { error: 'Verification code has expired. Please request a new verification code.' },
        { status: 400 }
      );
    }

    // Secure comparison of OTP against stored hash
    const isValidOtp = verifyOtpHash(cleanOtp, record.tokenHash);

    if (!isValidOtp) {
      // Increment attempt counter
      await db.update(emailVerifications)
        .set({ attempts: record.attempts + 1 })
        .where(eq(emailVerifications.id, record.id));

      const remainingAttempts = 5 - (record.attempts + 1);
      return NextResponse.json(
        {
          error: remainingAttempts > 0
            ? `Incorrect verification code. ${pluralize(remainingAttempts, 'attempt')} remaining.`
            : 'Incorrect verification code. Maximum attempts exceeded. Please request a new code.',
        },
        { status: 400 }
      );
    }

    // OTP is valid! Mark email verified and cleanup verification records
    await db.update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, user.id));

    await db.delete(emailVerifications)
      .where(eq(emailVerifications.userId, user.id));

    // Create email approval record now that user is verified
    const [existingApproval] = await db.select().from(emailApprovals).where(eq(emailApprovals.email, cleanEmail));
    if (!existingApproval) {
      const isAdminBootstrap = process.env.ADMIN_BOOTSTRAP_EMAIL && cleanEmail === process.env.ADMIN_BOOTSTRAP_EMAIL.toLowerCase().trim();
      const autoApprove = await isFeatureEnabled('email.auto_approve_enabled', false) || isAdminBootstrap;
      const initialStatus = autoApprove ? 'approved' : 'pending';

      await db.insert(emailApprovals).values({
        email: cleanEmail,
        userId: user.id,
        status: initialStatus,
        requestedAt: new Date(),
        approvedAt: autoApprove ? new Date() : null,
      });

      if (initialStatus === 'approved') {
        sendWelcomeEmail(cleanEmail, { userName: user.name || undefined }).catch(err => {
          console.error('[Welcome Email Send Error - OTP Verify]', err);
        });
      }
    }

    // Issue existing auth tokens & cookies
    const accessToken = await signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const rawRefreshToken = generateRandomToken();
    const refreshTokenHashed = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: refreshTokenHashed,
      expiresAt,
    });

    const response = NextResponse.json({
      message: 'Email successfully verified.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: true,
      },
      accessToken,
    });

    response.cookies.set('refresh_token', rawRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
      expires: expiresAt,
    });

    response.cookies.set('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60,
    });

    return response;
  } catch (err: any) {
    console.error('[Verify Email Route Error]', err);
    return NextResponse.json({ error: err.message || 'Email verification failed' }, { status: 500 });
  }
}
