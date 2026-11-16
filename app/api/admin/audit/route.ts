import { z } from 'zod';
import { pageQuery, paginated, route, searchString } from '@/lib/api/route';
import { auditActionOptions, listAudit } from '@/lib/admin/operations';

const query = pageQuery.extend({
  action: z.string().max(60).optional(),
  actor: searchString,
  targetType: z.string().max(30).optional(),
  targetId: z.string().max(80).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const GET = route({ permission: 'audit.read', query }, async ({ query }) => {
  const result = await listAudit(query);
  return paginated(result.items, { page: query.page, pageSize: query.pageSize, total: result.total }, { actions: auditActionOptions() });
});
