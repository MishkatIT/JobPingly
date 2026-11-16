import { z } from 'zod';
import { errors } from '@/lib/api/errors';
import { route } from '@/lib/api/route';
import { actorOf } from '@/lib/audit';
import { BROADCAST_AUDIENCES, sendBroadcast } from '@/lib/admin/emails';
import { rateLimit } from '@/lib/security/rateLimit';

export const maxDuration = 300;

const body = z.object({
  subject: z.string().trim().min(1).max(140),
  message: z.string().trim().min(1).max(10_000),
  audience: z.enum(BROADCAST_AUDIENCES).default('all'),
  dryRun: z.boolean().default(false),
});

/**
 * `dryRun: true` previews an announcement (recipient count and rendered HTML)
 * and sends nothing; a real send is limited separately, so reviewing a draft
 * several times never uses up the sending allowance.
 */
export const POST = route(
  { permission: 'emails.send', body, rateLimit: { name: 'admin:broadcast-preview', limit: 60, windowSeconds: 3600, by: 'user' } },
  async ({ req, user, body }) => {
    if (!body.dryRun) {
      const limit = await rateLimit({ key: `admin:broadcast:${user.id}`, limit: 5, windowSeconds: 3600, distributed: true });
      if (!limit.allowed) throw errors.tooManyRequests(limit.retryAfterSeconds, 'Only five announcements can be sent per hour.');
    }
    return sendBroadcast(actorOf(user), body, req);
  },
);
