import { eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { safeEqual } from '@/lib/auth/tokens';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { applyDeliveryEvent } from '@/lib/email/send';
import { env } from '@/lib/env';
import { invalidateSessionCache } from '@/lib/auth/session';

/**
 * Delivery events from Brevo (transactional webhook). Configure in Brevo as
 *   https://<host>/api/webhooks/brevo?token=<BREVO_WEBHOOK_SECRET>
 * with the events: delivered, hard bounce, soft bounce, blocked, spam, invalid email.
 *
 * A hard bounce or a spam complaint switches job alerts off for that address:
 * continuing to send would damage the sender reputation for every user.
 */

const EVENT_STATUS: Record<string, string> = {
  delivered: 'delivered',
  hard_bounce: 'bounced',
  hardBounce: 'bounced',
  soft_bounce: 'deferred',
  softBounce: 'deferred',
  deferred: 'deferred',
  blocked: 'blocked',
  invalid_email: 'bounced',
  invalidEmail: 'bounced',
  spam: 'complained',
  complaint: 'complained',
};

const SUPPRESS = new Set(['bounced', 'complained']);

export async function POST(req: NextRequest) {
  const secret = env.email.webhookSecret;
  if (!secret) return new NextResponse(null, { status: 404 });
  const token = req.nextUrl.searchParams.get('token') ?? '';
  if (!token || !safeEqual(token, secret)) return new NextResponse(null, { status: 401 });

  let events: unknown;
  try {
    events = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'bad_request', message: 'Expected JSON.' } }, { status: 400 });
  }

  let applied = 0;
  for (const event of (Array.isArray(events) ? events : [events]).slice(0, 100) as Record<string, unknown>[]) {
    const status = EVENT_STATUS[String(event?.event ?? '')];
    const messageId = typeof event?.['message-id'] === 'string' ? event['message-id'] : typeof event?.messageId === 'string' ? event.messageId : null;
    if (!status || !messageId) continue;
    applied += await applyDeliveryEvent(messageId, status);

    const email = typeof event.email === 'string' ? event.email.toLowerCase() : null;
    if (email && SUPPRESS.has(status)) {
      const [user] = await db.update(users).set({ emailNotificationsEnabled: false }).where(eq(users.email, email)).returning({ id: users.id });
      if (user) invalidateSessionCache(user.id);
    }
  }
  return NextResponse.json({ data: { applied } });
}
