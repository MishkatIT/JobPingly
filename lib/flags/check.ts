import { db } from '@/lib/db/client';
import { featureFlags } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

interface CacheEntry {
  val: any;
  expiresAt: number;
}

const flagCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL

/**
 * Checks whether a system feature flag is enabled in PostgreSQL.
 * Uses an in-memory TTL cache to prevent continuous database egress.
 * Defaults to defaultValue (true) if the flag key is not found.
 */
export async function isFeatureEnabled<T extends boolean | number | string>(key: string, defaultValue: T = true as T): Promise<T> {
  const now = Date.now();
  const cached = flagCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.val as T;
  }

  try {
    const [flag] = await db
      .select({ key: featureFlags.key, value: featureFlags.value })
      .from(featureFlags)
      .where(eq(featureFlags.key, key));

    let result: T = defaultValue;
    if (flag) {
      if (typeof defaultValue === 'number') {
        const parsed = Number(flag.value);
        result = (isNaN(parsed) ? defaultValue : parsed) as T;
      } else if (typeof defaultValue === 'boolean') {
        result = (flag.value === true || flag.value === 'true') as T;
      } else {
        result = ((flag.value as unknown as T) || defaultValue);
      }
    }

    flagCache.set(key, { val: result, expiresAt: now + CACHE_TTL_MS });
    return result;
  } catch {
    return defaultValue;
  }
}

/**
 * Invalidates cached feature flags so immediate UI updates reflect in real-time.
 */
export function invalidateFlagCache(key?: string) {
  if (key) {
    flagCache.delete(key);
  } else {
    flagCache.clear();
  }
}


