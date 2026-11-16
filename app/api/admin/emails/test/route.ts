import { z } from 'zod';
import { route } from '@/lib/api/route';
import { actorOf } from '@/lib/audit';
import { sendTestEmail } from '@/lib/admin/emails';

const body = z.object({ to: z.email().max(254), note: z.string().max(300).nullable().optional() });

export const POST = route(
  { permission: 'emails.send', body, rateLimit: { name: 'admin:test-email', limit: 10, windowSeconds: 600, by: 'user' } },
  async ({ req, user, body }) => sendTestEmail(actorOf(user), body.to, body.note ?? null, req),
);
