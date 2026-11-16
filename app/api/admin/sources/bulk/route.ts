import { z } from 'zod';
import { errors } from '@/lib/api/errors';
import { route } from '@/lib/api/route';
import { actorOf } from '@/lib/audit';
import { deleteSources, queueSourceScans, setSourcePaused } from '@/lib/admin/sources';
import { can } from '@/lib/auth/rbac';

const body = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
  action: z.enum(['scan', 'force_scan', 'pause', 'resume', 'delete']),
  reason: z.string().max(200).optional(),
  /** Required for delete. */
  confirm: z.boolean().optional(),
});

export const POST = route({ permission: 'sources.manage', body }, async ({ req, user, body }) => {
  const actor = actorOf(user);
  switch (body.action) {
    case 'scan':
    case 'force_scan':
      return queueSourceScans(actor, body.ids, body.action === 'force_scan', req);
    case 'pause':
    case 'resume':
      return { updated: await setSourcePaused(actor, body.ids, body.action === 'pause', body.reason ?? null, req) };
    case 'delete':
      if (!can(user.role, 'sources.delete')) throw errors.forbidden('Your role cannot delete sources.');
      if (body.confirm !== true) throw errors.badRequest('Deleting sources must be confirmed.');
      return { deleted: await deleteSources(actor, body.ids, req) };
  }
});
