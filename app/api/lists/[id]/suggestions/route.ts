import { z } from 'zod';
import { idParams, route } from '@/lib/api/route';
import { requireListAccess } from '@/lib/lists/access';
import { suggestCompany } from '@/lib/lists/members';
import { listSuggestions } from '@/lib/lists/service';

export const GET = route({ params: idParams }, async ({ user, params }) => {
  const access = await requireListAccess(params.id, user.id);
  return listSuggestions(access);
});

const body = z.object({
  url: z.string().trim().min(1, 'Paste the address of the careers page.').max(2048),
  companyName: z.string().max(120).nullable().optional(),
});

/** Suggests a company for someone else's public watchlist. */
export const POST = route({ params: idParams, body }, async ({ user, params, body }) => {
  const access = await requireListAccess(params.id, user.id);
  return suggestCompany(user.id, access, body);
});
