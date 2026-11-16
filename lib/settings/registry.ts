import type { Permission } from '@/lib/auth/rbac';

/**
 * Every platform setting and feature flag, in one place.
 *
 * Settings are stored in the `feature_flags` table as key -> JSON value. This
 * registry gives each key a type, a default, validation bounds and the
 * permission needed to change it. The admin Settings screen is generated from
 * it, and the API refuses to write a key that is not listed here or a value
 * that fails validation - previously any key could be written with any value,
 * and a mis-click could replace a number with `true`.
 */

export type SettingType = 'boolean' | 'number' | 'string' | 'select' | 'json';

export type SettingCategory =
  | 'registration'
  | 'monitoring'
  | 'notifications'
  | 'email'
  | 'limits'
  | 'public'
  | 'platform';

export interface SettingDefinition<T = unknown> {
  key: string;
  type: SettingType;
  default: T;
  label: string;
  description: string;
  category: SettingCategory;
  /** Permission required to change the value. Defaults to settings.manage. */
  permission?: Permission;
  min?: number;
  max?: number;
  maxLength?: number;
  options?: { value: string; label: string }[];
  unit?: string;
  /** Hidden from the generic settings screen because a dedicated screen edits it. */
  managedElsewhere?: boolean;
}

function define<T>(definition: SettingDefinition<T>): SettingDefinition<T> {
  return definition;
}

