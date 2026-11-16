import { z } from 'zod';
import { route } from '@/lib/api/route';
import { actorOf } from '@/lib/audit';
import { hideJobs, restoreJobs } from '@/lib/admin/jobs';

const body = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
  action: z.enum(['hide', 'restore']),
  reason: z.string().max(300).optional(),
});

/** Removes spam or invalid postings (hidden everywhere and never alerted), or restores them. */
export const POST = route({ permission: 'jobs.manage', body }, async ({ req, user, body }) => {
  const actor = actorOf(user);
  const updated = body.action === 'hide' ? await hideJobs(actor, body.ids, body.reason ?? '', req) : await restoreJobs(actor, body.ids, req);
  return { updated };
});
