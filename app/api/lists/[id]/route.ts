import { z } from 'zod';
import { idParams, route } from '@/lib/api/route';
import { requireListAccess } from '@/lib/lists/access';
import { deleteList, listDetail, updateList } from '@/lib/lists/service';

export const GET = route({ auth: 'optional', params: idParams }, async ({ user, params }) => {
  const access = await requireListAccess(params.id, user?.id ?? null);
  return listDetail(access, user?.id ?? null);
});

const patchBody = z.object({
  name: z.string().max(80).optional(),
  description: z.string().max(300).nullable().optional(),
  visibility: z.enum(['private', 'public']).optional(),
  tags: z.array(z.string().max(30)).max(8).optional(),
  pinned: z.boolean().optional(),
});

export const PATCH = route({ params: idParams, body: patchBody }, async ({ user, params, body }) => {
  const access = await requireListAccess(params.id, user.id);
  await updateList(access, body);
  return listDetail(await requireListAccess(params.id, user.id), user.id);
});

/** Moves the watchlist to the trash. */
export const DELETE = route({ params: idParams }, async ({ user, params }) => {
  const access = await requireListAccess(params.id, user.id);
  await deleteList(access);
  return { deleted: true };
});
