export interface FrequencyOption {
  value: string;
  label: string;
  description?: string;
}

/**
 * Sentinel stored on a list subscription that means "use the account-level
 * notification preference". Subscriptions are created with this value so that
 * following a list never silently overrides the user's own digest setting.
 */
export const INHERIT_FREQUENCY = 'inherit';

export const FREQUENCY_OPTIONS: FrequencyOption[] = [
  { value: 'realtime', label: 'Instant Notification (Sends alert immediately upon match)', description: 'Real-time notifications' },
  { value: 'every_6_hours', label: 'Every 6 Hours (4 times a day)', description: '6-hour interval, aligned to your digest time' },
  { value: 'every_12_hours', label: 'Every 12 Hours (Twice a day)', description: '12-hour interval, aligned to your digest time' },
  { value: 'daily', label: 'Daily Digest (Recommended - one summary per day)', description: 'Daily summary at your chosen digest time' },
  { value: 'twice_weekly', label: 'Twice a Week (Summary every Monday & Thursday)', description: 'Monday & Thursday digests' },
  { value: 'weekly', label: 'Weekly Digest (Summary every Monday)', description: 'Weekly summary' },
  { value: 'biweekly', label: 'Bi-weekly Digest (Summary every other Monday)', description: 'Fortnightly summary' },
  { value: 'monthly', label: 'Monthly Digest (Summary on 1st of month)', description: 'Monthly summary' },
  { value: 'custom', label: '⚙️ Custom Frequency Interval...', description: 'Custom hours, days, or weeks' },
];

export function normalizeFrequencyValue(value: string): string {
  if (!value) return 'daily';
  if (value === 'instant') return 'realtime';
  return value;
}

/**
 * Resolves the frequency actually used for a delivery.
 * Precedence: admin-enforced policy > per-list override > account preference.
 */
export function resolveEffectiveFrequency(options: {
  enforcedFrequency?: string | null;
  isEnforced?: boolean;
  listFrequency?: string | null;
  accountFrequency?: string | null;
}): string {
  if (options.isEnforced && options.enforcedFrequency) {
    return normalizeFrequencyValue(String(options.enforcedFrequency));
  }
  const listFreq = (options.listFrequency || '').trim();
  if (listFreq && listFreq !== INHERIT_FREQUENCY) {
    return normalizeFrequencyValue(listFreq);
  }
  return normalizeFrequencyValue(options.accountFrequency || 'daily');
}

export function formatFrequencyLabel(value: string): string {
  if (!value) return 'Daily Digest (Recommended - one summary per day)';
  if (value === INHERIT_FREQUENCY) return 'Use my account default';

  const normalized = normalizeFrequencyValue(value);
  const found = FREQUENCY_OPTIONS.find(opt => opt.value === normalized);
  if (found && found.value !== 'custom') return found.label;

  if (value.startsWith('custom_')) {
    const parts = value.replace('custom_', '').split('_');
    const num = parts[0] || '1';
    const unit = parts[1] || 'hours';
    const singularUnit = unit.replace(/s$/, '');
    const formattedUnit = Number(num) === 1 ? singularUnit : `${singularUnit}s`;
    const capitalizedUnit = formattedUnit.charAt(0).toUpperCase() + formattedUnit.slice(1);
    return `Custom: Every ${num} ${capitalizedUnit}`;
  }

  return value;
}

/**
 * Guards what may be persisted as a frequency, so a bad client payload cannot
 * store a value the scheduler does not understand (which would silently fall
 * back to a daily cadence).
 */
export function isSupportedFrequency(value: string, options?: { allowInherit?: boolean }): boolean {
  const raw = (value || '').trim();
  if (!raw) return false;
  if (raw === INHERIT_FREQUENCY) return Boolean(options?.allowInherit);
  if (raw === 'custom') return false;

  const norm = normalizeFrequencyValue(raw);
  if (FREQUENCY_OPTIONS.some(o => o.value === norm && o.value !== 'custom')) return true;

  const match = /^custom_(\d+)_(hours?|days?|weeks?)$/.exec(norm);
  if (!match) return false;
  const num = Number(match[1]);
  return Number.isInteger(num) && num >= 1 && num <= 365;
}

/** Compact label for badges and dense table cells. */
export function formatFrequencyShortLabel(value: string): string {
  const raw = (value || '').trim();
  if (!raw || raw === INHERIT_FREQUENCY) return 'Account default';

  const norm = normalizeFrequencyValue(raw);
  switch (norm) {
    case 'realtime': return 'Instant';
    case 'every_6_hours': return 'Every 6h';
    case 'every_12_hours': return 'Every 12h';
    case 'daily': return 'Daily';
    case 'twice_weekly': return 'Mon & Thu';
    case 'weekly': return 'Weekly';
    case 'biweekly': return 'Bi-weekly';
    case 'monthly': return 'Monthly';
    default: {
      if (norm.startsWith('custom_')) {
        const { num, unit } = parseCustomFrequency(norm);
        const short = unit === 'hours' ? 'h' : unit === 'days' ? 'd' : 'w';
        return `Every ${num}${short}`;
      }
      return norm;
    }
  }
}

export function parseCustomFrequency(value: string): { num: number; unit: 'hours' | 'days' | 'weeks' } {
  if (value.startsWith('custom_')) {
    const parts = value.replace('custom_', '').split('_');
    const num = Math.max(1, parseInt(parts[0] || '3', 10));
    let unit: 'hours' | 'days' | 'weeks' = 'hours';
    if (parts[1]?.startsWith('day')) unit = 'days';
    if (parts[1]?.startsWith('week')) unit = 'weeks';
    return { num, unit };
  }
  return { num: 3, unit: 'hours' };
}

export function buildCustomFrequency(num: number, unit: 'hours' | 'days' | 'weeks'): string {
  const safeNum = Math.max(1, Math.floor(num));
  return `custom_${safeNum}_${unit}`;
}

export function getFrequencyIntervalMs(frequency: string): number {
  if (!frequency) return 24 * 60 * 60 * 1000;
  const norm = normalizeFrequencyValue(frequency);
  switch (norm) {
    case 'realtime':
    case 'instant':
      return 0;
    case 'every_6_hours':
      return 6 * 60 * 60 * 1000;
    case 'every_12_hours':
      return 12 * 60 * 60 * 1000;
    case 'daily':
      return 24 * 60 * 60 * 1000;
    case 'twice_weekly':
      return 3.5 * 24 * 60 * 60 * 1000;
    case 'weekly':
      return 7 * 24 * 60 * 60 * 1000;
    case 'biweekly':
      return 14 * 24 * 60 * 60 * 1000;
    case 'monthly':
      return 30 * 24 * 60 * 60 * 1000;
    default:
      if (frequency.startsWith('custom_')) {
        const { num, unit } = parseCustomFrequency(frequency);
        if (unit === 'hours') return num * 60 * 60 * 1000;
        if (unit === 'days') return num * 24 * 60 * 60 * 1000;
        if (unit === 'weeks') return num * 7 * 24 * 60 * 60 * 1000;
      }
      return 24 * 60 * 60 * 1000;
  }
}

