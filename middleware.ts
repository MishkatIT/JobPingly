import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory rate limiting store for middleware
const rateLimitStore = new Map<string, RateLimitEntry>();

// Housekeeping interval to prune expired entries every 3 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 3 * 60 * 1000);

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return '127.0.0.1';
}

function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  let record = rateLimitStore.get(key);

  if (!record || now > record.resetAt) {
    record = { count: 1, resetAt: now + windowMs };
    rateLimitStore.set(key, record);
    return {
      allowed: true,
      limit,
      remaining: limit - 1,
      resetInSeconds: Math.ceil(windowMs / 1000),
    };
  }

  if (record.count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetInSeconds: Math.ceil((record.resetAt - now) / 1000),
    };
  }

  record.count += 1;
  return {
    allowed: true,
    limit,
    remaining: limit - record.count,
    resetInSeconds: Math.ceil((record.resetAt - now) / 1000),
  };
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only apply site-wide rate limiting to API endpoints
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return NextResponse.next();
  }

  const clientIp = getClientIp(req);

  // Set rate limits based on endpoint sensitivity
  let limit = 120; // 120 requests per minute default for general API
  let windowMs = 60 * 1000;

  if (pathname.startsWith('/api/auth/')) {
    limit = 30; // 30 requests per minute for auth endpoints
    windowMs = 60 * 1000;
  } else if (pathname.startsWith('/api/admin/emails/test')) {
    limit = 100; // 100 test emails per minute limit for admin testing
    windowMs = 60 * 1000;
  } else if (pathname.startsWith('/api/admin/')) {
    limit = 300; // 300 requests per minute for admin actions & dashboard management
    windowMs = 60 * 1000;
  }

  const rateKey = `${clientIp}:${pathname}`;
  const rateLimit = checkRateLimit(rateKey, limit, windowMs);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Rate limit exceeded. Too many requests to ${pathname}. Please try again in ${rateLimit.resetInSeconds} seconds.`,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.resetInSeconds),
          'X-RateLimit-Limit': String(rateLimit.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(rateLimit.resetInSeconds),
        },
      }
    );
  }

  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', String(rateLimit.limit));
  response.headers.set('X-RateLimit-Remaining', String(rateLimit.remaining));
  response.headers.set('X-RateLimit-Reset', String(rateLimit.resetInSeconds));

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
