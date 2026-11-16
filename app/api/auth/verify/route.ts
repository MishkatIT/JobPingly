import { z } from 'zod';
import { route } from '@/lib/api/route';
import { completeVerification } from '@/lib/auth/accounts';
import { landingPathFor, sessionResponse } from '@/lib/auth/respond';

const body = z.object({
  ticket: z.string().regex(/^[a-f0-9]{64}$/, 'Your sign-up session has expired. Start again from the sign-up form.'),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from the email.'),
  next: z.string().max(500).optional(),
});

export const POST = route(
  { auth: 'public', body, rateLimit: { name: 'auth:verify', limit: 30, windowSeconds: 900, distributed: true } },
  async ({ req, body }) => {
    const { userId } = await completeVerification(body.ticket, body.code);
    return sessionResponse(userId, req, { redirectTo: await landingPathFor(userId, body.next) });
  },
);
