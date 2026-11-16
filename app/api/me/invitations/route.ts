import { route } from '@/lib/api/route';
import { invitationsForUser } from '@/lib/lists/members';

export const GET = route({}, async ({ user }) => invitationsForUser(user.id));
