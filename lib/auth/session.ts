import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import type { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { refreshTokens, users } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { avatarUrlSql } from '@/lib/users/avatar';
import { getClientIp } from '@/lib/security/rateLimit';
import { generateToken, hashToken } from './tokens';
import { normalizeRole, type Role } from './rbac';

/**
 * Server-side sessions.
 *
 * A session is an opaque 256-bit random token held in an httpOnly cookie. Only
 * its SHA-256 hash is stored (in `refresh_tokens`, which predates this module
 * and is kept so that people who were signed in before the upgrade stay
 * signed in). Because every request is checked against the database, signing
 * out, changing a password, suspending an account or changing a role takes
 * effect immediately rather than after a token expires.
 *
 * The lookup is cached in process memory for a few seconds to keep the hot
 * path to zero queries; every mutation that affects authorisation calls
 * `invalidateSessionCache`.
 */

export const SESSION_COOKIE = 'jp_session';
/** Cookie name used before v2. Still honoured until those sessions expire. */
export const LEGACY_SESSION_COOKIE = 'refresh_token';
const LEGACY_ACCESS_COOKIE = 'access_token';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Extend a session once less than this remains, so active users are not signed out. */
const RENEW_BELOW_MS = 15 * 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 15_000;
const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 5_000;

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: Role;
  emailVerified: boolean;
  plan: string;
  timezone: string;
  hasPassword: boolean;
  hasGoogle: boolean;
  quotaExempt: boolean;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
}

export interface Session {
  id: string;
  user: SessionUser;
  expiresAt: Date;
}

interface CacheEntry {
  session: Session | null;
  cachedAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __jpSessionCache: Map<string, CacheEntry> | undefined;
  // eslint-disable-next-line no-var
  var __jpActivityWrites: Map<string, number> | undefined;
  // eslint-disable-next-line no-var
  var __jpCookieIssued: Map<string, number> | undefined;
}

const cache: Map<string, CacheEntry> = (globalThis.__jpSessionCache ??= new Map());
const activityWrites: Map<string, number> = (globalThis.__jpActivityWrites ??= new Map());
const cookieIssued: Map<string, number> = (globalThis.__jpCookieIssued ??= new Map());

/** How often an API response re-issues the session cookie so its expiry tracks the sliding session. */
const COOKIE_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * True when the session cookie should be re-sent with the current expiry.
 * The database expiry slides forward with activity; the browser only learns
 * about it when the cookie is re-issued, which API responses do periodically.
 */
export function shouldRefreshCookie(session: Session): boolean {
  return Date.now() - (cookieIssued.get(session.id) ?? 0) > COOKIE_REFRESH_INTERVAL_MS;
}

export function markCookieIssued(sessionId: string): void {
  if (cookieIssued.size > MAX_CACHE_ENTRIES * 2) cookieIssued.clear();
  cookieIssued.set(sessionId, Date.now());
}

export function invalidateSessionCache(userId?: string): void {
  if (!userId) {
    cache.clear();
    return;
  }
  for (const [key, entry] of cache) {
    if (entry.session?.user.id === userId) cache.delete(key);
  }
}

function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser =
    /edg\//i.test(userAgent) ? 'Edge'
    : /opr\/|opera/i.test(userAgent) ? 'Opera'
    : /firefox\//i.test(userAgent) ? 'Firefox'
    : /chrome\//i.test(userAgent) ? 'Chrome'
    : /safari\//i.test(userAgent) ? 'Safari'
    : 'Browser';
  const os =
    /windows/i.test(userAgent) ? 'Windows'
    : /android/i.test(userAgent) ? 'Android'
    : /iphone|ipad|ios/i.test(userAgent) ? 'iOS'
    : /mac os x|macintosh/i.test(userAgent) ? 'macOS'
    : /linux/i.test(userAgent) ? 'Linux'
    : 'Unknown OS';
  return `${browser} on ${os}`;
}

export async function createSession(
  userId: string,
  req: { headers: Headers },
): Promise<{ token: string; expiresAt: Date; id: string }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const userAgent = req.headers.get('user-agent')?.slice(0, 400) ?? null;

  const [row] = await db
    .insert(refreshTokens)
    .values({
      userId,
      tokenHash: hashToken(token),
      deviceHint: describeDevice(userAgent),
      userAgent,
      ipAddress: getClientIp(req),
      expiresAt,
      lastUsedAt: new Date(),
    })
    .returning({ id: refreshTokens.id });

  await db.update(users).set({ lastLoginAt: new Date(), lastActiveAt: new Date() }).where(eq(users.id, userId));
  return { token, expiresAt, id: row.id };
}

