/**
 * Timezone choices offered in the UI.
 *
 * `Intl.supportedValuesOf('timeZone')` is used when the runtime provides it, so
 * the full IANA list is available; the curated set below is the fallback and also
 * what gets rendered first, because it covers the zones users actually pick.
 */
export const COMMON_TIMEZONES: string[] = [
  'UTC',
  'Asia/Dhaka',
  'Asia/Kolkata',
  'Asia/Karachi',
  'Asia/Kathmandu',
  'Asia/Colombo',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Jakarta',
  'Asia/Bangkok',
  'Asia/Manila',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Perth',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Lisbon',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'Europe/Rome',
  'Europe/Athens',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Africa/Lagos',
  'Africa/Cairo',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Mexico_City',
  'America/New_York',
  'America/Toronto',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Vancouver',
  'America/Anchorage',
  'Pacific/Honolulu',
];

/** Full IANA list when the runtime exposes it, otherwise the curated set. */
export function getSelectableTimezones(): string[] {
  try {
    const anyIntl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    if (typeof anyIntl.supportedValuesOf === 'function') {
      const all = anyIntl.supportedValuesOf('timeZone');
      if (Array.isArray(all) && all.length > 0) {
        const merged = new Set<string>([...COMMON_TIMEZONES, ...all]);
        return Array.from(merged);
      }
    }
  } catch {
    // Fall through to the curated list.
  }
  return [...COMMON_TIMEZONES];
}

/** Best guess at the viewer's own timezone, for a "use my current timezone" action. */
export function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
