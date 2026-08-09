import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { db } from '@/lib/db/client';
import { users, refreshTokens, emailApprovals } from '@/lib/db/schema';
import { signAccessToken, generateRandomToken, hashToken } from '@/lib/auth/jwt';
import { isFeatureEnabled } from '@/lib/flags/check';
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimit';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const body = await req.json();
    const { credential } = body;

    if (!credential) {
      return NextResponse.json({ error: 'Google ID token credential is required.' }, { status: 400 });
    }

    // Rate limit check
    const rateLimit = checkRateLimit({
      key: `google:${clientIp}`,
      limit: 15,
      windowMs: 15 * 60 * 1000,
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: `Too many Google authentication attempts. Please try again in ${rateLimit.resetInSeconds} seconds.` },
        { status: 429 }
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error('[Google Auth] GOOGLE_CLIENT_ID is not configured in environment variables.');
      return NextResponse.json(
        { error: 'Google OAuth is not configured on the server.' },
        { status: 500 }
      );
    }

    // Verify Google ID token using official Google OAuth2Client
    const client = new OAuth2Client(clientId);
    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });
    } catch (verifyErr: any) {
      console.error('[Google Token Verification Failed]', verifyErr);
      return NextResponse.json({ error: 'Invalid or expired Google credential.' }, { status: 401 });
    }

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return NextResponse.json({ error: 'Google account missing required email claim.' }, { status: 400 });
    }

    const googleSub = payload.sub;
    const googleEmail = payload.email.toLowerCase().trim();
    const googleName = payload.name || googleEmail.split('@')[0];
    const googlePicture = payload.picture || null;

    // Check login feature flag
    const loginEnabled = await isFeatureEnabled('auth.login_enabled', true);

    // 1. Check if user exists by googleId
    let [user] = await db.select().from(users).where(eq(users.googleId, googleSub));

    if (user) {
      if (user.isBlocked) {
        return NextResponse.json(
          { error: `Account suspended: ${user.blockedReason || 'Blocked by administrator.'}` },
          { status: 403 }
        );
      }

      // Returning Google user
      if (user.role !== 'admin' && !loginEnabled) {
        return NextResponse.json(
          { error: 'User login is currently disabled by administrator.' },
          { status: 403 }
        );
      }

      // Update avatar or name if missing
      if (!user.avatarUrl && googlePicture) {
        await db.update(users).set({ avatarUrl: googlePicture }).where(eq(users.id, user.id));
      }
    } else {
      // 2. Check if user exists by email (Account Linking)
      const [existingByEmail] = await db.select().from(users).where(eq(users.email, googleEmail));

      if (existingByEmail) {
        // Link Google ID to existing account and set emailVerified = true
        user = existingByEmail;
        if (user.role !== 'admin' && !loginEnabled) {
          return NextResponse.json(
            { error: 'User login is currently disabled by administrator.' },
            { status: 403 }
          );
        }

        await db.update(users)
          .set({
            googleId: googleSub,
            emailVerified: true,
            avatarUrl: user.avatarUrl || googlePicture,
          })
          .where(eq(users.id, user.id));

        user.googleId = googleSub;
        user.emailVerified = true;
      } else {
        // 3. New Google user registration
        const signupEnabled = await isFeatureEnabled('auth.signup_enabled', true);
        if (!signupEnabled) {
          return NextResponse.json(
            { error: 'New user registration is currently disabled by administrator.' },
            { status: 403 }
          );
        }

        const isAdminBootstrap = process.env.ADMIN_BOOTSTRAP_EMAIL && googleEmail === process.env.ADMIN_BOOTSTRAP_EMAIL.toLowerCase().trim();
        const role = isAdminBootstrap ? 'admin' : 'user';

        const [newUser] = await db.insert(users).values({
          email: googleEmail,
          name: googleName,
          googleId: googleSub,
          avatarUrl: googlePicture,
          passwordHash: null, // Google-only account
          emailVerified: true, // Google accounts are auto-verified
          role,
          emailNotificationsEnabled: true,
        }).returning();

        user = newUser;

        // Add email approvals entry
        const autoApprove = await isFeatureEnabled('email.auto_approve_enabled', false) || isAdminBootstrap;
        const initialStatus = autoApprove ? 'approved' : 'pending';

        await db.insert(emailApprovals).values({
          email: googleEmail,
          userId: newUser.id,
          status: initialStatus,
          requestedAt: new Date(),
          approvedAt: autoApprove ? new Date() : null,
        });
      }
    }

    // Generate JWT access & refresh tokens
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
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
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
    console.error('[Google Auth Route Error]', err);
    return NextResponse.json({ error: err.message || 'Google authentication failed' }, { status: 500 });
  }
}
