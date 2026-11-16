import { z } from 'zod';
import { route } from '@/lib/api/route';
import { actorOf } from '@/lib/audit';
import { settingsForAdmin, updateSettingAsAdmin } from '@/lib/admin/operations';

export const GET = route({ permission: 'settings.read' }, async ({ user }) => settingsForAdmin(user.role));

const body = z.object({ key: z.string().max(80), value: z.unknown() });

/** Changes one setting. The value is validated against the setting's definition and audited. */
export const PUT = route({ permission: 'settings.read', body, allowInMaintenance: true }, async ({ req, user, body }) =>
  updateSettingAsAdmin(actorOf(user), body.key, body.value, req),
);
