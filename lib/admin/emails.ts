import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { errors } from '@/lib/api/errors';
import { recordAudit, type AuditActor } from '@/lib/audit';
import { sendWelcomeOnce } from '@/lib/auth/accounts';
import { client, db } from '@/lib/db/client';
import { emailApprovals, notificationQueue, sentEmailLogs, users } from '@/lib/db/schema';
import { getTodaySentEmailCount, sendEmail } from '@/lib/email/send';
import { broadcastEmail, testEmail } from '@/lib/email/templates';
import { unsubscribeLinks } from '@/lib/email/unsubscribe';
import { env } from '@/lib/env';
import { loadNotificationPolicy, resolveCohortGroup } from '@/lib/notifications/policy';
import { processNotificationQueue } from '@/lib/notifications/processor';
import { setSetting } from '@/lib/settings/store';
import { cleanText } from '@/lib/security/html';

/** Templates whose body is never shown, even if (by an older version) it was stored. */
const SECRET_TEMPLATES = new Set(['otp', 'reset', 'invite']);

export async function emailStats() {
  const [today, policy] = await Promise.all([getTodaySentEmailCount(), loadNotificationPolicy()]);
  const series = await client<{ day: Date; sent: number; failed: number }[]>`
    WITH days AS (
      SELECT generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') AS day
    )
    SELECT d.day,
      (SELECT count(*) FROM sent_email_logs e WHERE e.created_at >= d.day AND e.created_at < d.day + interval '1 day' AND e.status = 'sent')::int AS sent,
      (SELECT count(*) FROM sent_email_logs e WHERE e.created_at >= d.day AND e.created_at < d.day + interval '1 day' AND e.status = 'failed')::int AS failed
    FROM days d ORDER BY d.day
  `;
  const byTemplate = await client<{ template: string; sent: number; failed: number }[]>`
    SELECT template_type AS template, count(*) FILTER (WHERE status = 'sent')::int AS sent, count(*) FILTER (WHERE status = 'failed')::int AS failed
    FROM sent_email_logs WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC
  `;
  const delivery = await client<{ status: string; count: number }[]>`
    SELECT coalesce(delivery_status, 'not reported') AS status, count(*)::int AS count
    FROM sent_email_logs WHERE created_at > now() - interval '30 days' AND status = 'sent' GROUP BY 1 ORDER BY 2 DESC
  `;
  const [pending] = await client<{ alerts: number; recipients: number; approvals: number }[]>`
    SELECT (SELECT count(*) FROM notification_queue WHERE sent_at IS NULL)::int AS alerts,
      (SELECT count(DISTINCT user_id) FROM notification_queue WHERE sent_at IS NULL)::int AS recipients,
      (SELECT count(*) FROM email_approvals WHERE status = 'pending')::int AS approvals
  `;
  return {
    provider: env.email.provider,
    sender: env.email.senderEmail,
    webhookConfigured: Boolean(env.email.webhookSecret),
    today: { ...today, dailyLimit: policy.dailyLimit, digestLimit: policy.effectiveDigestLimit, remaining: Math.max(0, policy.dailyLimit - today.sentToday) },
    policy,
    series,
    byTemplate,
    delivery,
    pending,
  };
}

export async function listEmailLogs(options: { template?: string; status?: string; q?: string; page: number; pageSize: number }) {
  const pattern = options.q ? `%${options.q.replace(/[\\%_]/g, char => `\\${char}`)}%` : null;
  const where = and(
    options.template ? eq(sentEmailLogs.templateType, options.template) : undefined,
    options.status ? eq(sentEmailLogs.status, options.status) : undefined,
    pattern ? or(ilike(sentEmailLogs.recipientEmail, pattern), ilike(sentEmailLogs.subject, pattern)) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: sentEmailLogs.id,
        recipientEmail: sentEmailLogs.recipientEmail,
        subject: sentEmailLogs.subject,
        templateType: sentEmailLogs.templateType,
        status: sentEmailLogs.status,
        deliveryStatus: sentEmailLogs.deliveryStatus,
        attempts: sentEmailLogs.attempts,
        errorMessage: sentEmailLogs.errorMessage,
        createdAt: sentEmailLogs.createdAt,
        hasBody: sql<boolean>`${sentEmailLogs.htmlContent} IS NOT NULL`,
        provider: sql<string | null>`${sentEmailLogs.metadata}->>'provider'`,
      })
      .from(sentEmailLogs)
      .where(where)
      .orderBy(desc(sentEmailLogs.createdAt))
      .limit(options.pageSize)
      .offset((options.page - 1) * options.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(sentEmailLogs).where(where),
  ]);
  return { total, items: rows.map(row => ({ ...row, hasBody: row.hasBody && !SECRET_TEMPLATES.has(row.templateType) })) };
}

