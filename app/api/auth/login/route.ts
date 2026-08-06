import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users, refreshTokens } from '@/lib/db/schema';
import { verifyPassword } from '@/lib/auth/password';
import { signAccessToken, generateRandomToken, hashToken } from '@/lib/auth/jwt';
import { isFeatureEnabled } from '@/lib/flags/check';
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimit';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Rate limit check by email and IP
    const rateLimit = checkRateLimit({
      key: `login:${cleanEmail}:${clientIp}`,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: `Too many login attempts. Please try again in ${rateLimit.resetInSeconds} seconds.` },
        { status: 429 }
      );
    }

    const [user] = await db.select().from(users).where(eq(users.email, cleanEmail));
    
    // If user does not exist or has no password set (Google-only user), return generic 401 error
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    // Check if email is verified
    if (!user.emailVerified) {
      return NextResponse.json(
        {
          error: 'Email verification required.',
          requiresVerification: true,
          email: user.email,
        },
        { status: 403 }
      );
    }

    // Check feature flag: Non-admin users are blocked when auth.login_enabled is false; Admins can always login.
    if (user.role !== 'admin') {
      const loginEnabled = await isFeatureEnabled('auth.login_enabled', true);
      if (!loginEnabled) {
        return NextResponse.json(
          { error: 'User login is currently disabled by administrator.' },
          { status: 403 }
        );
      }
    }

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
        emailVerified: user.emailVerified,
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
    console.error('[Login Route Error]', err);
    return NextResponse.json({ error: err.message || 'Login failed' }, { status: 500 });
  }
}
