import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '@/lib/env';

/**
 * Verifies a Google Identity Services credential (an ID token) and returns
 * the identity it asserts. Signature, issuer, audience and expiry are all
 * checked against Google's published keys.
 */

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

declare global {
  var __jpGoogleJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
}

function jwks() {
  return (globalThis.__jpGoogleJwks ??= createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), {
    cacheMaxAge: 6 * 60 * 60 * 1000,
    timeoutDuration: 5000,
  }));
}

export interface GoogleIdentity {
  googleId: string;
  email: string;
  name: string | null;
  picture: string | null;
}

export class GoogleAuthError extends Error {}

export async function verifyGoogleCredential(credential: string): Promise<GoogleIdentity> {
  const clientId = env.google.clientId;
  if (!clientId) throw new GoogleAuthError('Google sign-in is not configured.');

  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(credential, jwks(), { issuer: GOOGLE_ISSUERS, audience: clientId }));
  } catch {
    throw new GoogleAuthError('Google sign-in could not be verified. Please try again.');
  }

  const email = typeof payload.email === 'string' ? payload.email.toLowerCase().trim() : '';
  if (!email || payload.email_verified !== true) {
    throw new GoogleAuthError('Your Google account does not have a verified email address.');
  }
  if (typeof payload.sub !== 'string' || !payload.sub) throw new GoogleAuthError('Google sign-in returned an incomplete profile.');

  const picture = typeof payload.picture === 'string' && payload.picture.startsWith('https://') ? payload.picture : null;
  return {
    googleId: payload.sub,
    email,
    name: typeof payload.name === 'string' ? payload.name.slice(0, 80) : null,
    picture,
  };
}
