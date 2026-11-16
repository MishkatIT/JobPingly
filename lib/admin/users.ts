import { and, desc, eq, sql } from 'drizzle-orm';
import { errors } from '@/lib/api/errors';
import { recordAudit, type AuditActor } from '@/lib/audit';
import { ensureEmailApproval, requestPasswordReset, sendWelcomeOnce } from '@/lib/auth/accounts';
import { canActOnUser, canAssignRole, normalizeRole, type Role } from '@/lib/auth/rbac';
import { invalidateSessionCache, revokeAllSessions } from '@/lib/auth/session';
import { client, db } from '@/lib/db/client';
import { adminAuditLog, emailApprovals, refreshTokens, sentEmailLogs, users } from '@/lib/db/schema';
import { PLAN_IDS, type PlanId } from '@/lib/plans';
import { cleanText } from '@/lib/security/html';
import { avatarUrlSql } from '@/lib/users/avatar';

export const USER_STATUS_FILTERS = ['all', 'active', 'unverified', 'suspended', 'staff'] as const;
export const USER_SORTS = ['newest', 'oldest', 'active', 'name'] as const;

export async function listUsers(options: {
  q?: string;
  status: (typeof USER_STATUS_FILTERS)[number];
  role?: string;
  plan?: string;
  sort: (typeof USER_SORTS)[number];
  page: number;
  pageSize: number;
}) {
  const pattern = options.q ? `%${options.q.replace(/[\\%_]/g, char => `\\${char}`)}%` : null;
  const statusCondition = {
    all: client``,
    active: client`AND u.email_verified AND NOT u.is_blocked`,
    unverified: client`AND NOT u.email_verified`,
    suspended: client`AND u.is_blocked`,
    staff: client`AND u.role IN ('support', 'moderator', 'admin', 'owner')`,
  }[options.status];
  const order = {
    newest: client`u.created_at DESC`,
    oldest: client`u.created_at ASC`,
    active: client`u.last_active_at DESC NULLS LAST`,
    name: client`lower(coalesce(u.name, u.email))`,
  }[options.sort];

  const rows = await client<
    {
      id: string;
      email: string;
      name: string | null;
      avatarUrl: string | null;
      role: string;
      plan: string;
      emailVerified: boolean;
      isBlocked: boolean;
      blockedReason: string | null;
      quotaExempt: boolean;
      lastActiveAt: Date | null;
      createdAt: Date;
      approval: string | null;
      lists: number;
      following: number;
      tracked: number;
      total: number;
    }[]
  >`
    SELECT u.id, u.email, u.name, u.role, u.plan, u.email_verified AS "emailVerified", u.is_blocked AS "isBlocked",
      u.blocked_reason AS "blockedReason", u.quota_exempt AS "quotaExempt", u.last_active_at AS "lastActiveAt", u.created_at AS "createdAt",
      CASE WHEN u.avatar_url LIKE 'data:%' THEN '/api/avatar/' || u.id::text || '?v=' || substr(md5(u.avatar_url), 1, 8) ELSE u.avatar_url END AS "avatarUrl",
      a.status AS approval,
      (SELECT count(*) FROM lists l WHERE l.user_id = u.id AND l.deleted_at IS NULL)::int AS lists,
      (SELECT count(*) FROM list_subscriptions s JOIN lists l ON l.id = s.list_id WHERE s.user_id = u.id AND l.user_id <> u.id)::int AS following,
      (SELECT count(*) FROM user_jobs j WHERE j.user_id = u.id AND j.status <> 'dismissed')::int AS tracked,
      count(*) OVER()::int AS total
    FROM users u
    LEFT JOIN email_approvals a ON a.email = u.email
    WHERE true ${statusCondition}
      ${options.role ? client`AND u.role = ${options.role}` : client``}
      ${options.plan ? client`AND u.plan = ${options.plan}` : client``}
      ${pattern ? client`AND (u.email ILIKE ${pattern} OR u.name ILIKE ${pattern} OR u.id::text = ${options.q ?? ''})` : client``}
    ORDER BY ${order}
    LIMIT ${options.pageSize} OFFSET ${(options.page - 1) * options.pageSize}
  `;
  return { items: rows.map(({ total: _total, ...row }) => row), total: rows[0]?.total ?? 0 };
}

