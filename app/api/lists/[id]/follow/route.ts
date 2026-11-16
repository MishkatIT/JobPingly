import { idParams, route } from '@/lib/api/route';
import { requireListAccess } from '@/lib/lists/access';
import { followList, unfollowList } from '@/lib/lists/service';

export const POST = route(
  { params: idParams, rateLimit: { name: 'lists:follow', limit: 60, windowSeconds: 3600, by: 'user' } },
  async ({ user, params }) => {
    const access = await requireListAccess(params.id, user.id);
    return followList(user.id, access);
  },
);

/** Unfollowing works even if the list has since been made private or deleted. */
export const DELETE = route({ params: idParams }, async ({ user, params }) => unfollowList(user.id, params.id));
