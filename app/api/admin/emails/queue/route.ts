import { z } from 'zod';
import { route } from '@/lib/api/route';
import { actorOf } from '@/lib/audit';
import { queueDiagnostics, runQueueAction } from '@/lib/admin/emails';

export const maxDuration = 60;

/** A dry run of the alert processor: who would get an email now, and why the rest are waiting. */
export const GET = route({ permission: 'emails.read' }, async () => queueDiagnostics());

const body = z.object({
  /** process: run normally. flush: send now, ignoring schedule, quota and staggering. clear: discard pending alerts. */
  action: z.enum(['process', 'flush', 'clear']),
});

export const POST = route(
  { permission: 'emails.manage', body, rateLimit: { name: 'admin:queue', limit: 10, windowSeconds: 300, by: 'user' } },
  async ({ req, user, body }) => runQueueAction(actorOf(user), body.action, req),
);
