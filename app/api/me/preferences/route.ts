import { z } from 'zod';
import { route } from '@/lib/api/route';
import { getNotificationPreferences, updateNotificationPreferences } from '@/lib/users/service';

export const GET = route({}, async ({ user }) => getNotificationPreferences(user.id));

const body = z.object({
  emailEnabled: z.boolean().optional(),
  frequency: z.string().max(40).optional(),
  digestHour: z.number().int().min(0).max(23).optional(),
  digestMinute: z.number().int().min(0).max(59).optional(),
  timezone: z.string().max(64).optional(),
  settings: z
    .object({ inApp: z.boolean().optional(), jobChanges: z.boolean().optional(), sourceFailures: z.boolean().optional() })
    .optional(),
});

export const PUT = route({ body }, async ({ user, body }) => updateNotificationPreferences(user.id, body));
