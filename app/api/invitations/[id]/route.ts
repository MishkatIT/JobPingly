import { z } from 'zod';
import { idParams, route } from '@/lib/api/route';
import { respondToInvitation } from '@/lib/lists/members';

const body = z.object({ action: z.enum(['accept', 'decline']) });

export const POST = route({ params: idParams, body }, async ({ user, params, body }) =>
  respondToInvitation(user.id, params.id, body.action === 'accept'),
);
