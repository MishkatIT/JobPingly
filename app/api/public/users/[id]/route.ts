import { errors } from '@/lib/api/errors';
import { idParams, route } from '@/lib/api/route';
import { publicProfile } from '@/lib/public/directory';

/** A curator's public profile: only exists for people who publish at least one watchlist. */
export const GET = route({ auth: 'public', params: idParams }, async ({ params }) => {
  const profile = await publicProfile(params.id);
  if (!profile) throw errors.notFound('Profile');
  return profile;
});
