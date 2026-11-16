import { env } from '@/lib/env';

/**
 * Fixed-window rate limiter.
 *
 * Counters live in process memory, which is correct for the single-instance
 * deployment JobPingly runs on. When Upstash Redis is configured, limits
 * marked `distributed` are counted there instead so they hold across several
 * instances and across restarts; if Redis is unreachable the limiter falls
 * back to memory rather than failing open.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __jpRateBuckets: Map<string, Bucket> | undefined;
  // eslint-disable-next-line no-var
  var __jpRateSweep: ReturnType<typeof setInterval> | undefined;
}

const buckets: Map<string, Bucket> = (globalThis.__jpRateBuckets ??= new Map());
const MAX_BUCKETS = 50_000;

if (!globalThis.__jpRateSweep) {
  globalThis.__jpRateSweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now > bucket.resetAt) buckets.delete(key);
    }
  }, 60_000);
  // Never keep the process alive just for housekeeping.
  globalThis.__jpRateSweep.unref?.();
}

export interface RateLimitOptions {
  /** Unique name for the limit plus the subject, e.g. `login:1.2.3.4`. */
  key: string;
  limit: number;
  windowSeconds: number;
  /** Count in Redis when available. Use for security-sensitive limits. */
  distributed?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

function checkMemory(options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const windowMs = options.windowSeconds * 1000;
  let bucket = buckets.get(options.key);

  if (!bucket || now > bucket.resetAt) {
    if (buckets.size >= MAX_BUCKETS) {
      // Under a flood of unique keys, drop the oldest entries instead of growing without bound.
      const overflow = buckets.size - MAX_BUCKETS + 1000;
      let removed = 0;
      for (const key of buckets.keys()) {
        buckets.delete(key);
        if (++removed >= overflow) break;
      }
    }
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(options.key, bucket);
  }

  bucket.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return {
    allowed: bucket.count <= options.limit,
    limit: options.limit,
    remaining: Math.max(0, options.limit - bucket.count),
    retryAfterSeconds,
  };
}

async function checkRedis(options: RateLimitOptions): Promise<RateLimitResult | null> {
  const { url, token } = env.redis;
  if (!url || !token) return null;
  try {
    const key = `rl:${options.key}`;
    const response = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, String(options.windowSeconds), 'NX'],
        ['TTL', key],
      ]),
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return null;
    const [incr, , ttl] = (await response.json()) as { result: number }[];
    const count = Number(incr?.result);
    if (!Number.isFinite(count)) return null;
    const remainingTtl = Number(ttl?.result);
    return {
      allowed: count <= options.limit,
      limit: options.limit,
      remaining: Math.max(0, options.limit - count),
      retryAfterSeconds: remainingTtl > 0 ? remainingTtl : options.windowSeconds,
    };
  } catch {
    return null;
  }
}

export async function rateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  if (options.distributed) {
    const result = await checkRedis(options);
    if (result) return result;
  }
  return checkMemory(options);
}

/** Synchronous, memory-only variant for the request proxy. */
export function rateLimitSync(options: RateLimitOptions): RateLimitResult {
  return checkMemory(options);
}

/** Test helper. */
export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * Resolves the real client address.
 *
 * X-Forwarded-For is a list that each proxy appends to, so its left-most
 * entries are whatever the client chose to send. Only the right-most entries
 * (added by proxies we operate behind) can be trusted. On Render the request
 * passes through Cloudflare, which sets CF-Connecting-IP itself, so that
 * header is preferred when present.
 */
export function getClientIp(req: { headers: Headers }): string {
  const { clientIpHeader, trustedProxyHops } = env.network;

  if (clientIpHeader) {
    const value = req.headers.get(clientIpHeader)?.split(',')[0]?.trim();
    if (value) return value;
  }

  const cloudflare = req.headers.get('cf-connecting-ip')?.trim();
  if (cloudflare) return cloudflare;

  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const chain = forwarded.split(',').map(part => part.trim()).filter(Boolean);
    if (chain.length > 0) {
      const index = Math.max(0, chain.length - Math.max(1, trustedProxyHops));
      return chain[index];
    }
  }

  return req.headers.get('x-real-ip')?.trim() || '0.0.0.0';
}

/** @deprecated Use rateLimit(). Kept so older call sites keep compiling. */
export function checkRateLimit(options: { key: string; limit: number; windowMs: number }) {
  const result = checkMemory({ key: options.key, limit: options.limit, windowSeconds: Math.ceil(options.windowMs / 1000) });
  return {
    success: result.allowed,
    limit: result.limit,
    remaining: result.remaining,
    resetInSeconds: result.retryAfterSeconds,
  };
}
