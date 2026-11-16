import { NextResponse } from 'next/server';
import { route } from '@/lib/api/route';
import { clearSessionCookies, currentSessionToken, revokeSessionByToken } from '@/lib/auth/session';

export const POST = route({ auth: 'public', allowInMaintenance: true }, async ({ req }) => {
  const token = currentSessionToken(req);
  if (token) await revokeSessionByToken(token);
  const response = NextResponse.json({ data: { signedOut: true } });
  clearSessionCookies(response);
  return response;
});
