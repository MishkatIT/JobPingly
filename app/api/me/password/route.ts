import { z } from 'zod';
import { route } from '@/lib/api/route';
import { changePassword } from '@/lib/auth/accounts';

const body = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: z.string().min(1, 'Choose a new password.').max(200),
});

/** Changes the password and signs out every other device. */
export const POST = route(
  { body, rateLimit: { name: 'me:password', limit: 10, windowSeconds: 900, by: 'user' } },
  async ({ user, session, body }) => {
    await changePassword(user.id, body, session.id);
    return { changed: true };
  },
);
