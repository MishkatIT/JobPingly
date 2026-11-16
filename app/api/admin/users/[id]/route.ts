import { z } from 'zod';
import { errors } from '@/lib/api/errors';
import { idParams, route } from '@/lib/api/route';
import { actorOf } from '@/lib/audit';
import { applyUserAction, deleteUserAsAdmin, userDetail } from '@/lib/admin/users';
import { can, ROLES } from '@/lib/auth/rbac';
import { PLAN_IDS } from '@/lib/plans';

export const GET = route({ permission: 'users.read', params: idParams }, async ({ params }) => {
  const detail = await userDetail(params.id);
  if (!detail) throw errors.notFound('User');
  return detail;
});

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suspend'), reason: z.string().min(1).max(300) }),
  z.object({ action: z.literal('reactivate') }),
  z.object({ action: z.literal('verify') }),
  z.object({ action: z.literal('set_role'), role: z.enum(ROLES) }),
  z.object({ action: z.literal('set_plan'), plan: z.enum(PLAN_IDS), expiresAt: z.string().max(40).nullable().optional() }),
  z.object({ action: z.literal('set_exemptions'), quotaExempt: z.boolean().optional(), frequencyEnforcementExempt: z.boolean().optional() }),
  z.object({ action: z.literal('send_reset_link') }),
  z.object({ action: z.literal('revoke_sessions') }),
  z.object({ action: z.literal('approve_email') }),
  z.object({ action: z.literal('revoke_email') }),
]);

const REQUIRED: Record<string, Parameters<typeof can>[1]> = {
  set_role: 'users.roles',
  set_plan: 'users.plans',
  set_exemptions: 'users.plans',
  approve_email: 'emails.manage',
  revoke_email: 'emails.manage',
};

export const POST = route({ permission: 'users.manage', params: idParams, body }, async ({ req, user, params, body }) => {
  const required = REQUIRED[body.action];
  if (required && !can(user.role, required)) throw errors.forbidden('Your role cannot do that.');
  return applyUserAction(actorOf(user), params.id, body, req);
});

export const DELETE = route({ permission: 'users.delete', params: idParams }, async ({ req, user, params }) => {
  await deleteUserAsAdmin(actorOf(user), params.id, req);
  return { deleted: true };
});
