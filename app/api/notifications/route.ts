import { z } from 'zod';
import { offsetOf, paginated, pageQuery, queryBoolean, route } from '@/lib/api/route';
import { listNotifications, markRead } from '@/lib/notifications/inapp';

const query = pageQuery.extend({ unread: queryBoolean });

export const GET = route({ query }, async ({ user, query }) => {
  const result = await listNotifications(user.id, { limit: query.pageSize, offset: offsetOf(query), unreadOnly: query.unread });
  return paginated(result.items, { page: query.page, pageSize: query.pageSize, total: query.unread ? result.unread : result.total }, { unread: result.unread });
});

const body = z.union([z.object({ all: z.literal(true) }), z.object({ ids: z.array(z.uuid()).min(1).max(200) })]);

/** Marks notifications as read: `{ "all": true }` or `{ "ids": [...] }`. */
export const POST = route({ body }, async ({ user, body }) => {
  const updated = await markRead(user.id, 'all' in body ? 'all' : body.ids);
  return { updated };
});
