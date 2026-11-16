import { z } from 'zod';
import { created, idParams, route } from '@/lib/api/route';
import { requireListAccess } from '@/lib/lists/access';
import { duplicateList } from '@/lib/lists/service';

const body = z.object({ name: z.string().trim().max(80).optional() });

/** Copies the watchlist (yours, a shared one, or any public one) into a new private list. */
export const POST = route(
  { params: idParams, body, rateLimit: { name: 'lists:duplicate', limit: 20, windowSeconds: 3600, by: 'user' } },
  async ({ user, params, body }) => {
    const access = await requireListAccess(params.id, user.id);
    const list = await duplicateList(user, access, body.name);
    return created({ id: list.id, slug: list.slug, name: list.name });
  },
);
