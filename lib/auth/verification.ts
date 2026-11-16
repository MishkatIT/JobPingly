import crypto from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/client';
import { emailVerifications } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { generateToken, hashToken, safeEqual } from './tokens';

/**
 * Email verification for sign-up.
 *
 * Each registration attempt creates a row with two secrets:
 *   - a ticket, returned to the browser that registered and kept there;
 *   - a 6-digit code, sent to the email address.
 *
 * Verifying needs both. The password chosen at registration is stored on the
 * row and applied to the account only when the row is verified. So if someone
 * registers another person's email address, they never receive the code, and
 * the real owner's code (which only works with the owner's own ticket) applies
 * the owner's password, never the intruder's.
 */

const CODE_TTL_MS = 10 * 60_000;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_CODE_ATTEMPTS = 5;

function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function hashCode(rowSecret: string, code: string): string {
  return crypto.createHmac('sha256', env.appSecret).update(`${rowSecret}:${code.trim()}`).digest('hex');
}

export interface IssuedVerification {
  ticket: string;
  code: string;
  expiresAt: Date;
}

/** Seconds until another code may be sent to this user, or 0. */
export async function verificationCooldown(userId: string): Promise<number> {
  const [latest] = await db
    .select({ lastSentAt: emailVerifications.lastSentAt })
    .from(emailVerifications)
    .where(eq(emailVerifications.userId, userId))
    .orderBy(desc(emailVerifications.lastSentAt))
    .limit(1);
  if (!latest) return 0;
  const elapsed = (Date.now() - latest.lastSentAt.getTime()) / 1000;
  return elapsed >= RESEND_COOLDOWN_SECONDS ? 0 : Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed);
}

export async function issueVerification(
  userId: string,
  pending: { passwordHash?: string | null; name?: string | null },
  executor: DbOrTx = db,
): Promise<IssuedVerification> {
  const ticket = generateToken();
  const code = generateCode();
  const tokenHash = hashToken(ticket);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await executor.insert(emailVerifications).values({
    userId,
    tokenHash,
    codeHash: hashCode(tokenHash, code),
    pendingPasswordHash: pending.passwordHash ?? null,
    pendingName: pending.name ?? null,
    expiresAt,
    lastSentAt: new Date(),
  });

  return { ticket, code, expiresAt };
}

/** Issues a fresh code for an existing ticket (the "send a new code" button). */
export async function reissueCode(ticket: string): Promise<
  { ok: true; code: string; userId: string } | { ok: false; reason: 'unknown' | 'cooldown'; retryAfterSeconds?: number }
> {
  const tokenHash = hashToken(ticket);
  const [row] = await db
    .select({ id: emailVerifications.id, userId: emailVerifications.userId, lastSentAt: emailVerifications.lastSentAt })
    .from(emailVerifications)
    .where(and(eq(emailVerifications.tokenHash, tokenHash), isNull(emailVerifications.usedAt)));
  if (!row) return { ok: false, reason: 'unknown' };

  const elapsed = (Date.now() - row.lastSentAt.getTime()) / 1000;
  if (elapsed < RESEND_COOLDOWN_SECONDS) {
    return { ok: false, reason: 'cooldown', retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed) };
  }

  const code = generateCode();
  await db
    .update(emailVerifications)
    .set({ codeHash: hashCode(tokenHash, code), attempts: 0, lastSentAt: new Date(), expiresAt: new Date(Date.now() + CODE_TTL_MS) })
    .where(eq(emailVerifications.id, row.id));
  return { ok: true, code, userId: row.userId };
}

export type VerificationCheck =
  | { ok: true; rowId: string; userId: string; pendingPasswordHash: string | null; pendingName: string | null }
  | { ok: false; reason: 'unknown' | 'expired' | 'too_many_attempts' | 'invalid_code'; attemptsLeft?: number };

/** Checks a ticket and code. Counts the attempt before comparing, atomically. */
export async function checkVerification(ticket: string, code: string): Promise<VerificationCheck> {
  const tokenHash = hashToken(ticket);
  const [row] = await db
    .select()
    .from(emailVerifications)
    .where(and(eq(emailVerifications.tokenHash, tokenHash), isNull(emailVerifications.usedAt)));

  if (!row || !row.codeHash) return { ok: false, reason: 'unknown' };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' };

  const [counted] = await db
    .update(emailVerifications)
    .set({ attempts: sql`${emailVerifications.attempts} + 1` })
    .where(and(eq(emailVerifications.id, row.id), sql`${emailVerifications.attempts} < ${MAX_CODE_ATTEMPTS}`))
    .returning({ attempts: emailVerifications.attempts });
  if (!counted) return { ok: false, reason: 'too_many_attempts' };

  if (!/^\d{6}$/.test(code.trim()) || !safeEqual(hashCode(tokenHash, code), row.codeHash)) {
    const attemptsLeft = Math.max(0, MAX_CODE_ATTEMPTS - counted.attempts);
    return { ok: false, reason: attemptsLeft === 0 ? 'too_many_attempts' : 'invalid_code', attemptsLeft };
  }

  return { ok: true, rowId: row.id, userId: row.userId, pendingPasswordHash: row.pendingPasswordHash, pendingName: row.pendingName };
}

/** Rows still waiting for verification, newest first (used to resume sign-up from the login form). */
export async function pendingVerifications(userId: string) {
  return db
    .select({ id: emailVerifications.id, pendingPasswordHash: emailVerifications.pendingPasswordHash, pendingName: emailVerifications.pendingName })
    .from(emailVerifications)
    .where(and(eq(emailVerifications.userId, userId), isNull(emailVerifications.usedAt)))
    .orderBy(desc(emailVerifications.createdAt))
    .limit(5);
}

export async function clearVerifications(userId: string, executor: DbOrTx = db): Promise<void> {
  await executor.delete(emailVerifications).where(eq(emailVerifications.userId, userId));
}
