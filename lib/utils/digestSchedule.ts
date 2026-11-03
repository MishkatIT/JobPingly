/**
 * Timezone-aware digest schedule engine.
 *
 * The notification system used to decide "is this digest due?" purely by measuring
 * elapsed time since the previous send. That can never honour a setting such as
 * "every day at 8:00 AM": a digest that happened to go out at 15:17 would send the
 * next one at 15:17 the following day, and the send time drifted later forever.
 *
 * This module instead resolves a frequency + a wall-clock time + an IANA timezone
 * into concrete *slots* (e.g. "2026-11-04 08:00 Asia/Dhaka"). A digest is due when
 * the most recent slot at or before `now` has not been delivered yet. That makes
 * daily / twice-weekly / weekly / biweekly / monthly land on the exact advertised
 * time, with no drift, and keeps DST correct because every slot is resolved through
 * the calendar of the user's own timezone.
 *
 * Sub-daily frequencies (every N hours) stay interval-based, but are anchored to a
 * fixed epoch grid aligned to the user's chosen minute instead of to the last send,
 * so they also stop drifting.
 */

import { normalizeFrequencyValue, parseCustomFrequency } from './frequency';

export const DEFAULT_DIGEST_HOUR = 8;
export const DEFAULT_DIGEST_MINUTE = 0;
export const DEFAULT_TIMEZONE = 'UTC';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Monday 1970-01-05 expressed as a day index, used as the week-grid origin. */
const EPOCH_MONDAY_DAY_INDEX = 4;

export type DigestScheduleKind = 'realtime' | 'interval' | 'calendar';

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
  weekday: number; // 1 = Monday ... 7 = Sunday (ISO)
}

export interface DigestScheduleInput {
  frequency: string;
  now?: Date;
  lastSentAt?: Date | null;
  timezone?: string | null;
  hour?: number | null;
  minute?: number | null;
  /**
   * Creation time of the oldest item waiting to be delivered. A slot only counts
   * if it is at or after this instant, so a job that arrives at 09:00 waits for
   * tomorrow's 08:00 slot rather than riding on today's slot that already passed.
   */
  oldestPendingAt?: Date | null;
}

export interface DigestScheduleResult {
  /** True when a scheduled slot is pending delivery. */
  due: boolean;
  kind: DigestScheduleKind;
  /** The slot this delivery would satisfy (null for realtime). */
  slotAt: Date | null;
  /** When the next delivery becomes due. */
  nextDueAt: Date | null;
  /** Human readable explanation, surfaced in worker logs and admin diagnostics. */
  reason: string;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};

const zonedFormatterCache = new Map<string, Intl.DateTimeFormat>();

/** Validates an IANA timezone id without throwing. */
export function isValidTimezone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimezone(timeZone?: string | null): string {
  const tz = (timeZone || '').trim();
  if (tz && isValidTimezone(tz)) return tz;
  return DEFAULT_TIMEZONE;
}

export function normalizeDigestHour(hour?: number | null): number {
  const n = Number(hour);
  if (!Number.isFinite(n)) return DEFAULT_DIGEST_HOUR;
  return Math.min(23, Math.max(0, Math.floor(n)));
}

export function normalizeDigestMinute(minute?: number | null): number {
  const n = Number(minute);
  if (!Number.isFinite(n)) return DEFAULT_DIGEST_MINUTE;
  return Math.min(59, Math.max(0, Math.floor(n)));
}

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = zonedFormatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    zonedFormatterCache.set(timeZone, fmt);
  }
  return fmt;
}

/** Breaks an instant into wall-clock parts inside `timeZone`. */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = getFormatter(timeZone).formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') lookup[p.type] = p.value;
  }
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour) % 24,
    minute: Number(lookup.minute),
    second: Number(lookup.second),
    weekday: WEEKDAY_INDEX[lookup.weekday] || 1,
  };
}

/** Offset of `timeZone` from UTC, in ms, at the given instant. */
function getTimezoneOffsetMs(date: Date, timeZone: string): number {
  const p = getZonedParts(date, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Converts a wall-clock time in `timeZone` into the matching UTC instant.
 * Resolved twice so DST transitions (where the first guess lands on the wrong
 * side of the shift) settle on the correct offset.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstOffset = getTimezoneOffsetMs(new Date(asIfUtc), timeZone);
  let ts = asIfUtc - firstOffset;
  const secondOffset = getTimezoneOffsetMs(new Date(ts), timeZone);
  if (secondOffset !== firstOffset) {
    ts = asIfUtc - secondOffset;
  }
  return new Date(ts);
}

/** Local calendar day index (days since 1970-01-01 in `timeZone`). */
function localDayIndex(parts: ZonedParts): number {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / MS_PER_DAY);
}

