import { z } from 'zod';
import { idParams, route } from '@/lib/api/route';
import { requireListAccess } from '@/lib/lists/access';
import { previewAlertRules } from '@/lib/lists/service';

const body = z.object({ rules: z.unknown() });

/** Shows how many of the list's open jobs a draft set of rules would match, without saving. */
export const POST = route(
  { params: idParams, body, rateLimit: { name: 'alerts:preview', limit: 120, windowSeconds: 600, by: 'user' } },
  async ({ user, params, body }) => {
    const access = await requireListAccess(params.id, user.id);
    return previewAlertRules(access.list.id, body.rules);
  },
);
