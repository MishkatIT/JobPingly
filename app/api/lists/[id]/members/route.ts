import { z } from 'zod';
import { errors } from '@/lib/api/errors';
import { idParams, route } from '@/lib/api/route';
import { requireListAccess } from '@/lib/lists/access';
import { inviteMember } from '@/lib/lists/members';
import { listMembers } from '@/lib/lists/service';

export const GET = route({ params: idParams }, async ({ user, params }) => {
  const access = await requireListAccess(params.id, user.id);
  if (access.role === 'viewer') throw errors.forbidden('Only members can see who maintains this watchlist.');
  return listMembers(access);
});

const body = z.object({
  email: z.email('Enter a valid email address.').max(254),
  role: z.enum(['editor', 'moderator']).default('editor'),
});

export const POST = route({ params: idParams, body }, async ({ user, params, body }) => {
  const access = await requireListAccess(params.id, user.id);
  return inviteMember(access, user, body.email, body.role);
});
