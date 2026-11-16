import { route } from '@/lib/api/route';
import { revokeAllSessions } from '@/lib/auth/session';
import { listSessions } from '@/lib/users/service';

export const GET = route({}, async ({ user, session }) => listSessions(user.id, session.id));

/** Signs out every device except this one. */
export const DELETE = route({}, async ({ user, session }) => {
  const revoked = await revokeAllSessions(user.id, session.id);
  return { revoked };
});