export async function userDetail(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: avatarUrlSql,
      role: users.role,
      plan: users.plan,
      planExpiresAt: users.planExpiresAt,
      emailVerified: users.emailVerified,
      isBlocked: users.isBlocked,
      blockedReason: users.blockedReason,
      blockedAt: users.blockedAt,
      quotaExempt: users.quotaExempt,
      frequencyEnforcementExempt: users.frequencyEnforcementExempt,
      dispatchGroup: users.dispatchGroup,
      emailNotificationsEnabled: users.emailNotificationsEnabled,
      notificationPreference: users.notificationPreference,
      digestHour: users.digestHour,
      digestMinute: users.digestMinute,
      timezone: users.timezone,
      lastDigestSentAt: users.lastDigestSentAt,
      lastLoginAt: users.lastLoginAt,
      lastActiveAt: users.lastActiveAt,
      onboardingCompletedAt: users.onboardingCompletedAt,
      hasPassword: sql<boolean>`${users.passwordHash} IS NOT NULL`,
      hasGoogle: sql<boolean>`${users.googleId} IS NOT NULL`,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) return null;

  const [approval] = await db.select({ status: emailApprovals.status, approvedAt: emailApprovals.approvedAt }).from(emailApprovals).where(eq(emailApprovals.email, user.email));

  const lists = await client<{ id: string; name: string; visibility: string; relation: string; companies: number; deletedAt: Date | null }[]>`
    SELECT l.id, l.name, l.visibility, l.deleted_at AS "deletedAt",
      CASE WHEN l.user_id = ${userId} THEN 'owner' ELSE 'follower' END AS relation,
      (SELECT count(*) FROM list_career_pages x WHERE x.list_id = l.id)::int AS companies
    FROM lists l
    WHERE l.user_id = ${userId} OR EXISTS (SELECT 1 FROM list_subscriptions s WHERE s.list_id = l.id AND s.user_id = ${userId})
    ORDER BY (l.user_id = ${userId}) DESC, l.updated_at DESC
    LIMIT 100
  `;

  const [activity] = await client<{ sessions: number; tracked: number; applied: number; matches: number; pendingAlerts: number; unread: number }[]>`
    SELECT
      (SELECT count(*) FROM refresh_tokens WHERE user_id = ${userId} AND revoked_at IS NULL AND expires_at > now())::int AS sessions,
      (SELECT count(*) FROM user_jobs WHERE user_id = ${userId} AND status <> 'dismissed')::int AS tracked,
      (SELECT count(*) FROM user_jobs WHERE user_id = ${userId} AND status IN ('applied', 'interviewing', 'offer'))::int AS applied,
      (SELECT count(*) FROM job_matches WHERE user_id = ${userId})::int AS matches,
      (SELECT count(*) FROM notification_queue WHERE user_id = ${userId} AND sent_at IS NULL)::int AS "pendingAlerts",
      (SELECT count(*) FROM notifications WHERE user_id = ${userId} AND read_at IS NULL)::int AS unread
  `;

  const emails = await db
    .select({ id: sentEmailLogs.id, subject: sentEmailLogs.subject, templateType: sentEmailLogs.templateType, status: sentEmailLogs.status, deliveryStatus: sentEmailLogs.deliveryStatus, createdAt: sentEmailLogs.createdAt, errorMessage: sentEmailLogs.errorMessage })
    .from(sentEmailLogs)
    .where(eq(sentEmailLogs.recipientEmail, user.email))
    .orderBy(desc(sentEmailLogs.createdAt))
    .limit(15);

  const history = await db
    .select({ id: adminAuditLog.id, action: adminAuditLog.action, actorEmail: adminAuditLog.actorEmail, metadata: adminAuditLog.metadata, createdAt: adminAuditLog.createdAt })
    .from(adminAuditLog)
    .where(and(eq(adminAuditLog.targetType, 'user'), eq(adminAuditLog.targetId, userId)))
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(20);

  const devices = await db
    .select({ device: refreshTokens.deviceHint, lastUsedAt: refreshTokens.lastUsedAt, createdAt: refreshTokens.createdAt })
    .from(refreshTokens)
    .where(and(eq(refreshTokens.userId, userId), sql`${refreshTokens.revokedAt} IS NULL`, sql`${refreshTokens.expiresAt} > now()`))
    .orderBy(desc(sql`coalesce(${refreshTokens.lastUsedAt}, ${refreshTokens.createdAt})`))
    .limit(10);

  return { user: { ...user, role: normalizeRole(user.role) }, approval: approval ?? null, lists, activity, emails, history, devices };
}

export type UserAction =
  | { action: 'suspend'; reason: string }
  | { action: 'reactivate' }
  | { action: 'verify' }
  | { action: 'set_role'; role: Role }
  | { action: 'set_plan'; plan: PlanId; expiresAt?: string | null }
  | { action: 'set_exemptions'; quotaExempt?: boolean; frequencyEnforcementExempt?: boolean }
  | { action: 'send_reset_link' }
  | { action: 'revoke_sessions' }
  | { action: 'approve_email' }
  | { action: 'revoke_email' };

