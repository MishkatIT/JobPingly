import { SignJWT, jwtVerify } from 'jose';
import crypto from 'crypto';

const JWT_ACCESS_SECRET = new TextEncoder().encode(
  process.env.JWT_ACCESS_SECRET || 'super-secret-jwt-access-token-key-change-in-production-min32chars'
);

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  userRecord?: any;
}

/**
 * Signs a short-lived Access JWT (15 minutes)
 */
export async function signAccessToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(JWT_ACCESS_SECRET);
}

/**
 * Verifies a short-lived Access JWT
 */
export async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_ACCESS_SECRET);
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}

/**
 * Hashes an opaque refresh token with SHA-256 for secure database storage
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generates a high-entropy random string for refresh tokens
 */
export function generateRandomToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
