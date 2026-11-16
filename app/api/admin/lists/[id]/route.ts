import { z } from 'zod';
import { idParams, route } from '@/lib/api/route';
import { actorOf } from '@/lib/audit';
import { applyListAction, purgeList } from '@/lib/admin/lists';

const body = z.object({ action: z.enum(['feature', 'unfeature', 'make_private', 'trash', 'restore']) });

export const POST = route({ permission: 'lists.manage', params: idParams, body }, async ({ req, user, params, body }) =>
  applyListAction(actorOf(user), params.id, body.action, req),
);

/** Permanent deletion; the list must already be in the trash. */
export const DELETE = route({ permission: 'lists.delete', params: idParams }, async ({ req, user, params }) => {
  await purgeList(actorOf(user), params.id, req);
  return { deleted: true };
});
