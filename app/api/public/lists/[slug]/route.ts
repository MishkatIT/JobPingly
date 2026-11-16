import { z } from 'zod';
import { errors } from '@/lib/api/errors';
import { route } from '@/lib/api/route';
import { publicListBySlug } from '@/lib/public/directory';
import { getSetting } from '@/lib/settings/store';

const params = z.object({ slug: z.string().min(1).max(120) });

export const GET = route({ auth: 'optional', params }, async ({ user, params }) => {
  if (!(await getSetting('public_lists.enabled'))) throw errors.unavailable('The public directory is turned off.');
  const detail = await publicListBySlug(params.slug, user?.id ?? null);
  if (!detail) throw errors.notFound('Watchlist');
  return detail;
});
