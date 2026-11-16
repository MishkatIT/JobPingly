import { after } from 'next/server';
import { z } from 'zod';
import { route } from '@/lib/api/route';
import { requestPasswordReset } from '@/lib/auth/accounts';

const body = z.object({ email: z.email('Enter a valid email address.').max(254) });

/**
 * Always answers the same way and does the work after responding, so neither
 * the message nor the response time reveals whether the address has an account.
 */
export const POST = route(
  { auth: 'public', body, rateLimit: { name: 'auth:forgot', limit: 10, windowSeconds: 900, distributed: true } },
  async ({ body }) => {
    after(() => requestPasswordReset(body.email).catch(error => console.error('[auth] Password reset request failed:', error)));
    return { sent: true };
  },
);