export async function emailBody(id: string): Promise<string | null> {
  const [row] = await db.select({ html: sentEmailLogs.htmlContent, template: sentEmailLogs.templateType }).from(sentEmailLogs).where(eq(sentEmailLogs.id, id));
  if (!row?.html || SECRET_TEMPLATES.has(row.template)) return null;
  return row.html;
}

export async function listApprovals(options: { status?: string; q?: string; page: number; pageSize: number }) {
  const pattern = options.q ? `%${options.q.replace(/[\\%_]/g, char => `\\${char}`)}%` : null;
  const where = and(
    options.status && options.status !== 'all' ? eq(emailApprovals.status, options.status) : undefined,
    pattern ? ilike(emailApprovals.email, pattern) : undefined,
  );
  const [rows, [{ total }], counts] = await Promise.all([
    db
      .select({
        id: emailApprovals.id,
        email: emailApprovals.email,
        status: emailApprovals.status,
        requestedAt: emailApprovals.requestedAt,
        approvedAt: emailApprovals.approvedAt,
        userId: users.id,
        name: users.name,
        lastActiveAt: users.lastActiveAt,
      })
      .from(emailApprovals)
      .leftJoin(users, eq(users.email, emailApprovals.email))
      .where(where)
      .orderBy(desc(emailApprovals.requestedAt))
      .limit(options.pageSize)
      .offset((options.page - 1) * options.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(emailApprovals).where(where),
    db.select({ status: emailApprovals.status, n: sql<number>`count(*)::int` }).from(emailApprovals).groupBy(emailApprovals.status),
  ]);
  return { total, items: rows, counts: Object.fromEntries(counts.map(row => [row.status, row.n])) };
}

export async function setApprovals(actor: AuditActor, emails: string[], approve: boolean, req: { headers: Headers }) {
  const list = Array.from(new Set(emails.map(email => email.trim().toLowerCase()).filter(Boolean))).slice(0, 500);
  if (list.length === 0) return { updated: 0 };

  const previous = await db.select({ email: emailApprovals.email, status: emailApprovals.status }).from(emailApprovals).where(inArray(emailApprovals.email, list));
  const wasApproved = new Set(previous.filter(row => row.status === 'approved').map(row => row.email));

  for (const email of list) {
    await db
      .insert(emailApprovals)
      .values({ email, status: approve ? 'approved' : 'unapproved', approvedAt: approve ? new Date() : null, approvedBy: actor.id })
      .onConflictDoUpdate({
        target: emailApprovals.email,
        set: { status: approve ? 'approved' : 'unapproved', approvedAt: approve ? new Date() : null, approvedBy: actor.id },
      });
  }

  if (approve) {
    const recipients = await db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(inArray(users.email, list));
    // Welcome emails are sent once per address, and only on the first approval.
    for (const user of recipients.filter(user => !wasApproved.has(user.email))) {
      await sendWelcomeOnce(user.id, user.email, user.name);
    }
  }
  await recordAudit({ action: approve ? 'email.approve' : 'email.revoke', actor, targetType: 'email', metadata: { count: list.length, emails: list.slice(0, 20) }, req });
  return { updated: list.length };
}

export async function approveAllPending(actor: AuditActor, req: { headers: Headers }) {
  const pending = await db.select({ email: emailApprovals.email }).from(emailApprovals).where(eq(emailApprovals.status, 'pending')).limit(500);
  return setApprovals(actor, pending.map(row => row.email), true, req);
}

/** What the alert processor would do right now, without sending anything. */
export async function queueDiagnostics() {
  const simulation = await processNotificationQueue({ dryRun: true });
  const byReason = new Map<string, number>();
  for (const item of simulation.deferred) {
    const key = item.reason.replace(/\(.*?\)/g, '').replace(/\d+/g, 'N').trim();
    byReason.set(key, (byReason.get(key) ?? 0) + 1);
  }
  const oldest = await client<{ userId: string; email: string; items: number; oldest: Date }[]>`
    SELECT q.user_id AS "userId", u.email, count(*)::int AS items, min(q.created_at) AS oldest
    FROM notification_queue q JOIN users u ON u.id = q.user_id
    WHERE q.sent_at IS NULL GROUP BY 1, 2 ORDER BY oldest LIMIT 50
  `;
  return {
    wouldSend: simulation.emailsSent,
    wouldDeliverItems: simulation.itemsDelivered,
    recipientsWithPending: simulation.usersConsidered,
    deferred: simulation.deferred.slice(0, 100),
    deferredByReason: Array.from(byReason.entries()).map(([reason, count]) => ({ reason, count })),
    errors: simulation.errors,
    pendingByUser: oldest,
  };
}

export async function runQueueAction(actor: AuditActor, action: 'process' | 'flush' | 'clear', req: { headers: Headers }) {
  if (action === 'clear') {
    const rows = await db
      .update(notificationQueue)
      .set({ sentAt: new Date(), lastError: 'Discarded by an administrator' })
      .where(isNull(notificationQueue.sentAt))
      .returning({ id: notificationQueue.id });
    await recordAudit({ action: 'queue.clear', actor, metadata: { discarded: rows.length }, req });
    return { discarded: rows.length };
  }
  const result = await processNotificationQueue({ force: action === 'flush' });
  if (action === 'flush') await recordAudit({ action: 'queue.flush', actor, metadata: { emailsSent: result.emailsSent, items: result.itemsDelivered }, req });
  return result;
}

export async function sendTestEmail(actor: AuditActor, to: string, note: string | null, req: { headers: Headers }) {
  const rendered = testEmail(cleanText(note, 300) || null);
  const result = await sendEmail({ to, subject: rendered.subject, html: rendered.html, text: rendered.text, template: 'test', senderId: actor.id });
  await recordAudit({ action: 'email.test', actor, metadata: { to, success: result.success }, req });
  if (!result.success) throw errors.unprocessable(result.error ?? 'The email could not be sent.');
  return { sent: true, simulated: Boolean(result.simulated) };
}

export const BROADCAST_AUDIENCES = ['all', 'active30', 'alerts_on'] as const;

async function broadcastRecipients(audience: (typeof BROADCAST_AUDIENCES)[number]) {
  return client<{ id: string; email: string; name: string | null }[]>`
    SELECT u.id, u.email, u.name FROM users u
    WHERE u.email_verified AND NOT u.is_blocked
      ${audience === 'active30' ? client`AND u.last_active_at > now() - interval '30 days'` : client``}
      ${audience === 'alerts_on' ? client`AND u.email_notifications_enabled` : client``}
    ORDER BY u.created_at
  `;
}

/**
 * Sends a plain-text announcement. Respects the daily sending allowance:
 * it never sends more than what is left for today, and reports how many were
 * skipped so the rest can be sent tomorrow.
 */
export async function sendBroadcast(
  actor: AuditActor,
  input: { subject: string; message: string; audience: (typeof BROADCAST_AUDIENCES)[number]; dryRun?: boolean },
  req: { headers: Headers },
) {
  const recipients = await broadcastRecipients(input.audience);
  const policy = await loadNotificationPolicy();
  const today = await getTodaySentEmailCount();
  const remaining = Math.max(0, policy.dailyLimit - policy.safetyBuffer - today.sentToday);
  const batch = recipients.slice(0, Math.min(remaining, 500));

  if (input.dryRun) return { recipients: recipients.length, wouldSend: batch.length, remainingToday: remaining };

  const subject = cleanText(input.subject, 140);
  if (!subject || !input.message.trim()) throw errors.validation([{ field: 'message', message: 'Write a subject and a message.' }]);

  let sent = 0;
  let failed = 0;
  for (const recipient of batch) {
    const links = unsubscribeLinks(recipient.id);
    const rendered = broadcastEmail({ name: recipient.name, subject, message: input.message.slice(0, 10_000), unsubscribeUrl: links.page });
    const result = await sendEmail({
      to: recipient.email,
      toName: recipient.name,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      template: 'broadcast',
      userId: recipient.id,
      senderId: actor.id,
      unsubscribeUrl: links.oneClick,
    });
    if (result.success) sent++;
    else failed++;
  }
  await recordAudit({ action: 'email.broadcast', actor, metadata: { subject, audience: input.audience, sent, failed, skipped: recipients.length - batch.length }, req });
  return { recipients: recipients.length, sent, failed, skipped: recipients.length - batch.length };
}

/** Spreads users evenly across the staggering groups. */
export async function rebalanceCohorts(actor: AuditActor, cycleDays: number, req: { headers: Headers }) {
  const days = Math.min(30, Math.max(1, Math.round(cycleDays)));
  const recipients = await db.select({ id: users.id }).from(users).where(eq(users.emailNotificationsEnabled, true)).orderBy(users.createdAt);
  for (let index = 0; index < recipients.length; index++) {
    await db.update(users).set({ dispatchGroup: (index % days) + 1 }).where(eq(users.id, recipients[index].id));
  }
  await setSetting('email.cohort_cycle_days', days, actor.id);
  await recordAudit({ action: 'email.cohort_change', actor, metadata: { cycleDays: days, users: recipients.length }, req });
  const distribution = new Map<number, number>();
  for (let index = 0; index < recipients.length; index++) {
    const group = resolveCohortGroup((index % days) + 1, days);
    distribution.set(group, (distribution.get(group) ?? 0) + 1);
  }
  return { cycleDays: days, users: recipients.length, distribution: Object.fromEntries(distribution) };
}