export async function applyUserAction(actor: AuditActor & { role: string }, userId: string, input: UserAction, req: { headers: Headers }) {
  const [target] = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, isBlocked: users.isBlocked, emailVerified: users.emailVerified, plan: users.plan })
    .from(users)
    .where(eq(users.id, userId));
  if (!target) throw errors.notFound('User');

  // Acting on an account requires a higher rank than the account holder.
  const guarded = ['suspend', 'reactivate', 'set_role', 'revoke_sessions', 'set_plan', 'set_exemptions'];
  if (guarded.includes(input.action) && input.action !== 'set_role' && !canActOnUser(actor, target)) {
    throw errors.forbidden(actor.id === target.id ? 'You cannot do that to your own account.' : 'You cannot change an account with an equal or higher role.');
  }

  const audit = (action: Parameters<typeof recordAudit>[0]['action'], metadata?: Record<string, unknown>) =>
    recordAudit({ action, actor, targetType: 'user', targetId: userId, metadata: { email: target.email, ...metadata }, req });

  switch (input.action) {
    case 'suspend': {
      const reason = cleanText(input.reason, 300);
      if (!reason) throw errors.validation([{ field: 'reason', message: 'Give a reason; it is shown in the audit log.' }]);
      await db.update(users).set({ isBlocked: true, blockedReason: reason, blockedAt: new Date() }).where(eq(users.id, userId));
      await revokeAllSessions(userId);
      await audit('user.suspend', { reason });
      break;
    }
    case 'reactivate':
      await db.update(users).set({ isBlocked: false, blockedReason: null, blockedAt: null }).where(eq(users.id, userId));
      await audit('user.reactivate');
      break;
    case 'verify':
      if (target.emailVerified) break;
      await db.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
      await ensureEmailApproval(userId, target.email, target.name);
      await audit('user.verify');
      break;
    case 'set_role': {
      const check = canAssignRole(actor, target, input.role);
      if (!check.allowed) throw errors.forbidden(check.reason);
      if (normalizeRole(target.role) === 'owner' && input.role !== 'owner') {
        const [{ owners }] = await client<{ owners: number }[]>`SELECT count(*)::int AS owners FROM users WHERE role = 'owner'`;
        if (owners <= 1) throw errors.conflict('This is the only owner. Make someone else an owner first.');
      }
      await db.update(users).set({ role: input.role }).where(eq(users.id, userId));
      await audit('user.role_change', { from: target.role, to: input.role });
      break;
    }
    case 'set_plan': {
      if (!(PLAN_IDS as readonly string[]).includes(input.plan)) throw errors.validation([{ field: 'plan', message: 'Unknown plan.' }]);
      const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
      if (expiresAt && Number.isNaN(expiresAt.getTime())) throw errors.validation([{ field: 'expiresAt', message: 'Invalid date.' }]);
      await db.update(users).set({ plan: input.plan, planExpiresAt: expiresAt }).where(eq(users.id, userId));
      await audit('user.plan_change', { from: target.plan, to: input.plan, expiresAt });
      break;
    }
    case 'set_exemptions': {
      const patch: Partial<typeof users.$inferInsert> = {};
      if (input.quotaExempt !== undefined) patch.quotaExempt = input.quotaExempt;
      if (input.frequencyEnforcementExempt !== undefined) patch.frequencyEnforcementExempt = input.frequencyEnforcementExempt;
      if (Object.keys(patch).length === 0) break;
      await db.update(users).set(patch).where(eq(users.id, userId));
      await audit('user.exemption_change', patch);
      break;
    }
    case 'send_reset_link':
      // Also the way to finish verifying someone who never entered their code:
      // following the link proves they own the address.
      await requestPasswordReset(target.email);
      await audit('user.resend_verification', { via: 'password_link' });
      break;
    case 'revoke_sessions': {
      const revoked = await revokeAllSessions(userId);
      await audit('user.sessions_revoked', { revoked });
      break;
    }
    case 'approve_email': {
      const [previous] = await db.select({ status: emailApprovals.status }).from(emailApprovals).where(eq(emailApprovals.email, target.email));
      await db
        .insert(emailApprovals)
        .values({ email: target.email, userId, status: 'approved', approvedAt: new Date(), approvedBy: actor.id })
        .onConflictDoUpdate({ target: emailApprovals.email, set: { status: 'approved', approvedAt: new Date(), approvedBy: actor.id, userId } });
      if (previous?.status !== 'approved') await sendWelcomeOnce(userId, target.email, target.name);
      await audit('email.approve', { email: target.email });
      break;
    }
    case 'revoke_email':
      await db
        .insert(emailApprovals)
        .values({ email: target.email, userId, status: 'unapproved' })
        .onConflictDoUpdate({ target: emailApprovals.email, set: { status: 'unapproved', approvedAt: null, approvedBy: actor.id } });
      await audit('email.revoke', { email: target.email });
      break;
  }

  invalidateSessionCache(userId);
  return userDetail(userId);
}

export async function deleteUserAsAdmin(actor: AuditActor & { role: string }, userId: string, req: { headers: Headers }) {
  const [target] = await db.select({ id: users.id, email: users.email, role: users.role }).from(users).where(eq(users.id, userId));
  if (!target) throw errors.notFound('User');
  if (!canActOnUser(actor, target)) throw errors.forbidden('You cannot delete an account with an equal or higher role.');
  await recordAudit({ action: 'user.delete', actor, targetType: 'user', targetId: userId, metadata: { email: target.email }, req });
  await db.delete(emailApprovals).where(eq(emailApprovals.email, target.email));
  await db.delete(users).where(eq(users.id, userId));
  invalidateSessionCache(userId);
}
