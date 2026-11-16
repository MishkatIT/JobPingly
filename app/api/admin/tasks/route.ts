import { z } from 'zod';
import { pageQuery, paginated, route } from '@/lib/api/route';
import { TASK_STATUS_FILTERS, listTasks } from '@/lib/admin/operations';

const query = pageQuery.extend({ status: z.enum(TASK_STATUS_FILTERS).default('all'), source: z.uuid().optional() });

export const GET = route({ permission: 'workers.read', query }, async ({ query }) => {
  const result = await listTasks({ status: query.status, sourceId: query.source, page: query.page, pageSize: query.pageSize });
  return paginated(result.items, { page: query.page, pageSize: query.pageSize, total: result.total });
});
