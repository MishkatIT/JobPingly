import { NextResponse, type NextRequest } from 'next/server';
import { readUnsubscribeToken, resubscribeUser, unsubscribeUser } from '@/lib/email/unsubscribe';
import { getClientIp, rateLimit } from '@/lib/security/rateLimit';

/**
 * One-click unsubscribe (RFC 8058). Mailbox providers POST here from the
 * List-Unsubscribe header; the unsubscribe page posts here when the user
 * presses its button. A GET (a person or a link scanner opening the URL)
 * only shows the confirmation page and changes nothing.
 */
export async function POST(req: NextRequest) {
  const limit = await rateLimit({ key: `unsubscribe:${getClientIp(req)}`, limit: 30, windowSeconds: 600 });
  if (!limit.allowed) return NextResponse.json({ error: { code: 'rate_limited', message: 'Too many requests.' } }, { status: 429 });

  const token = req.nextUrl.searchParams.get('token') ?? '';
  const userId = readUnsubscribeToken(token);
  if (!userId) return NextResponse.json({ error: { code: 'invalid_token', message: 'This unsubscribe link is not valid.' } }, { status: 400 });

  // "Changed your mind?" on the confirmation page. Mailbox providers never send this.
  if (req.nextUrl.searchParams.get('action') === 'resubscribe') {
    if (!(await resubscribeUser(userId))) return NextResponse.json({ error: { code: 'not_found', message: 'This account no longer exists.' } }, { status: 404 });
    return NextResponse.json({ data: { unsubscribed: false } }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const result = await unsubscribeUser(userId);
  if (!result) return NextResponse.json({ error: { code: 'not_found', message: 'This account no longer exists.' } }, { status: 404 });
  return NextResponse.json({ data: { unsubscribed: true } }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  return NextResponse.redirect(new URL(`/unsubscribe?token=${encodeURIComponent(token)}`, req.url), 303);
}
