import { z } from 'zod';
import { created, pageQuery, paginated, route, searchString } from '@/lib/api/route';
import { actorOf } from '@/lib/audit';
import { SOURCE_SORTS, SOURCE_STATUS_FILTERS, createSourceAsAdmin, listSources } from '@/lib/admin/sources';

const query = pageQuery.extend({
  q: searchString,
  status: z.enum(SOURCE_STATUS_FILTERS).default('all'),
  adapter: z.string().max(40).optional(),
  sort: z.enum(SOURCE_SORTS).default('name'),
});

export const GET = route({ permission: 'sources.read', query }, async ({ query }) => {
  const result = await listSources(query);
  return paginated(result.items, { page: query.page, pageSize: query.pageSize, total: result.total });
});

const body = z.object({
  url: z.string().trim().min(1).max(2048),
  companyName: z.string().max(120).nullable().optional(),
  scanNow: z.boolean().default(true),
});

export const POST = route({ permission: 'sources.manage', body }, async ({ req, user, body }) => {
  const source = await createSourceAsAdmin(actorOf(user), body, req);
  return created({ id: source.id, url: source.url });
});
