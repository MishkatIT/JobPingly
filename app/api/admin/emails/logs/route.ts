import { z } from 'zod';
import { pageQuery, paginated, route, searchString } from '@/lib/api/route';
import { EMAIL_TEMPLATE_TYPES } from '@/lib/constants';
import { listEmailLogs } from '@/lib/admin/emails';

const query = pageQuery.extend({
  q: searchString,
  template: z.enum(EMAIL_TEMPLATE_TYPES).optional(),
  status: z.enum(['sent', 'failed', 'skipped']).optional(),
});

export const GET = route({ permission: 'emails.read', query }, async ({ query }) => {
  const result = await listEmailLogs(query);
  return paginated(result.items, { page: query.page, pageSize: query.pageSize, total: result.total });
});
