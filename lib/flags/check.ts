import { db } from '@/lib/db/client';
import { featureFlags } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Checks whether a system feature flag is enabled in PostgreSQL.
 * Defaults to defaultValue (true) if the flag key is not found.
 */
export async function isFeatureEnabled<T extends boolean | number | string>(key: string, defaultValue: T = true as T): Promise<T> {
  try {
    const [flag] = await db.select().from(featureFlags).where(eq(featureFlags.key, key));
    if (!flag) return defaultValue;
    if (typeof defaultValue === 'number') {
      const parsed = Number(flag.value);
      return (isNaN(parsed) ? defaultValue : parsed) as T;
    }
    if (typeof defaultValue === 'boolean') {
      return (flag.value === true || flag.value === 'true') as T;
    }
    return (flag.value as unknown as T) || defaultValue;
  } catch {
    return defaultValue;
  }
}
