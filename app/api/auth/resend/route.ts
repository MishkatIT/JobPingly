import { z } from 'zod';
import { route } from '@/lib/api/route';
import { resendVerificationCode } from '@/lib/auth/accounts';

const body = z.object({ ticket: z.string().regex(/^[a-f0-9]{64}$/, 'Start again from the sign-up form.') });

export const POST = route(
  { auth: 'public', body, rateLimit: { name: 'auth:resend', limit: 10, windowSeconds: 900, distributed: true } },
  async ({ body }) => {
    const result = await resendVerificationCode(body.ticket);
    return { sent: result.retryAfterSeconds === undefined, retryAfterSeconds: result.retryAfterSeconds ?? 0 };
  },
);
