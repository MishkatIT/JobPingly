'use client';

import { Input, Select } from '@/components/ui/form';
import { buildCustomFrequency, INHERIT_FREQUENCY, normalizeFrequencyValue, parseCustomFrequency } from '@/lib/utils/frequency';

/** Plain labels; the stored values are shared with the digest scheduler. */
const OPTIONS: { value: string; label: string }[] = [
  { value: 'realtime', label: 'As soon as a job is found' },
  { value: 'every_6_hours', label: 'Every 6 hours' },
  { value: 'every_12_hours', label: 'Every 12 hours' },
  { value: 'daily', label: 'Once a day' },
  { value: 'twice_weekly', label: 'Twice a week (Monday and Thursday)' },
  { value: 'weekly', label: 'Once a week (Monday)' },
  { value: 'biweekly', label: 'Every two weeks' },
  { value: 'monthly', label: 'Once a month (on the 1st)' },
  { value: 'custom', label: 'Custom interval…' },
];

export function FrequencySelect({
  value,
  onChange,
  allowInherit,
  disabled,
  ...ids
}: {
  value: string;
  onChange: (value: string) => void;
  /** Adds "Account default" (stored as `inherit`). */
  allowInherit?: boolean;
  disabled?: boolean;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}) {
  const normalized = value === INHERIT_FREQUENCY ? value : normalizeFrequencyValue(value);
  const isCustom = normalized.startsWith('custom_');
  const custom = parseCustomFrequency(isCustom ? normalized : 'custom_3_days');

  return (
    <div className="space-y-2">
      <Select
        {...ids}
        value={isCustom ? 'custom' : normalized}
        disabled={disabled}
        onChange={event => onChange(event.target.value === 'custom' ? buildCustomFrequency(custom.num, custom.unit) : event.target.value)}
      >
        {allowInherit && <option value={INHERIT_FREQUENCY}>Account default</option>}
        {OPTIONS.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      {isCustom && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">Every</span>
          <Input
            type="number"
            min={1}
            max={365}
            aria-label="Interval length"
            className="w-20"
            disabled={disabled}
            value={custom.num}
            onChange={event => onChange(buildCustomFrequency(Math.min(365, Math.max(1, Number(event.target.value) || 1)), custom.unit))}
          />
          <Select aria-label="Interval unit" className="w-32" disabled={disabled} value={custom.unit} onChange={event => onChange(buildCustomFrequency(custom.num, event.target.value as 'hours' | 'days' | 'weeks'))}>
            <option value="hours">hours</option>
            <option value="days">days</option>
            <option value="weeks">weeks</option>
          </Select>
        </div>
      )}
    </div>
  );
}
