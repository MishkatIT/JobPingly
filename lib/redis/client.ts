import { Redis } from '@upstash/redis';

declare global {
  // eslint-disable-next-line no-var
  var _upstashRedis: Redis | null | undefined;
}

export function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  if (globalThis._upstashRedis) {
    return globalThis._upstashRedis;
  }

  try {
    const client = new Redis({ url, token });
    globalThis._upstashRedis = client;
    return client;
  } catch (err: any) {
    console.warn('[Upstash Redis Init Error]', err.message);
    return null;
  }
}

/**
 * Safely get a parsed JSON object or primitive from Redis
 */
export async function redisGet<T = any>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const res = await redis.get<T>(key);
    return res ?? null;
  } catch {
    return null;
  }
}

/**
 * Safely set a JSON object or string value in Redis with TTL in seconds
 */
export async function redisSet(key: string, value: any, ttlSeconds: number = 300): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;
  try {
    await redis.set(key, value, { ex: ttlSeconds });
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely delete one or more keys from Redis
 */
export async function redisDel(keys: string | string[]): Promise<boolean> {
  const keyArray = Array.isArray(keys) ? keys : [keys];
  if (keyArray.length === 0) return true;

  const redis = getRedisClient();
  if (!redis) return false;
  try {
    await redis.del(...keyArray);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely delete keys matching a pattern (e.g. 'user:session:*')
 */
export async function redisDelPattern(pattern: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;
  try {
    const keys = await redis.keys(pattern);
    if (keys && keys.length > 0) {
      await redis.del(...keys);
    }
    return true;
  } catch {
    return false;
  }
}
