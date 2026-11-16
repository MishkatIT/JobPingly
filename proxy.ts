import { NextResponse, type NextRequest } from 'next/server';
import { getClientIp, rateLimitSync } from '@/lib/security/rateLimit';

/**
 * Request proxy (Next.js 16's replacement for middleware). Runs for every API
 * request before the route handler and provides two blanket protections:
 *
 * 1. Cross-site request forgery. Sessions are cookie based, so any
 *    state-changing request must come from this site. Browsers always send
 *    `Origin` (and `Sec-Fetch-Site`) on cross-origin writes; a write whose
 *    origin is not ours is rejected. Requests with neither header come from
 *    non-browser clients, which cannot carry a victim's cookies.
 *
 * 2. A coarse per-IP ceiling as a backstop against scripted abuse. Sensitive
 *    endpoints add their own, much tighter limits inside the handler.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Server-to-server endpoints authenticated by a shared secret rather than cookies. */
const CSRF_EXEMPT_PREFIXES = ['/api/cron/', '/api/webhooks/'];

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  const fetchSite = req.headers.get('sec-fetch-site');

  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      return false;
    }
    const allowed = new Set<string>();
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    if (host) allowed.add(host.split(',')[0].trim().toLowerCase());
    const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
    if (configured) {
      try {
        allowed.add(new URL(configured).host.toLowerCase());
      } catch {
        // ignore a malformed configured URL
      }
    }
    return allowed.has(originHost);
  }

  if (fetchSite) return fetchSite === 'same-origin' || fetchSite === 'none';
  return true;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (req.method === 'OPTIONS') return NextResponse.next();

  if (!SAFE_METHODS.has(req.method) && !CSRF_EXEMPT_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    if (!sameOrigin(req)) {
      return NextResponse.json(
        { error: { code: 'cross_site_request', message: 'This request did not originate from JobPingly.' } },
        { status: 403 },
      );
    }
  }

  // Health checks are polled by uptime monitors and must never be throttled.
  if (pathname === '/api/health') return NextResponse.next();

  const ip = getClientIp(req);
  const isWrite = !SAFE_METHODS.has(req.method);
  const result = rateLimitSync({
    key: `global:${isWrite ? 'w' : 'r'}:${ip}`,
    limit: isWrite ? 120 : 600,
    windowSeconds: 60,
  });

  if (!result.allowed) {
    return NextResponse.json(
      { error: { code: 'rate_limited', message: `Too many requests. Try again in ${result.retryAfterSeconds} seconds.` } },
      { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
