import { z } from 'zod';
import { pageQuery, paginated, route, searchString } from '@/lib/api/route';
import { USER_SORTS, USER_STATUS_FILTERS, listUsers } from '@/lib/admin/users';
import { ROLES } from '@/lib/auth/rbac';
import { PLAN_IDS } from '@/lib/plans';

const query = pageQuery.extend({
  q: searchString,
  status: z.enum(USER_STATUS_FILTERS).default('all'),
  role: z.enum(ROLES).optional(),
  plan: z.enum(PLAN_IDS).optional(),
  sort: z.enum(USER_SORTS).default('newest'),
});

export const GET = route({ permission: 'users.read', query }, async ({ query }) => {
  const result = await listUsers(query);
  return paginated(result.items, { page: query.page, pageSize: query.pageSize, total: result.total });
});
