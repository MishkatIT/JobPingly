import { NextRequest } from 'next/server';
import { verifyAccessToken, TokenPayload, hashToken } from './jwt';
import { db } from '@/lib/db/client';
import { users, refreshTokens } from '@/lib/db/schema';
import { eq, and, isNull, gte } from 'drizzle-orm';

async function autoRefreshSessionFromCookie(rawRefreshToken: string): Promise<TokenPayload | null> {
  try {
    const tokenHash = hashToken(rawRefreshToken);
    const [existingSession] = await db
      .select()
      .from(refreshTokens)
      .where(and(
        eq(refreshTokens.tokenHash, tokenHash),
        isNull(refreshTokens.revokedAt),
        gte(refreshTokens.expiresAt, new Date())
      ));

    if (!existingSession) return null;

    const [dbUser] = await db.select().from(users).where(eq(users.id, existingSession.userId));
    if (!dbUser || dbUser.isBlocked) return null;

    return {
      userId: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
    };
  } catch {
    return null;
  }
}

export async function getAuthUser(req: NextRequest): Promise<TokenPayload | null> {
  let tokenPayload: TokenPayload | null = null;

  // Check Authorization: Bearer <token>
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    tokenPayload = await verifyAccessToken(token);
  }

  // Check HttpOnly access_token cookie
  if (!tokenPayload) {
    const cookieToken = req.cookies.get('access_token')?.value;
    if (cookieToken) {
      tokenPayload = await verifyAccessToken(cookieToken);
    }
  }

  // Fallback: If access token is expired or server restarted, fallback to persistent refresh token
  if (!tokenPayload) {
    const refreshToken = req.cookies.get('refresh_token')?.value;
    if (refreshToken) {
      tokenPayload = await autoRefreshSessionFromCookie(refreshToken);
    }
  }

  if (!tokenPayload) return null;

  // Check if user is blocked or role synced in DB
  const [dbUser] = await db.select({
    id: users.id,
    role: users.role,
    isBlocked: users.isBlocked,
  }).from(users).where(eq(users.id, tokenPayload.userId));

  if (dbUser?.isBlocked) {
    return null; // Blocked users cannot perform actions
  }

  if (dbUser) {
    tokenPayload.role = dbUser.role; // Always use live DB role
  }

  // Check if email matches ADMIN_BOOTSTRAP_EMAIL
  const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.toLowerCase().trim();
  if (bootstrapEmail && tokenPayload.email.toLowerCase().trim() === bootstrapEmail) {
    if (tokenPayload.role !== 'admin') {
      tokenPayload.role = 'admin';
      db.update(users).set({ role: 'admin' }).where(eq(users.id, tokenPayload.userId)).catch(() => {});
    }
  }

  return tokenPayload;
}

export async function requireAdmin(req: NextRequest): Promise<TokenPayload | null> {
  const user = await getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return null;
  }
  return user;
}

export function isUserAdmin(user: { role?: string } | null | undefined): boolean {
  return user?.role === 'admin';
}
