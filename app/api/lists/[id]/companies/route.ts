import { z } from 'zod';
import { created, idParams, route } from '@/lib/api/route';
import { addCompanyToList, listCompaniesOnList } from '@/lib/companies/service';
import { requireListAccess } from '@/lib/lists/access';

export const GET = route({ auth: 'optional', params: idParams }, async ({ user, params }) => {
  const access = await requireListAccess(params.id, user?.id ?? null);
  return listCompaniesOnList(access.list.id);
});

const body = z.object({
  url: z.string().trim().min(1, 'Paste the address of the careers page.').max(2048),
  companyName: z.string().max(120).nullable().optional(),
  category: z.string().max(60).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const POST = route(
  { params: idParams, body, rateLimit: { name: 'lists:add-company', limit: 120, windowSeconds: 3600, by: 'user' } },
  async ({ user, params, body }) => {
    const access = await requireListAccess(params.id, user.id);
    return created(await addCompanyToList(access, user.id, body));
  },
);