export const SETTINGS = {
  // --- Registration & access -------------------------------------------------
  'auth.signup_enabled': define<boolean>({
    key: 'auth.signup_enabled',
    type: 'boolean',
    default: true,
    label: 'Allow new sign-ups',
    description: 'When off, the registration form and Google sign-up reject new accounts. Existing users can still sign in.',
    category: 'registration',
    permission: 'settings.sensitive',
  }),
  'auth.login_enabled': define<boolean>({
    key: 'auth.login_enabled',
    type: 'boolean',
    default: true,
    label: 'Allow sign-in',
    description: 'When off, only staff accounts can sign in.',
    category: 'registration',
    permission: 'settings.sensitive',
  }),
  'platform.maintenance_mode': define<boolean>({
    key: 'platform.maintenance_mode',
    type: 'boolean',
    default: false,
    label: 'Maintenance mode',
    description: 'Shows a maintenance notice and blocks changes for everyone except staff. Monitoring keeps running.',
    category: 'platform',
    permission: 'settings.sensitive',
  }),
  'platform.maintenance_message': define<string>({
    key: 'platform.maintenance_message',
    type: 'string',
    default: 'JobPingly is undergoing scheduled maintenance. Please check back shortly.',
    label: 'Maintenance message',
    description: 'Shown to visitors while maintenance mode is on.',
    category: 'platform',
    maxLength: 300,
  }),

  // --- Monitoring ------------------------------------------------------------
  'scraper.enabled': define<boolean>({
    key: 'scraper.enabled',
    type: 'boolean',
    default: true,
    label: 'Monitoring enabled',
    description: 'Master switch for scanning career pages. When off, no scheduled scans start; queued alerts are still delivered.',
    category: 'monitoring',
    permission: 'workers.manage',
  }),
  'scraper.use_global_timer': define<boolean>({
    key: 'scraper.use_global_timer',
    type: 'boolean',
    default: true,
    label: 'Use one scan interval for every source',
    description: 'When on, every source is scanned at the global interval below. When off, each source uses its own interval.',
    category: 'monitoring',
  }),
  'scraper.global_check_interval_minutes': define<number>({
    key: 'scraper.global_check_interval_minutes',
    type: 'number',
    default: 180,
    label: 'Global scan interval',
    description: 'How often each source is scanned when the global interval is in use.',
    category: 'monitoring',
    min: 15,
    max: 10080,
    unit: 'minutes',
  }),
  'monitoring.scan_unwatched_sources': define<boolean>({
    key: 'monitoring.scan_unwatched_sources',
    type: 'boolean',
    default: true,
    label: 'Scan sources nobody is watching',
    description: 'When off, a source is only scanned while at least one active watchlist includes it.',
    category: 'monitoring',
  }),
  'monitoring.ai_extraction_enabled': define<boolean>({
    key: 'monitoring.ai_extraction_enabled',
    type: 'boolean',
    default: true,
    label: 'AI extraction fallback',
    description: 'Use the configured language model to read career pages that no adapter or HTML parser can understand. Only runs when the page content has changed.',
    category: 'monitoring',
  }),
  'monitoring.respect_robots_txt': define<boolean>({
    key: 'monitoring.respect_robots_txt',
    type: 'boolean',
    default: true,
    label: 'Respect robots.txt',
    description: 'Skip pages whose robots.txt disallows JobPinglyBot. Official ATS job-board APIs are public by design and are not affected.',
    category: 'monitoring',
  }),
  'monitoring.max_failures_before_pause': define<number>({
    key: 'monitoring.max_failures_before_pause',
    type: 'number',
    default: 14,
    label: 'Auto-pause after consecutive failures',
    description: 'A source that fails this many scans in a row is paused until someone retries it.',
    category: 'monitoring',
    min: 3,
    max: 100,
    unit: 'failures',
  }),
  'monitoring.closed_job_retention_days': define<number>({
    key: 'monitoring.closed_job_retention_days',
    type: 'number',
    default: 90,
    label: 'Keep closed jobs for',
    description: 'Closed jobs older than this are deleted, unless a user has saved or tracked them.',
    category: 'monitoring',
    min: 7,
    max: 730,
    unit: 'days',
  }),
  'monitoring.scan_log_retention_days': define<number>({
    key: 'monitoring.scan_log_retention_days',
    type: 'number',
    default: 30,
    label: 'Keep scan history for',
    description: 'Scan log rows older than this are deleted.',
    category: 'monitoring',
    min: 3,
    max: 365,
    unit: 'days',
  }),

  // --- Notifications ---------------------------------------------------------
  'notifications.enabled': define<boolean>({
    key: 'notifications.enabled',
    type: 'boolean',
    default: true,
    label: 'Email alerts enabled',
    description: 'Master switch for job alert emails. Sign-in codes and password resets are always sent.',
    category: 'notifications',
    permission: 'settings.sensitive',
  }),
  'notifications.enforce_frequency': define<boolean>({
    key: 'notifications.enforce_frequency',
    type: 'boolean',
    default: false,
    label: 'Enforce one digest frequency',
    description: 'Override every non-exempt user\'s chosen frequency with the value below.',
    category: 'notifications',
    managedElsewhere: true,
  }),
  'notifications.enforced_frequency_value': define<string>({
    key: 'notifications.enforced_frequency_value',
    type: 'string',
    default: 'daily',
    label: 'Enforced frequency',
    description: 'The frequency applied when enforcement is on.',
    category: 'notifications',
    maxLength: 40,
    managedElsewhere: true,
  }),
  'notifications.enforced_digest_hour': define<number>({
    key: 'notifications.enforced_digest_hour',
    type: 'number',
    default: -1,
    label: 'Enforced delivery hour',
    description: 'Hour of day (0-23) for enforced digests, or -1 to keep each user\'s own time.',
    category: 'notifications',
    min: -1,
    max: 23,
    managedElsewhere: true,
  }),
  'notifications.enforced_digest_minute': define<number>({
    key: 'notifications.enforced_digest_minute',
    type: 'number',
    default: -1,
    label: 'Enforced delivery minute',
    description: 'Minute (0-59) for enforced digests, or -1.',
    category: 'notifications',
    min: -1,
    max: 59,
    managedElsewhere: true,
  }),
  'notifications.first_scan_alerts': define<boolean>({
    key: 'notifications.first_scan_alerts',
    type: 'boolean',
    default: false,
    label: 'Alert on a source\'s first scan',
    description: 'When off (recommended), the jobs already open when a company is first added are recorded silently instead of being emailed as "new".',
    category: 'notifications',
  }),

  // --- Email delivery --------------------------------------------------------
  'email.auto_approve_enabled': define<boolean>({
    key: 'email.auto_approve_enabled',
    type: 'boolean',
    default: false,
    label: 'Approve new recipients automatically',
    description: 'When off, a new user receives alert emails only after an admin approves their address.',
    category: 'email',
  }),
  'email.brevo_daily_limit': define<number>({
    key: 'email.brevo_daily_limit',
    type: 'number',
    default: 300,
    label: 'Daily sending limit',
    description: 'The number of emails your email provider plan allows per day.',
    category: 'email',
    min: 1,
    max: 1_000_000,
    unit: 'emails',
  }),
  'email.transactional_safety_buffer': define<number>({
    key: 'email.transactional_safety_buffer',
    type: 'number',
    default: 50,
    label: 'Reserved for sign-in and account emails',
    description: 'Part of the daily limit held back from digests so verification codes and resets can always be sent.',
    category: 'email',
    min: 0,
    max: 1_000_000,
    unit: 'emails',
  }),
  'email.cohort_grouping_enabled': define<boolean>({
    key: 'email.cohort_grouping_enabled',
    type: 'boolean',
    default: true,
    label: 'Stagger digests when the limit is nearly reached',
    description: 'Under quota pressure, spread non-realtime digests across rotating groups instead of dropping them.',
    category: 'email',
    managedElsewhere: true,
  }),
  'email.cohort_cycle_days': define<number>({
    key: 'email.cohort_cycle_days',
    type: 'number',
    default: 3,
    label: 'Rotation length',
    description: 'Number of groups digests are spread across when staggering applies.',
    category: 'email',
    min: 1,
    max: 30,
    unit: 'days',
    managedElsewhere: true,
  }),
  'email.cohort_pressure_ratio': define<number>({
    key: 'email.cohort_pressure_ratio',
    type: 'number',
    default: 0.75,
    label: 'Staggering threshold',
    description: 'Fraction of the daily digest allowance that must be used before staggering starts.',
    category: 'email',
    min: 0,
    max: 1,
    managedElsewhere: true,
  }),
  'email.store_bodies': define<boolean>({
    key: 'email.store_bodies',
    type: 'boolean',
    default: false,
    label: 'Keep a copy of sent digest and broadcast emails',
    description: 'Stores the HTML of digests and broadcasts for inspection. Emails containing codes or links that grant access are never stored.',
    category: 'email',
  }),
  'email.log_retention_days': define<number>({
    key: 'email.log_retention_days',
    type: 'number',
    default: 90,
    label: 'Keep email delivery records for',
    description: 'Delivery log rows older than this are deleted.',
    category: 'email',
    min: 7,
    max: 730,
    unit: 'days',
  }),

  // --- Plan limits (free tier) ----------------------------------------------
  'limits.max_lists_per_user': define<number>({
    key: 'limits.max_lists_per_user',
    type: 'number',
    default: 10,
    label: 'Watchlists per user',
    description: 'Maximum watchlists a free account can own. -1 removes the limit.',
    category: 'limits',
    min: -1,
    max: 10_000,
  }),
  'limits.max_urls_per_list': define<number>({
    key: 'limits.max_urls_per_list',
    type: 'number',
    default: 25,
    label: 'Companies per watchlist',
    description: 'Maximum companies in a single watchlist on a free account. -1 removes the limit.',
    category: 'limits',
    min: -1,
    max: 10_000,
  }),
  'limits.max_keywords_per_sub': define<number>({
    key: 'limits.max_keywords_per_sub',
    type: 'number',
    default: 20,
    label: 'Keywords per alert',
    description: 'Maximum include or exclude keywords on a single watchlist alert.',
    category: 'limits',
    min: 1,
    max: 500,
  }),

  // --- Public directory ------------------------------------------------------
  'public_lists.enabled': define<boolean>({
    key: 'public_lists.enabled',
    type: 'boolean',
    default: true,
    label: 'Public watchlist directory',
    description: 'When off, the Discover page and public watchlist pages are unavailable.',
    category: 'public',
  }),
  'public_lists.allow_suggestions': define<boolean>({
    key: 'public_lists.allow_suggestions',
    type: 'boolean',
    default: true,
    label: 'Allow company suggestions on public lists',
    description: 'Signed-in users can suggest a company for a public watchlist; the owner approves or rejects it.',
    category: 'public',
  }),

  // --- Announcement banner ---------------------------------------------------
  'banner.config': define<Record<string, unknown>>({
    key: 'banner.config',
    type: 'json',
    default: { enabled: false, message: '', type: 'info', linkUrl: '', linkText: '', bannerId: '' },
    label: 'Site announcement',
    description: 'The announcement bar shown across the site.',
    category: 'platform',
    managedElsewhere: true,
  }),
} as const;

