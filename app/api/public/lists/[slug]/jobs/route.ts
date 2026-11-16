import { z } from 'zod';
import { errors } from '@/lib/api/errors';
import { pageQuery, paginated, route, searchString } from '@/lib/api/route';
import { jobsForPublicList } from '@/lib/jobs/queries';
import { loadListAccessBySlug } from '@/lib/lists/access';
import { getSetting } from '@/lib/settings/store';

const params = z.object({ slug: z.string().min(1).max(120) });
const query = pageQuery.extend({ q: searchString });

export const GET = route({ auth: 'public', params, query, rateLimit: { name: 'public:jobs', limit: 120, windowSeconds: 60 } }, async ({ params, query }) => {
  if (!(await getSetting('public_lists.enabled'))) throw errors.unavailable('The public directory is turned off.');
  const access = await loadListAccessBySlug(params.slug, null);
  if (!access) throw errors.notFound('Watchlist');
  const result = await jobsForPublicList(access.list.id, { q: query.q, page: query.page, pageSize: query.pageSize });
  return paginated(result.items, { page: query.page, pageSize: query.pageSize, total: result.total });
});
