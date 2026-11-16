import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { featureFlags } from '@/lib/db/schema';
import {
  SETTINGS,
  coerceStoredValue,
  isSettingKey,
  validateSettingValue,
  type SettingKey,
  type SettingValue,
} from './registry';

/**
 * Reads and writes platform settings.
 *
 * All settings are loaded with a single query and cached in process memory
 * for a short time, so hot paths (the scheduler, every sign-in) can read
 * several settings without a database round trip each.
 */

const CACHE_TTL_MS = 30_000;

interface Snapshot {
  values: Map<string, unknown>;
  loadedAt: number;
}

declare global {
  var __jpSettings: Snapshot | undefined;
  var __jpSettingsLoading: Promise<Snapshot> | undefined;
}

async function load(): Promise<Snapshot> {
  const rows = await db.select({ key: featureFlags.key, value: featureFlags.value }).from(featureFlags);
  const snapshot: Snapshot = { values: new Map(rows.map(row => [row.key, row.value])), loadedAt: Date.now() };
  globalThis.__jpSettings = snapshot;
  return snapshot;
}

async function snapshot(): Promise<Snapshot> {
  const current = globalThis.__jpSettings;
  if (current && Date.now() - current.loadedAt < CACHE_TTL_MS) return current;

  // Collapse concurrent refreshes into one query.
  globalThis.__jpSettingsLoading ??= load().finally(() => {
    globalThis.__jpSettingsLoading = undefined;
  });
  try {
    return await globalThis.__jpSettingsLoading;
  } catch (error) {
    // Serve stale values rather than fail a request because settings could not be refreshed.
    if (current) return current;
    throw error;
  }
}

export function invalidateSettingsCache(): void {
  globalThis.__jpSettings = undefined;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  try {
    const { values } = await snapshot();
    return coerceStoredValue(key, values.get(key));
  } catch {
    return SETTINGS[key].default as SettingValue<K>;
  }
}

export async function getSettings<K extends SettingKey>(keys: readonly K[]): Promise<{ [P in K]: SettingValue<P> }> {
  const result = {} as { [P in K]: SettingValue<P> };
  let values: Map<string, unknown> | undefined;
  try {
    values = (await snapshot()).values;
  } catch {
    values = undefined;
  }
  for (const key of keys) {
    result[key] = coerceStoredValue(key, values?.get(key));
  }
  return result;
}

export async function getAllSettings(): Promise<Record<SettingKey, unknown>> {
  const { values } = await snapshot();
  const result = {} as Record<SettingKey, unknown>;
  for (const key of Object.keys(SETTINGS) as SettingKey[]) {
    result[key] = coerceStoredValue(key, values.get(key));
  }
  return result;
}

export class SettingValidationError extends Error {}

/** Validates and stores a setting. Returns the previous and new values for the audit log. */
export async function setSetting(
  key: string,
  input: unknown,
  updatedBy: string | null,
): Promise<{ key: SettingKey; previous: unknown; value: unknown }> {
  if (!isSettingKey(key)) throw new SettingValidationError(`Unknown setting "${key}".`);
  const checked = validateSettingValue(key, input);
  if (!checked.ok) throw new SettingValidationError(checked.error);

  const [existing] = await db.select({ value: featureFlags.value }).from(featureFlags).where(eq(featureFlags.key, key));
  const previous = coerceStoredValue(key, existing?.value);

  await db
    .insert(featureFlags)
    .values({ key, value: checked.value, description: SETTINGS[key].description, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: featureFlags.key,
      set: { value: checked.value, updatedBy, updatedAt: new Date() },
    });

  invalidateSettingsCache();
  return { key, previous, value: checked.value };
}

/** Metadata (who changed what, when) for the admin settings screen. */
export async function getSettingsMetadata(): Promise<Map<string, { updatedAt: Date; updatedBy: string | null }>> {
  const rows = await db
    .select({ key: featureFlags.key, updatedAt: featureFlags.updatedAt, updatedBy: featureFlags.updatedBy })
    .from(featureFlags)
    .where(inArray(featureFlags.key, Object.keys(SETTINGS)));
  return new Map(rows.map(row => [row.key, { updatedAt: row.updatedAt, updatedBy: row.updatedBy }]));
}
