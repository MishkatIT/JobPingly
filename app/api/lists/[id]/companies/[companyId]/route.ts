import { z } from 'zod';
import { route } from '@/lib/api/route';
import { removeCompanyFromList, updateListCompany } from '@/lib/companies/service';
import { requireListAccess } from '@/lib/lists/access';

const params = z.object({ id: z.uuid(), companyId: z.uuid() });

const body = z.object({
  isPaused: z.boolean().optional(),
  category: z.string().max(60).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  url: z.string().trim().min(1).max(2048).optional(),
});

export const PATCH = route({ params, body }, async ({ user, params, body }) => {
  const access = await requireListAccess(params.id, user.id);
  return updateListCompany(access, user.id, params.companyId, body);
});

export const DELETE = route({ params }, async ({ user, params }) => {
  const access = await requireListAccess(params.id, user.id);
  await removeCompanyFromList(access, params.companyId);
  return { removed: true };
});
