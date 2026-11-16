import { z } from 'zod';
import { idParams, route } from '@/lib/api/route';
import { actorOf } from '@/lib/audit';
import { queueSourceScans } from '@/lib/admin/sources';
import { resumeSourceIfAutoPaused } from '@/lib/monitoring/queue';

const body = z.object({ force: z.boolean().default(true) });

/** Queues a high-priority scan. An automatically paused source is put back into rotation. */
export const POST = route({ permission: 'sources.manage', params: idParams, body }, async ({ req, user, params, body }) => {
  await resumeSourceIfAutoPaused(params.id);
  return queueSourceScans(actorOf(user), [params.id], body.force, req);
});
