import { z } from 'zod';
import { pageQuery, paginated, queryBoolean, route, searchString } from '@/lib/api/route';
import { JOB_STATUS_FILTERS, listJobsAdmin, sourceSummary } from '@/lib/admin/jobs';

const query = pageQuery.extend({
  q: searchString,
  status: z.enum(JOB_STATUS_FILTERS).default('active'),
  source: z.uuid().optional(),
  duplicates: queryBoolean,
});

/** `meta.source` names the source when the list is filtered by one. */
export const GET = route({ permission: 'jobs.read', query }, async ({ query }) => {
  const [result, source] = await Promise.all([
    listJobsAdmin({ q: query.q, status: query.status, sourceId: query.source, duplicates: query.duplicates, page: query.page, pageSize: query.pageSize }),
    query.source ? sourceSummary(query.source) : Promise.resolve(null),
  ]);
  return paginated(result.items, { page: query.page, pageSize: query.pageSize, total: result.total }, { source });
});
