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

  // Check if email matches ADMIN_BOOTSTRAP_EMAIL and automatically sync role in DB
  const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.toLowerCase().trim();
  if (bootstrapEmail && tokenPayload.email.toLowerCase().trim() === bootstrapEmail) {
    if (tokenPayload.role !== 'admin') {
      tokenPayload.role = 'admin';
      // Sync in DB asynchronously
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
