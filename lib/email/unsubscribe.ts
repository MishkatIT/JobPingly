import { eq } from 'drizzle-orm';
import { createSignedToken, verifySignedToken } from '@/lib/auth/tokens';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { invalidateSessionCache } from '@/lib/auth/session';

/**
 * One-click unsubscribe.
 *
 * Alert emails carry a signed link that turns off job-alert email for the
 * account without requiring a sign-in, as mailbox providers expect
 * (RFC 8058). The token only authorises that one action; it cannot be used
 * to read or change anything else.
 */

interface UnsubscribePayload extends Record<string, unknown> {
  uid: string;
  act: 'unsub';
}

/**
 * Two URLs carry the same signed token:
 *   page      linked from the email body; shows a confirmation button, so
 *             link scanners that pre-fetch URLs cannot unsubscribe anyone.
 *   oneClick  the List-Unsubscribe header target; mailbox providers POST to it.
 */
export function unsubscribeLinks(userId: string): { page: string; oneClick: string } {
  const token = encodeURIComponent(createSignedToken({ uid: userId, act: 'unsub' }));
  return { page: `${env.appUrl}/unsubscribe?token=${token}`, oneClick: `${env.appUrl}/api/unsubscribe?token=${token}` };
}

export function readUnsubscribeToken(token: string): string | null {
  const payload = verifySignedToken<UnsubscribePayload>(token);
  return payload && payload.act === 'unsub' && typeof payload.uid === 'string' ? payload.uid : null;
}

export async function unsubscribeUser(userId: string): Promise<{ email: string } | null> {
  const [row] = await db
    .update(users)
    .set({ emailNotificationsEnabled: false })
    .where(eq(users.id, userId))
    .returning({ email: users.email });
  if (row) invalidateSessionCache(userId);
  return row ?? null;
}

export async function resubscribeUser(userId: string): Promise<boolean> {
  const rows = await db
    .update(users)
    .set({ emailNotificationsEnabled: true })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  return rows.length > 0;
}

/** Shows `j***e@example.com` so the confirmation page does not reveal the full address. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  if (local.length <= 2) return `${local[0] ?? ''}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}
