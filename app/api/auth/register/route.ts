import { z } from 'zod';
import { route } from '@/lib/api/route';
import { registerAccount } from '@/lib/auth/accounts';

const body = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(80, 'Use at most 80 characters.'),
  email: z.email('Enter a valid email address.').max(254),
  password: z.string().min(1, 'Choose a password.').max(200),
  timezone: z.string().max(64).optional(),
});

/** Starts a sign-up. Returns a ticket that the browser presents with the emailed code. */
export const POST = route(
  { auth: 'public', body, rateLimit: { name: 'auth:register', limit: 10, windowSeconds: 900, distributed: true } },
  async ({ body }) => {
    const result = await registerAccount(body);
    return { ticket: result.ticket, email: result.email };
  },
);
