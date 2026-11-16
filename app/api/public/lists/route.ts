import { z } from 'zod';
import { errors } from '@/lib/api/errors';
import { pageQuery, paginated, route, searchString } from '@/lib/api/route';
import { DIRECTORY_SORTS, publicDirectory } from '@/lib/public/directory';
import { getSetting } from '@/lib/settings/store';

const query = pageQuery.extend({
  q: searchString,
  tag: z.string().max(30).optional(),
  sort: z.enum(DIRECTORY_SORTS).default('popular'),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
});

export const GET = route({ auth: 'public', query, rateLimit: { name: 'public:lists', limit: 120, windowSeconds: 60 } }, async ({ query }) => {
  if (!(await getSetting('public_lists.enabled'))) throw errors.unavailable('The public directory is turned off.');
  const result = await publicDirectory({ q: query.q, tag: query.tag, sort: query.sort, page: query.page, pageSize: query.pageSize });
  return paginated(result.items, { page: query.page, pageSize: query.pageSize, total: result.total });
});
