import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { refreshTokens, users } from '@/lib/db/schema';
import { hashToken, generateRandomToken, signAccessToken } from '@/lib/auth/jwt';
import { eq, and, isNull, gte } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const rawRefreshToken = req.cookies.get('refresh_token')?.value;

    if (!rawRefreshToken) {
      return NextResponse.json({ error: 'Missing refresh token' }, { status: 401 });
    }

    const tokenHash = hashToken(rawRefreshToken);

    const [existingSession] = await db.select()
      .from(refreshTokens)
      .where(and(
        eq(refreshTokens.tokenHash, tokenHash),
        isNull(refreshTokens.revokedAt),
        gte(refreshTokens.expiresAt, new Date())
      ));

    if (!existingSession) {
      return NextResponse.json({ error: 'Invalid or expired refresh token' }, { status: 401 });
    }

    // Fetch user details
    const [user] = await db.select().from(users).where(eq(users.id, existingSession.userId));
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    // Revoke old token (rotation)
    await db.update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, existingSession.id));

    // Create new refresh token
    const newRawRefreshToken = generateRandomToken();
    const newRefreshTokenHashed = hashToken(newRawRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: newRefreshTokenHashed,
      expiresAt,
    });

    // Create new access token
    const newAccessToken = await signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      accessToken: newAccessToken,
    });

    response.cookies.set('refresh_token', newRawRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
      expires: expiresAt,
    });

    response.cookies.set('access_token', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60,
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Refresh failed' }, { status: 500 });
  }
}
