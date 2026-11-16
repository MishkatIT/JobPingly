import { z } from 'zod';
import { idParams, route } from '@/lib/api/route';
import { actorOf } from '@/lib/audit';
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from '@/lib/constants';
import { deleteIssue, updateIssue } from '@/lib/admin/operations';

const body = z.object({
  status: z.enum(ISSUE_STATUSES).optional(),
  priority: z.enum(ISSUE_PRIORITIES).optional(),
  adminNotes: z.string().max(5000).nullable().optional(),
});

export const PATCH = route({ permission: 'issues.manage', params: idParams, body }, async ({ req, user, params, body }) =>
  updateIssue(actorOf(user), params.id, body, req),
);

export const DELETE = route({ permission: 'issues.manage', params: idParams }, async ({ req, user, params }) => {
  await deleteIssue(actorOf(user), params.id, req);
  return { deleted: true };
});
