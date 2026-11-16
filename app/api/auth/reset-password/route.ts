import { z } from 'zod';
import { route } from '@/lib/api/route';
import { resetPasswordWithToken } from '@/lib/auth/accounts';
import { landingPathFor, sessionResponse } from '@/lib/auth/respond';

const body = z.object({
  token: z.string().max(128),
  password: z.string().min(1, 'Choose a new password.').max(200),
});

export const POST = route(
  { auth: 'public', body, rateLimit: { name: 'auth:reset', limit: 15, windowSeconds: 900, distributed: true } },
  async ({ req, body }) => {
    const { userId } = await resetPasswordWithToken(body.token, body.password);
    return sessionResponse(userId, req, { redirectTo: await landingPathFor(userId) });
  },
);