function dayIndexToCalendar(dayIndex: number): { year: number; month: number; day: number } {
  const d = new Date(dayIndex * MS_PER_DAY);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Classifies a frequency value into how it must be scheduled. */
export function getScheduleKind(frequency: string): DigestScheduleKind {
  const norm = normalizeFrequencyValue(frequency || 'daily');
  if (norm === 'realtime') return 'realtime';
  if (norm === 'every_6_hours' || norm === 'every_12_hours') return 'interval';
  if (norm.startsWith('custom_')) {
    return parseCustomFrequency(norm).unit === 'hours' ? 'interval' : 'calendar';
  }
  return 'calendar';
}

/** Interval length in whole hours for sub-daily frequencies. */
function getIntervalHours(frequency: string): number {
  const norm = normalizeFrequencyValue(frequency);
  if (norm === 'every_6_hours') return 6;
  if (norm === 'every_12_hours') return 12;
  if (norm.startsWith('custom_')) {
    const { num, unit } = parseCustomFrequency(norm);
    if (unit === 'hours') return Math.max(1, num);
  }
  return 24;
}

/**
 * Latest scheduled slot at or before `now`, plus the following slot.
 * Both are null only for realtime frequencies.
 */
export function resolveDigestSlots(input: DigestScheduleInput): {
  kind: DigestScheduleKind;
  currentSlot: Date | null;
  nextSlot: Date | null;
} {
  const now = input.now || new Date();
  const frequency = normalizeFrequencyValue(input.frequency || 'daily');
  const kind = getScheduleKind(frequency);
  if (kind === 'realtime') {
    return { kind, currentSlot: null, nextSlot: null };
  }

  const timeZone = normalizeTimezone(input.timezone);
  const hour = normalizeDigestHour(input.hour);
  const minute = normalizeDigestMinute(input.minute);

  if (kind === 'interval') {
    // Fixed epoch grid aligned to the user's chosen hour:minute, so "every 6 hours"
    // keeps hitting 08:00 / 14:00 / 20:00 / 02:00 instead of sliding later each cycle.
    const intervalMs = getIntervalHours(frequency) * MS_PER_HOUR;
    const anchor = zonedTimeToUtc(1970, 1, 1, hour, minute, timeZone).getTime();
    const slotIndex = Math.floor((now.getTime() - anchor) / intervalMs);
    return {
      kind,
      currentSlot: new Date(anchor + slotIndex * intervalMs),
      nextSlot: new Date(anchor + (slotIndex + 1) * intervalMs),
    };
  }

  const nowParts = getZonedParts(now, timeZone);
  const todayIndex = localDayIndex(nowParts);
  const nowMinutes = nowParts.hour * 60 + nowParts.minute;
  const slotMinutes = hour * 60 + minute;
  // If the slot time has not arrived yet today, today is not an eligible slot day.
  const lastElapsedDayIndex = nowMinutes >= slotMinutes ? todayIndex : todayIndex - 1;

  const slotFromDayIndex = (dayIndex: number): Date => {
    const cal = dayIndexToCalendar(dayIndex);
    return zonedTimeToUtc(cal.year, cal.month, cal.day, hour, minute, timeZone);
  };

  const isSlotDay = buildSlotDayPredicate(frequency);
  // 420 days covers the longest gap any supported frequency can produce
  // (custom_52_weeks) with room to spare.
  const SEARCH_LIMIT_DAYS = 420;

  let currentDay: number | null = null;
  for (let i = 0; i <= SEARCH_LIMIT_DAYS; i++) {
    const candidate = lastElapsedDayIndex - i;
    if (isSlotDay(candidate)) {
      currentDay = candidate;
      break;
    }
  }

  let nextDay: number | null = null;
  for (let i = 1; i <= SEARCH_LIMIT_DAYS; i++) {
    const candidate = lastElapsedDayIndex + i;
    if (isSlotDay(candidate)) {
      nextDay = candidate;
      break;
    }
  }

  return {
    kind,
    currentSlot: currentDay === null ? null : slotFromDayIndex(currentDay),
    nextSlot: nextDay === null ? null : slotFromDayIndex(nextDay),
  };
}

/** Builds a predicate deciding whether a local day index carries a slot. */
function buildSlotDayPredicate(frequency: string): (dayIndex: number) => boolean {
  const norm = normalizeFrequencyValue(frequency);
  const isoWeekday = (dayIndex: number) => (((dayIndex - EPOCH_MONDAY_DAY_INDEX) % 7) + 7) % 7 + 1;
  const weekIndex = (dayIndex: number) => Math.floor((dayIndex - EPOCH_MONDAY_DAY_INDEX) / 7);

  switch (norm) {
    case 'daily':
      return () => true;
    case 'twice_weekly':
      // Advertised as "every Monday & Thursday".
      return (dayIndex) => isoWeekday(dayIndex) === 1 || isoWeekday(dayIndex) === 4;
    case 'weekly':
      return (dayIndex) => isoWeekday(dayIndex) === 1;
    case 'biweekly':
      return (dayIndex) => isoWeekday(dayIndex) === 1 && ((weekIndex(dayIndex) % 2) + 2) % 2 === 0;
    case 'monthly':
      return (dayIndex) => dayIndexToCalendar(dayIndex).day === 1;
    default: {
      if (norm.startsWith('custom_')) {
        const { num, unit } = parseCustomFrequency(norm);
        const n = Math.max(1, num);
        if (unit === 'days') {
          return (dayIndex) => ((dayIndex % n) + n) % n === 0;
        }
        if (unit === 'weeks') {
          return (dayIndex) => isoWeekday(dayIndex) === 1 && ((weekIndex(dayIndex) % n) + n) % n === 0;
        }
      }
      return () => true;
    }
  }
}

/**
 * Decides whether a digest is due right now.
 *
 * A calendar digest is due when the newest elapsed slot has not been delivered yet.
 * Realtime digests are always due. Delivery history comes from `lastSentAt`, which
 * must be the last time an email was actually *sent* to this recipient (not the last
 * time a queue row was resolved).
 */
export function evaluateDigestSchedule(input: DigestScheduleInput): DigestScheduleResult {
  const now = input.now || new Date();
  const frequency = normalizeFrequencyValue(input.frequency || 'daily');
  const { kind, currentSlot, nextSlot } = resolveDigestSlots({ ...input, now });

  if (kind === 'realtime') {
    return {
      due: true,
      kind,
      slotAt: null,
      nextDueAt: now,
      reason: 'Realtime delivery: sending immediately.',
    };
  }

  const timeZone = normalizeTimezone(input.timezone);
  const hour = normalizeDigestHour(input.hour);
  const minute = normalizeDigestMinute(input.minute);
  const clock = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${timeZone}`;
  const lastSentAt = input.lastSentAt ? new Date(input.lastSentAt) : null;

  if (!currentSlot) {
    return {
      due: false,
      kind,
      slotAt: null,
      nextDueAt: nextSlot,
      reason: `No '${frequency}' slot has elapsed yet. Next slot ${nextSlot ? nextSlot.toISOString() : 'unknown'} (${clock}).`,
    };
  }

  const oldestPendingAt = input.oldestPendingAt ? new Date(input.oldestPendingAt) : null;
  const hasValidPending = oldestPendingAt && !Number.isNaN(oldestPendingAt.getTime());

  // The newest elapsed slot predates the queued items, so those items belong to
  // the next slot, not this one.
  if (hasValidPending && currentSlot.getTime() < oldestPendingAt!.getTime()) {
    return {
      due: false,
      kind,
      slotAt: currentSlot,
      nextDueAt: nextSlot,
      reason: `Oldest pending item (${oldestPendingAt!.toISOString()}) arrived after the last '${frequency}' slot ${currentSlot.toISOString()}. Waiting for ${nextSlot ? nextSlot.toISOString() : 'next slot'} (${clock}).`,
    };
  }

  const alreadyDelivered =
    lastSentAt &&
    !Number.isNaN(lastSentAt.getTime()) &&
    lastSentAt.getTime() >= currentSlot.getTime();

  if (alreadyDelivered) {
    return {
      due: false,
      kind,
      slotAt: currentSlot,
      nextDueAt: nextSlot,
      reason: `'${frequency}' slot ${currentSlot.toISOString()} already delivered at ${lastSentAt!.toISOString()}. Next slot ${nextSlot ? nextSlot.toISOString() : 'unknown'} (${clock}).`,
    };
  }

  return {
    due: true,
    kind,
    slotAt: currentSlot,
    nextDueAt: currentSlot,
    reason: lastSentAt
      ? `'${frequency}' slot ${currentSlot.toISOString()} (${clock}) is pending; last delivery ${lastSentAt.toISOString()}.`
      : `First '${frequency}' digest, for slot ${currentSlot.toISOString()} (${clock}).`,
  };
}

/** Short human description of a resolved schedule, for UI and logs. */
export function describeDigestSchedule(
  frequency: string,
  hour?: number | null,
  minute?: number | null,
  timeZone?: string | null,
): string {
  const norm = normalizeFrequencyValue(frequency || 'daily');
  if (norm === 'realtime') return 'Immediately on every match';

  const h = normalizeDigestHour(hour);
  const m = normalizeDigestMinute(minute);
  const tz = normalizeTimezone(timeZone);
  const clock = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  if (getScheduleKind(norm) === 'interval') {
    return `Every ${getIntervalHours(norm)} hours, aligned to ${clock} ${tz}`;
  }

  switch (norm) {
    case 'daily': return `Every day at ${clock} ${tz}`;
    case 'twice_weekly': return `Every Monday & Thursday at ${clock} ${tz}`;
    case 'weekly': return `Every Monday at ${clock} ${tz}`;
    case 'biweekly': return `Every other Monday at ${clock} ${tz}`;
    case 'monthly': return `On the 1st of each month at ${clock} ${tz}`;
    default: {
      if (norm.startsWith('custom_')) {
        const { num, unit } = parseCustomFrequency(norm);
        if (unit === 'days') return `Every ${num} day(s) at ${clock} ${tz}`;
        if (unit === 'weeks') return `Every ${num} week(s) on Monday at ${clock} ${tz}`;
      }
      return `Every day at ${clock} ${tz}`;
    }
  }
}