function readToken(req: { cookies: { get(name: string): { value: string } | undefined } }): string | null {
  const value = req.cookies.get(SESSION_COOKIE)?.value || req.cookies.get(LEGACY_SESSION_COOKIE)?.value;
  // Tokens are 64 hex characters; reject anything else before touching the database.
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

async function loadSession(tokenHash: string): Promise<Session | null> {
  const [row] = await db
    .select({
      sessionId: refreshTokens.id,
      expiresAt: refreshTokens.expiresAt,
      lastUsedAt: refreshTokens.lastUsedAt,
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: avatarUrlSql,
      role: users.role,
      emailVerified: users.emailVerified,
      isBlocked: users.isBlocked,
      plan: users.plan,
      planExpiresAt: users.planExpiresAt,
      timezone: users.timezone,
      hasPassword: sql<boolean>`${users.passwordHash} IS NOT NULL`,
      hasGoogle: sql<boolean>`${users.googleId} IS NOT NULL`,
      quotaExempt: users.quotaExempt,
      onboardingCompletedAt: users.onboardingCompletedAt,
      createdAt: users.createdAt,
    })
    .from(refreshTokens)
    .innerJoin(users, eq(refreshTokens.userId, users.id))
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, new Date())))
    .limit(1);

  if (!row || row.isBlocked || !row.emailVerified) return null;

  let role = normalizeRole(row.role);

  // The configured bootstrap address is always the platform owner.
  const bootstrap = env.adminBootstrapEmail;
  if (bootstrap && row.email.toLowerCase() === bootstrap && role !== 'owner') {
    role = 'owner';
    await db.update(users).set({ role: 'owner' }).where(eq(users.id, row.id));
  }

  const planActive = !row.planExpiresAt || row.planExpiresAt.getTime() > Date.now();

  return {
    id: row.sessionId,
    expiresAt: row.expiresAt,
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatarUrl,
      role,
      emailVerified: row.emailVerified,
      plan: planActive ? row.plan : 'free',
      timezone: row.timezone,
      hasPassword: Boolean(row.hasPassword),
      hasGoogle: Boolean(row.hasGoogle),
      quotaExempt: row.quotaExempt,
      onboardingCompletedAt: row.onboardingCompletedAt,
      createdAt: row.createdAt,
    },
  };
}

function touchActivity(session: Session, tokenHash: string): void {
  const now = Date.now();
  const last = activityWrites.get(session.id) ?? 0;
  if (now - last < ACTIVITY_WRITE_INTERVAL_MS) return;
  activityWrites.set(session.id, now);
  if (activityWrites.size > MAX_CACHE_ENTRIES * 2) activityWrites.clear();

  const remaining = session.expiresAt.getTime() - now;
  const renew = remaining < RENEW_BELOW_MS;
  const expiresAt = renew ? new Date(now + SESSION_TTL_MS) : session.expiresAt;
  if (renew) session.expiresAt = expiresAt;

  // Fire and forget: activity tracking must never slow down or fail a request.
  void Promise.all([
    db.update(refreshTokens).set({ lastUsedAt: new Date(now), expiresAt }).where(eq(refreshTokens.tokenHash, tokenHash)),
    db.update(users).set({ lastActiveAt: new Date(now) }).where(eq(users.id, session.user.id)),
  ]).catch(() => {});
}

export async function getSession(req: {
  cookies: { get(name: string): { value: string } | undefined };
}): Promise<Session | null> {
  const token = readToken(req);
  if (!token) return null;
  const tokenHash = hashToken(token);

  const cached = cache.get(tokenHash);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    if (cached.session) touchActivity(cached.session, tokenHash);
    return cached.session;
  }

  const session = await loadSession(tokenHash);
  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(tokenHash, { session, cachedAt: Date.now() });

  if (session) touchActivity(session, tokenHash);
  return session;
}

export async function revokeSessionByToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, tokenHash));
  cache.delete(tokenHash);
}

export async function revokeSessionById(userId: string, sessionId: string): Promise<boolean> {
  const rows = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.id, sessionId), eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });
  invalidateSessionCache(userId);
  return rows.length > 0;
}

/** Signs the user out everywhere, optionally keeping the session making the request. */
export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const rows = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt),
        exceptSessionId ? ne(refreshTokens.id, exceptSessionId) : undefined,
      ),
    )
    .returning({ id: refreshTokens.id });
  invalidateSessionCache(userId);
  return rows.length;
}

export function currentSessionToken(req: {
  cookies: { get(name: string): { value: string } | undefined };
}): string | null {
  return readToken(req);
}

const baseCookie = () => ({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'lax' as const,
  path: '/',
});

/**
 * Expires the pre-v2 cookies. One of them was issued with path=/api/auth, and
 * a cookie can only be removed with the same path it was set with, so that
 * variant is appended as a raw header (the cookies API keys by name only).
 */
function expireLegacyCookies(response: NextResponse): void {
  response.cookies.set(LEGACY_SESSION_COOKIE, '', { ...baseCookie(), maxAge: 0 });
  response.cookies.set(LEGACY_ACCESS_COOKIE, '', { ...baseCookie(), maxAge: 0 });
  response.headers.append(
    'Set-Cookie',
    `${LEGACY_SESSION_COOKIE}=; Path=/api/auth; Max-Age=0; HttpOnly; SameSite=Lax${env.isProduction ? '; Secure' : ''}`,
  );
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date): void {
  response.cookies.set(SESSION_COOKIE, token, { ...baseCookie(), expires: expiresAt });
  expireLegacyCookies(response);
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', { ...baseCookie(), maxAge: 0 });
  expireLegacyCookies(response);
}
