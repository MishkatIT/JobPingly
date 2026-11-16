import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { sentEmailLogs } from '@/lib/db/schema';
import type { EmailTemplateType } from '@/lib/constants';
import { env } from '@/lib/env';
import { getSetting } from '@/lib/settings/store';

/**
 * Outbound email.
 *
 * Providers:
 *   brevo    Brevo transactional API (production).
 *   console  Logs the message and records it as sent without delivering it.
 *            Selected automatically when BREVO_API_KEY is absent, so local
 *            development and tests can never email a real person.
 *
 * Every attempt is recorded in `sent_email_logs`. Bodies are stored only for
 * template types that cannot grant access to an account, and only when the
 * `email.store_bodies` setting is on. Verification codes, password-reset
 * links and invitation tokens are never written to the log.
 */

/** Templates whose body contains a secret and must never be stored. */
const NEVER_STORE: ReadonlySet<string> = new Set(['otp', 'reset', 'invite']);

export interface EmailMessage {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  text?: string;
  template: EmailTemplateType;
  /** Recipient's user id, when they have an account. */
  userId?: string | null;
  /** Staff member who triggered the send (test, broadcast). */
  senderId?: string | null;
  metadata?: Record<string, unknown>;
  /** Signed URL for one-click unsubscribe; adds the RFC 8058 headers. */
  unsubscribeUrl?: string;
}

interface OutboxEntry {
  to: string;
  subject: string;
  template: string;
  text?: string;
  html: string;
  sentAt: Date;
}

declare global {
  // eslint-disable-next-line no-var
  var __jpOutbox: OutboxEntry[] | undefined;
}

/**
 * Messages handled by the console provider in this process, newest last.
 * Lets local development and the test suite read verification codes and
 * links without any email being sent. Empty in production.
 */
export function consoleOutbox(): OutboxEntry[] {
  return (globalThis.__jpOutbox ??= []);
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  /** True when the console provider handled the message. */
  simulated?: boolean;
}

async function recordLog(message: EmailMessage, result: SendResult, attempts: number): Promise<void> {
  try {
    const store = !NEVER_STORE.has(message.template) && (await getSetting('email.store_bodies'));
    await db.insert(sentEmailLogs).values({
      recipientEmail: message.to.toLowerCase().trim(),
      userId: message.userId ?? null,
      senderEmail: env.email.senderEmail,
      subject: message.subject.slice(0, 300),
      templateType: message.template,
      status: result.success ? 'sent' : 'failed',
      providerMessageId: result.messageId ?? null,
      attempts,
      errorMessage: result.error?.slice(0, 500) ?? null,
      htmlContent: store ? message.html : null,
      senderId: message.senderId ?? null,
      metadata: { ...message.metadata, provider: result.simulated ? 'console' : env.email.provider },
    });
  } catch (error) {
    console.error('[email] Could not record delivery log:', (error as Error).message);
  }
}

async function sendViaBrevo(message: EmailMessage): Promise<{ result: SendResult; attempts: number }> {
  const { brevoApiKey, senderEmail, senderName } = env.email;
  const payload: Record<string, unknown> = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: message.to, name: message.toName || message.to.split('@')[0] }],
    subject: message.subject,
    htmlContent: message.html,
    textContent: message.text,
    tags: [message.template],
  };
  if (message.unsubscribeUrl) {
    payload.headers = {
      'List-Unsubscribe': `<${message.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }

  let lastError = 'Unknown error';
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoApiKey!, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });

      if (response.ok) {
        const data = (await response.json().catch(() => ({}))) as { messageId?: string };
        return { result: { success: true, messageId: data.messageId }, attempts: attempt };
      }

      const detail = await response.text().catch(() => '');
      lastError = `Brevo responded ${response.status}: ${detail.slice(0, 200)}`;
      // 4xx (except 429) means the request itself is wrong; retrying cannot help.
      if (response.status < 500 && response.status !== 429) return { result: { success: false, error: lastError }, attempts: attempt };
    } catch (error) {
      lastError = (error as Error).name === 'TimeoutError' ? 'Brevo did not respond in time.' : (error as Error).message;
    }
    if (attempt < maxAttempts) await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
  }
  return { result: { success: false, error: lastError }, attempts: maxAttempts };
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to)) {
    return { success: false, error: 'Invalid recipient address.' };
  }

  if (env.email.provider === 'console') {
    const result: SendResult = { success: true, simulated: true, messageId: `console-${Date.now()}` };
    const outbox = consoleOutbox();
    outbox.push({ to: message.to, subject: message.subject, template: message.template, text: message.text, html: message.html, sentAt: new Date() });
    if (outbox.length > 100) outbox.splice(0, outbox.length - 100);
    if (!env.isTest) {
      console.log(`[email:console] ${message.template} -> ${message.to} | ${message.subject}`);
      // Outside production the body is printed so codes and links can be used locally.
      if (!env.isProduction && message.text) {
        console.log(
          message.text
            .split(/\r?\n/)
            .map(line => `  ${line}`)
            .join('\n'),
        );
      }
    }
    await recordLog(message, result, 1);
    return result;
  }

  const { result, attempts } = await sendViaBrevo(message);
  if (!result.success) console.error(`[email] ${message.template} to ${message.to} failed: ${result.error}`);
  await recordLog(message, result, attempts);
  return result;
}

export interface DailyEmailStats {
  sentToday: number;
  failedToday: number;
  totalToday: number;
}

/** Emails recorded since 00:00 UTC, which is when provider daily quotas reset. */
export async function getTodaySentEmailCount(): Promise<DailyEmailStats> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  try {
    const [row] = await db
      .select({
        total: sql<number>`count(*)::int`,
        sent: sql<number>`count(*) FILTER (WHERE ${sentEmailLogs.status} = 'sent')::int`,
        failed: sql<number>`count(*) FILTER (WHERE ${sentEmailLogs.status} = 'failed')::int`,
      })
      .from(sentEmailLogs)
      .where(gte(sentEmailLogs.createdAt, start));
    return { sentToday: row?.sent ?? 0, failedToday: row?.failed ?? 0, totalToday: row?.total ?? 0 };
  } catch {
    return { sentToday: 0, failedToday: 0, totalToday: 0 };
  }
}

/** Applies a delivery event reported by the provider's webhook. */
export async function applyDeliveryEvent(messageId: string, deliveryStatus: string): Promise<number> {
  const rows = await db
    .update(sentEmailLogs)
    .set({ deliveryStatus, deliveryUpdatedAt: new Date() })
    .where(and(eq(sentEmailLogs.providerMessageId, messageId)))
    .returning({ id: sentEmailLogs.id });
  return rows.length;
}
