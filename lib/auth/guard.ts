import { NextRequest } from 'next/server';
import { verifyAccessToken, TokenPayload } from './jwt';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

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
