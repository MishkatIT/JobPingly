import { db, type DbOrTx } from '@/lib/db/client';
import { adminAuditLog } from '@/lib/db/schema';
import { getClientIp } from '@/lib/security/rateLimit';

/**
 * Audit trail for administrative and security-relevant actions.
 *
 * Rows are append-only: no API route updates or deletes them. The actor's
 * email and role are copied onto the row so the trail remains readable if the
 * account is later deleted.
 */

export const AUDIT_ACTIONS = {
  // Authentication
  'auth.admin_login': 'Staff member signed in',
  'auth.login_blocked': 'Sign-in rejected for a suspended account',

  // Users
  'user.suspend': 'Suspended a user',
  'user.reactivate': 'Reactivated a user',
  'user.verify': 'Manually verified a user',
  'user.role_change': 'Changed a user role',
  'user.plan_change': 'Changed a user plan',
  'user.exemption_change': 'Changed a user exemption',
  'user.delete': 'Deleted a user',
  'user.sessions_revoked': 'Signed a user out everywhere',
  'user.resend_verification': 'Re-sent a verification code',

  // Sources
  'source.create': 'Added a source',
  'source.update': 'Edited a source',
  'source.delete': 'Deleted a source',
  'source.pause': 'Paused a source',
  'source.resume': 'Resumed a source',
  'source.scan': 'Triggered a manual scan',
  'source.adapter_override': 'Overrode ATS detection',
  'source.bulk': 'Ran a bulk action on sources',

  // Jobs
  'job.hide': 'Removed a job',
  'job.restore': 'Restored a job',
  'job.bulk': 'Ran a bulk action on jobs',

  // Lists
  'list.update': 'Edited a watchlist',
  'list.trash': 'Moved a watchlist to trash',
  'list.restore': 'Restored a watchlist',
  'list.delete': 'Permanently deleted a watchlist',
  'list.bulk': 'Ran a bulk action on watchlists',

  // Monitoring
  'monitoring.pause': 'Paused monitoring',
  'monitoring.resume': 'Resumed monitoring',
  'task.retry': 'Retried a monitoring task',
  'task.cancel': 'Cancelled a monitoring task',
  'task.run_cycle': 'Ran a worker cycle manually',
  'task.recover': 'Returned stuck monitoring tasks to the queue',
  'queue.flush': 'Flushed the notification queue',
  'queue.clear': 'Cleared the notification queue',

  // Email
  'email.approve': 'Approved an email recipient',
  'email.revoke': 'Revoked an email recipient',
  'email.test': 'Sent a test email',
  'email.broadcast': 'Sent a broadcast email',
  'email.logs_prune': 'Pruned email delivery logs',
  'email.cohort_change': 'Changed digest cohorts',
  'email.frequency_policy': 'Changed the digest frequency policy',

  // Settings
  'settings.update': 'Changed a platform setting',
  'banner.update': 'Changed the site announcement',

  // Issues
  'issue.update': 'Updated a reported issue',
  'issue.delete': 'Deleted a reported issue',

  // Data
  'data.export': 'Exported platform data',
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export interface AuditActor {
  id: string;
  email: string;
  role: string;
}

export interface AuditEntry {
  action: AuditAction;
  actor: AuditActor | null;
  targetType?: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  req?: { headers: Headers };
}

/**
 * Writes an audit row. Pass a transaction as `executor` to make the audit
 * record atomic with the change it describes.
 *
 * Outside a transaction a failed audit write is logged and swallowed: it must
 * never turn a successful administrative action into an error response.
 */
export async function recordAudit(entry: AuditEntry, executor?: DbOrTx): Promise<void> {
  const values = {
    adminId: entry.actor?.id ?? null,
    actorEmail: entry.actor?.email ?? null,
    actorRole: entry.actor?.role ?? null,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    metadata: entry.metadata ?? null,
    ipAddress: entry.req ? getClientIp(entry.req) : null,
    userAgent: entry.req?.headers.get('user-agent')?.slice(0, 300) ?? null,
  };

  if (executor) {
    await executor.insert(adminAuditLog).values(values);
    return;
  }

  try {
    await db.insert(adminAuditLog).values(values);
  } catch (error) {
    console.error('[audit] Failed to record', entry.action, (error as Error).message);
  }
}

/** Human-readable label for an action, including legacy action strings written before v2. */
export function describeAuditAction(action: string): string {
  if (action in AUDIT_ACTIONS) return AUDIT_ACTIONS[action as AuditAction];
  return action
    .replace(/[_.]+/g, ' ')
    .toLowerCase()
    .replace(/^./, first => first.toUpperCase());
}

/** The audit actor for a signed-in staff member. */
export function actorOf(user: { id: string; email: string; role: string }): AuditActor & { role: string } {
  return { id: user.id, email: user.email, role: user.role };
}
