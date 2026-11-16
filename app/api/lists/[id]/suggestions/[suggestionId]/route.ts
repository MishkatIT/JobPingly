import { z } from 'zod';
import { route } from '@/lib/api/route';
import { requireListAccess } from '@/lib/lists/access';
import { reviewSuggestion } from '@/lib/lists/members';

const params = z.object({ id: z.uuid(), suggestionId: z.uuid() });
const body = z.object({ action: z.enum(['approve', 'reject']) });

export const POST = route({ params, body }, async ({ user, params, body }) => {
  const access = await requireListAccess(params.id, user.id);
  return reviewSuggestion(access, user.id, params.suggestionId, body.action === 'approve');
});
