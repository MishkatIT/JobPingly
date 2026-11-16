import { z } from 'zod';
import { idParams, route } from '@/lib/api/route';
import { requireListAccess } from '@/lib/lists/access';
import { updateAlertSettings } from '@/lib/lists/service';

const body = z.object({
  alertsEnabled: z.boolean().optional(),
  digestFrequency: z.string().max(40).optional(),
  // Validated against the user's plan limits in the service.
  rules: z.unknown().optional(),
});

/** Your own alert settings for this watchlist. */
export const PUT = route({ params: idParams, body }, async ({ user, params, body }) => {
  const access = await requireListAccess(params.id, user.id);
  return updateAlertSettings(user, access, body);
});
