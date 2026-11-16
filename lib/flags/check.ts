import { SETTINGS, isSettingKey, type SettingKey } from '@/lib/settings/registry';
import { getSetting, invalidateSettingsCache } from '@/lib/settings/store';

/**
 * Compatibility shim over lib/settings.
 *
 * New code should call `getSetting('key')`, which is fully typed. This keeps
 * the older `isFeatureEnabled(key, default)` call sites working while routing
 * them through the same cached, validated store.
 */
export async function isFeatureEnabled<T extends boolean | number | string>(key: string, defaultValue: T = true as T): Promise<T> {
  if (!isSettingKey(key)) return defaultValue;
  const value = await getSetting(key as SettingKey);
  return (typeof value === typeof defaultValue ? value : (SETTINGS[key as SettingKey].default as unknown)) as T;
}

export function invalidateFlagCache(_key?: string) {
  invalidateSettingsCache();
}
