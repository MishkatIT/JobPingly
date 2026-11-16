import { z } from 'zod';
import { pageQuery, paginated, route, searchString } from '@/lib/api/route';
import { ISSUE_CATEGORIES, ISSUE_STATUSES } from '@/lib/constants';
import { listIssues } from '@/lib/admin/operations';

const query = pageQuery.extend({
  q: searchString,
  status: z.enum(['all', ...ISSUE_STATUSES]).default('open'),
  category: z.enum(ISSUE_CATEGORIES).optional(),
});

export const GET = route({ permission: 'issues.read', query }, async ({ query }) => {
  const result = await listIssues(query);
  return paginated(result.items, { page: query.page, pageSize: query.pageSize, total: result.total }, { counts: result.counts });
});
