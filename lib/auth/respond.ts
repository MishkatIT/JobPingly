import { eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db/client';
import { listSubscriptions, users } from '@/lib/db/schema';
import { createSession, markCookieIssued, setSessionCookie } from './session';

/** Accepts only same-site relative paths, so `?next=` cannot redirect off-site. */
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== 'string') return null;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  if (/^\/(login|register|verify|forgot-password|reset-password)(\/|\?|$)/.test(next)) return null;
  return next.slice(0, 500);
}

/** Where to send someone right after they sign in. */
export async function landingPathFor(userId: string, next?: unknown): Promise<string> {
  const requested = safeNextPath(next);
  const [user] = await db.select({ onboarded: users.onboardingCompletedAt }).from(users).where(eq(users.id, userId));
  if (!user?.onboarded) {
    // People who joined from a shared list still get to finish setting up.
    const [anyList] = await db.select({ id: listSubscriptions.id }).from(listSubscriptions).where(eq(listSubscriptions.userId, userId)).limit(1);
    if (!anyList) return '/onboarding';
  }
  return requested ?? '/dashboard';
}

/** Starts a session and returns a JSON response carrying its cookie. */
export async function sessionResponse(userId: string, req: NextRequest, data: Record<string, unknown>): Promise<NextResponse> {
  const session = await createSession(userId, req);
  const response = NextResponse.json({ data });
  setSessionCookie(response, session.token, session.expiresAt);
  markCookieIssued(session.id);
  return response;
}
