import { z } from 'zod';
import { pageQuery, paginated, route, searchString } from '@/lib/api/route';
import { LIST_STATE_FILTERS, listListsAdmin } from '@/lib/admin/lists';

const query = pageQuery.extend({ q: searchString, state: z.enum(LIST_STATE_FILTERS).default('active') });

export const GET = route({ permission: 'lists.read', query }, async ({ query }) => {
  const result = await listListsAdmin(query);
  return paginated(result.items, { page: query.page, pageSize: query.pageSize, total: result.total });
});
