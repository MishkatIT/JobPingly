import { errors } from '@/lib/api/errors';
import { idParams, route } from '@/lib/api/route';
import { revokeSessionById } from '@/lib/auth/session';

export const DELETE = route({ params: idParams }, async ({ user, params }) => {
  const revoked = await revokeSessionById(user.id, params.id);
  if (!revoked) throw errors.notFound('Session');
  return { revoked: true };
});
