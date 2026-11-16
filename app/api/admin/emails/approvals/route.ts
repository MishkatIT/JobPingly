import { z } from 'zod';
import { pageQuery, paginated, route, searchString } from '@/lib/api/route';
import { actorOf } from '@/lib/audit';
import { approveAllPending, listApprovals, setApprovals } from '@/lib/admin/emails';

const query = pageQuery.extend({ q: searchString, status: z.enum(['all', 'pending', 'approved', 'unapproved']).default('pending') });

export const GET = route({ permission: 'emails.read', query }, async ({ query }) => {
  const result = await listApprovals(query);
  return paginated(result.items, { page: query.page, pageSize: query.pageSize, total: result.total }, { counts: result.counts });
});

const body = z.union([
  z.object({ action: z.enum(['approve', 'revoke']), emails: z.array(z.email()).min(1).max(500) }),
  z.object({ action: z.literal('approve_all_pending') }),
]);

export const POST = route({ permission: 'emails.manage', body }, async ({ req, user, body }) => {
  if (body.action === 'approve_all_pending') return approveAllPending(actorOf(user), req);
  return setApprovals(actorOf(user), body.emails, body.action === 'approve', req);
});
