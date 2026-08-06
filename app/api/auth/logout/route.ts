import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { refreshTokens } from '@/lib/db/schema';
import { hashToken } from '@/lib/auth/jwt';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const rawRefreshToken = req.cookies.get('refresh_token')?.value;

  if (rawRefreshToken) {
    const hashed = hashToken(rawRefreshToken);
    await db.update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, hashed));
  }

  const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
  response.cookies.delete('refresh_token');
  response.cookies.delete('access_token');
  return response;
}
