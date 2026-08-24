import { NextRequest } from 'next/server';
import { verifyAccessToken, TokenPayload, hashToken } from './jwt';
import { db } from '@/lib/db/client';
import { users, refreshTokens } from '@/lib/db/schema';
import { eq, and, isNull, gte } from 'drizzle-orm';
import { redisGet, redisSet, redisDel } from '@/lib/redis/client';

const USER_SESSION_TTL_SECONDS = 300; // 5 minutes Redis cache TTL

export async function invalidateUserSessionCache(userId: string): Promise<boolean> {
  return redisDel(`user:session:${userId}`);
}

async function autoRefreshSessionFromCookie(rawRefreshToken: string): Promise<TokenPayload | null> {
  try {
    const tokenHash = hashToken(rawRefreshToken);
    const [existingSession] = await db
      .select({ userId: refreshTokens.userId })
      .from(refreshTokens)
      .where(and(
        eq(refreshTokens.tokenHash, tokenHash),
        isNull(refreshTokens.revokedAt),
        gte(refreshTokens.expiresAt, new Date())
      ));

    if (!existingSession) return null;

    const [dbUser] = await db.select({
      id: users.id,
      email: users.email,
      role: users.role,
      isBlocked: users.isBlocked,
    }).from(users).where(eq(users.id, existingSession.userId));
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

  const cacheKey = `user:session:${tokenPayload.userId}`;
  const cachedUser = await redisGet<any>(cacheKey);

  if (cachedUser) {
    if (cachedUser.isBlocked) return null;
    tokenPayload.role = cachedUser.role;
    tokenPayload.userRecord = cachedUser;
    return tokenPayload;
  }

  // Cache miss: query database once
  const [dbUser] = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    avatarUrl: users.avatarUrl,
    role: users.role,
    isBlocked: users.isBlocked,
    emailVerified: users.emailVerified,
    emailNotificationsEnabled: users.emailNotificationsEnabled,
    notificationPreference: users.notificationPreference,
    socials: users.socials,
    createdAt: users.createdAt,
  }).from(users).where(eq(users.id, tokenPayload.userId));

  if (!dbUser || dbUser.isBlocked) {
    if (dbUser?.isBlocked) {
      // Cache blocked status for 1 minute to reject fast
      await redisSet(cacheKey, { isBlocked: true }, 60);
    }
    return null;
  }

  tokenPayload.role = dbUser.role;
  tokenPayload.userRecord = dbUser;

  // Check if email matches ADMIN_BOOTSTRAP_EMAIL
  const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.toLowerCase().trim();
  if (bootstrapEmail && tokenPayload.email.toLowerCase().trim() === bootstrapEmail) {
    if (tokenPayload.role !== 'admin') {
      tokenPayload.role = 'admin';
      dbUser.role = 'admin';
      db.update(users).set({ role: 'admin' }).where(eq(users.id, tokenPayload.userId)).catch(() => {});
    }
  }

  // Populate Redis cache asynchronously
  redisSet(cacheKey, dbUser, USER_SESSION_TTL_SECONDS).catch(() => {});

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
