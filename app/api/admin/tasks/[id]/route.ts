import { z } from 'zod';
import { idParams, route } from '@/lib/api/route';
import { actorOf } from '@/lib/audit';
import { applyTaskAction } from '@/lib/admin/operations';

const body = z.object({ action: z.enum(['retry', 'cancel']) });

export const POST = route({ permission: 'workers.manage', params: idParams, body }, async ({ req, user, params, body }) =>
  applyTaskAction(actorOf(user), params.id, body.action, req),
);
