export interface FrequencyOption {
  value: string;
  label: string;
  description?: string;
}

export const FREQUENCY_OPTIONS: FrequencyOption[] = [
  { value: 'realtime', label: 'Instant Notification (Sends alert immediately upon match)', description: 'Real-time notifications' },
  { value: 'every_6_hours', label: 'Every 6 Hours (4 times a day)', description: '6-hour interval' },
  { value: 'every_12_hours', label: 'Every 12 Hours (Twice a day)', description: '12-hour interval' },
  { value: 'daily', label: 'Daily Digest (Recommended - 8:00 AM summary)', description: 'Daily summary at 8:00 AM' },
  { value: 'twice_weekly', label: 'Twice a Week (Summary every Monday & Thursday)', description: 'Bi-weekly digests' },
  { value: 'weekly', label: 'Weekly Digest (Summary every Monday)', description: 'Weekly summary' },
  { value: 'biweekly', label: 'Bi-weekly Digest (Summary every 2 weeks)', description: 'Fortnightly summary' },
  { value: 'monthly', label: 'Monthly Digest (Summary on 1st of month)', description: 'Monthly summary' },
  { value: 'custom', label: '⚙️ Custom Frequency Interval...', description: 'Custom hours, days, or weeks' },
];

export function normalizeFrequencyValue(value: string): string {
  if (!value) return 'daily';
  if (value === 'instant') return 'realtime';
  return value;
}

export function formatFrequencyLabel(value: string): string {
  if (!value) return 'Daily Digest (Recommended - 8:00 AM summary)';
  
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

