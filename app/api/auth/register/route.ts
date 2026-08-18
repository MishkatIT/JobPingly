import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users, emailVerifications, emailApprovals } from '@/lib/db/schema';
import { hashPassword } from '@/lib/auth/password';
import { generateOtp, hashOtp } from '@/lib/auth/otp';
import { sendOtpVerificationEmail } from '@/lib/email/brevo';
import { isFeatureEnabled } from '@/lib/flags/check';
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimit';
import { eq, sql } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    // Rate limit check
    const clientIp = getClientIp(req);
    const rateLimit = checkRateLimit({
      key: `register:${clientIp}`,
      limit: 5,
      windowMs: 15 * 60 * 1000, // 5 signups per 15 min per IP
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: `Too many registration attempts. Please try again in ${rateLimit.resetInSeconds} seconds.` },
        { status: 429 }
      );
    }

    // Check feature flag
    const signupEnabled = await isFeatureEnabled('auth.signup_enabled', true);
    if (!signupEnabled) {
      return NextResponse.json(
        { error: 'New user registration is currently disabled by administrator.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { email, password, name } = body;

    if (!email || !password || password.length < 6) {
      return NextResponse.json(
        { error: 'Email and password (min 6 characters) are required.' },
        { status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check if user already exists
    const [existing] = await db.select().from(users).where(eq(users.email, cleanEmail));
    if (existing) {
      if (existing.emailVerified) {
        return NextResponse.json({ error: 'User with this email already exists.' }, { status: 409 });
      } else {
        // Unverified user already exists: update their name and password, then send a new OTP
        const hashedPassword = await hashPassword(password);
        await db.update(users)
          .set({
            name: name || existing.name || cleanEmail.split('@')[0],
            passwordHash: hashedPassword,
          })
          .where(eq(users.id, existing.id));

        // Invalidate old OTP records
        await db.delete(emailVerifications).where(eq(emailVerifications.userId, existing.id));

        const otp = generateOtp();
        const tokenHash = hashOtp(otp);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        await db.insert(emailVerifications).values({
          userId: existing.id,
          tokenHash,
          expiresAt,
          attempts: 0,
          lastSentAt: new Date(),
        });

        // Send OTP via Brevo
        const emailResult = await sendOtpVerificationEmail(cleanEmail, otp);
        if (!emailResult.success) {
          console.error('[Register] Failed to send Brevo verification email:', emailResult.error);
        }

        return NextResponse.json({
          success: true,
          requiresVerification: true,
          email: cleanEmail,
          message: 'Account exists but is unverified. A new verification code has been sent to your email.',
        });
      }
    }

    // Determine initial role (if bootstrap email matches, make admin)
    const isAdminBootstrap = process.env.ADMIN_BOOTSTRAP_EMAIL && cleanEmail === process.env.ADMIN_BOOTSTRAP_EMAIL.toLowerCase().trim();
    const role = isAdminBootstrap ? 'admin' : 'user';

    // Calculate round-robin cohort group assignment (Group 1, 2, or 3)
    const [userCountRecord] = await db.select({ count: sql<number>`count(*)` }).from(users);
    const assignedCohort = (Number(userCountRecord?.count || 0) % 3) + 1;

    const hashedPassword = await hashPassword(password);
    const [newUser] = await db.insert(users).values({
      email: cleanEmail,
      passwordHash: hashedPassword,
      name: name || cleanEmail.split('@')[0],
      emailVerified: false, // Must verify OTP first
      role,
      emailNotificationsEnabled: true,
      dispatchGroup: assignedCohort,
    }).returning();

    // Note: emailApprovals entry is created after the user verifies their OTP email address

    // Generate cryptographically secure 6-digit OTP
    const otp = generateOtp();
    const tokenHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.insert(emailVerifications).values({
      userId: newUser.id,
      tokenHash,
      expiresAt,
      attempts: 0,
      lastSentAt: new Date(),
    });

    // Send OTP via Brevo
    const emailResult = await sendOtpVerificationEmail(cleanEmail, otp);
    if (!emailResult.success) {
      console.error('[Register] Failed to send Brevo verification email:', emailResult.error);
    }

    // Do NOT return auth tokens yet
    return NextResponse.json({
      success: true,
      requiresVerification: true,
      email: cleanEmail,
      message: 'Registration successful. Please enter the verification code sent to your email.',
    });
  } catch (err: any) {
    console.error('[Register Route Error]', err);
    return NextResponse.json({ error: err.message || 'Registration failed' }, { status: 500 });
  }
}
