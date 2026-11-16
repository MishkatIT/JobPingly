import { z } from 'zod';
import { route } from '@/lib/api/route';
import { loadListAccess } from '@/lib/lists/access';
import { removeMember } from '@/lib/lists/members';

const params = z.object({ id: z.uuid(), memberId: z.uuid() });

/** The owner can remove anyone; members can remove themselves (leave). */
export const DELETE = route({ params }, async ({ user, params }) => {
  const access = await loadListAccess(params.id, user.id);
  return removeMember(access, user.id, params.id, params.memberId);
});
