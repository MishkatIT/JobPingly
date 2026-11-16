import crypto from 'node:crypto';
import { env } from '@/lib/env';

/** SHA-256 hex digest; used to store opaque tokens (sessions, reset links) at rest. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** 256 bits of entropy, hex encoded. */
export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    // Still do a comparison so timing does not reveal the length mismatch early.
    crypto.timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return crypto.timingSafeEqual(bufferA, bufferB);
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', env.appSecret).update(payload).digest('base64url');
}

/**
 * Creates a compact signed token carrying a small JSON payload. Used for
 * links that must work without a session, such as one-click unsubscribe.
 * Format: base64url(json).base64url(hmac)
 */
export function createSignedToken(payload: Record<string, unknown>, expiresInSeconds?: number): string {
  const body = { ...payload, ...(expiresInSeconds ? { exp: Math.floor(Date.now() / 1000) + expiresInSeconds } : {}) };
  const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

export function verifySignedToken<T extends Record<string, unknown> = Record<string, unknown>>(token: string): T | null {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const [encoded, signature, ...rest] = token.split('.');
  if (!encoded || !signature || rest.length > 0) return null;
  if (!safeEqual(sign(encoded), signature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T & { exp?: number };
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