export type SettingKey = keyof typeof SETTINGS;

export type SettingValue<K extends SettingKey> = (typeof SETTINGS)[K]['default'] extends boolean
  ? boolean
  : (typeof SETTINGS)[K]['default'] extends number
    ? number
    : (typeof SETTINGS)[K]['default'] extends string
      ? string
      : Record<string, unknown>;

export const SETTING_CATEGORIES: { id: SettingCategory; label: string; description: string }[] = [
  { id: 'registration', label: 'Registration & access', description: 'Who can create an account and sign in.' },
  { id: 'monitoring', label: 'Monitoring', description: 'How and how often career pages are scanned.' },
  { id: 'notifications', label: 'Notifications', description: 'Job alert behaviour.' },
  { id: 'email', label: 'Email delivery', description: 'Sending limits, approval and retention.' },
  { id: 'limits', label: 'Free plan limits', description: 'Usage ceilings for accounts on the free plan.' },
  { id: 'public', label: 'Public directory', description: 'Discover and public watchlists.' },
  { id: 'platform', label: 'Platform', description: 'Maintenance and announcements.' },
];

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS, key);
}

export type ValidationResult = { ok: true; value: unknown } | { ok: false; error: string };

/** Validates and normalises a value for a setting. */
export function validateSettingValue(key: SettingKey, input: unknown): ValidationResult {
  const definition = SETTINGS[key] as SettingDefinition;

  switch (definition.type) {
    case 'boolean':
      if (typeof input !== 'boolean') return { ok: false, error: `${definition.label} must be on or off.` };
      return { ok: true, value: input };

    case 'number': {
      const value = typeof input === 'string' && input.trim() !== '' ? Number(input) : input;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { ok: false, error: `${definition.label} must be a number.` };
      }
      if (definition.min !== undefined && value < definition.min) {
        return { ok: false, error: `${definition.label} must be at least ${definition.min}.` };
      }
      if (definition.max !== undefined && value > definition.max) {
        return { ok: false, error: `${definition.label} must be at most ${definition.max}.` };
      }
      return { ok: true, value };
    }

    case 'string':
    case 'select': {
      if (typeof input !== 'string') return { ok: false, error: `${definition.label} must be text.` };
      const value = input.trim();
      if (definition.maxLength && value.length > definition.maxLength) {
        return { ok: false, error: `${definition.label} must be at most ${definition.maxLength} characters.` };
      }
      if (definition.options && !definition.options.some(option => option.value === value)) {
        return { ok: false, error: `${definition.label} has an unsupported value.` };
      }
      return { ok: true, value };
    }

    case 'json':
      if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        return { ok: false, error: `${definition.label} must be an object.` };
      }
      if (JSON.stringify(input).length > 8000) return { ok: false, error: `${definition.label} is too large.` };
      return { ok: true, value: input };
  }
}

/** Coerces whatever is stored (possibly written by an older version) to the setting's type. */
export function coerceStoredValue<K extends SettingKey>(key: K, stored: unknown): SettingValue<K> {
  const definition = SETTINGS[key] as SettingDefinition;
  const fallback = definition.default as SettingValue<K>;
  if (stored === undefined || stored === null) return fallback;

  switch (definition.type) {
    case 'boolean':
      if (typeof stored === 'boolean') return stored as SettingValue<K>;
      if (stored === 'true') return true as SettingValue<K>;
      if (stored === 'false') return false as SettingValue<K>;
      return fallback;
    case 'number': {
      const value = typeof stored === 'number' ? stored : Number(stored);
      // A boolean here means an old toggle overwrote the number; ignore it.
      if (typeof stored === 'boolean' || !Number.isFinite(value)) return fallback;
      return value as SettingValue<K>;
    }
    case 'string':
    case 'select':
      return (typeof stored === 'string' && stored.length > 0 ? stored : fallback) as SettingValue<K>;
    case 'json':
      return (typeof stored === 'object' && !Array.isArray(stored) ? stored : fallback) as SettingValue<K>;
  }
}
