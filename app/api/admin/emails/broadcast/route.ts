import { z } from 'zod';
import { route } from '@/lib/api/route';
import { actorOf } from '@/lib/audit';
import { BROADCAST_AUDIENCES, sendBroadcast } from '@/lib/admin/emails';

export const maxDuration = 300;

const body = z.object({
  subject: z.string().trim().min(1).max(140),
  message: z.string().trim().min(1).max(10_000),
  audience: z.enum(BROADCAST_AUDIENCES).default('all'),
  dryRun: z.boolean().default(false),
});

export const POST = route(
  { permission: 'emails.send', body, rateLimit: { name: 'admin:broadcast', limit: 5, windowSeconds: 3600, by: 'user' } },
  async ({ req, user, body }) => sendBroadcast(actorOf(user), body, req),
);
