import { isFeatureEnabled } from '../../../lib/flags/check';
import {
  DEFAULT_DIGEST_HOUR,
  DEFAULT_DIGEST_MINUTE,
  normalizeDigestHour,
  normalizeDigestMinute,
} from '../../../lib/utils/digestSchedule';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Admin-controlled delivery policy, loaded once per processing cycle.
 *
 * Both the worker processor and the admin queue-diagnostics endpoint read the
 * policy through this module so the diagnostics always explain what the worker
 * will actually do. They previously computed cohort days independently (with a
 * hard-coded 3-day cycle), so the panel could disagree with reality.
 */
export interface NotificationPolicy {
  notificationsEnabled: boolean;
  brevoLimit: number;
  safetyBuffer: number;
  effectiveDigestLimit: number;
  cycleDays: number;
  cohortGroupingEnabled: boolean;
  /** Fraction of the daily allowance that must be burned before cohort gating kicks in. */
  cohortPressureRatio: number;
  cohortPressureThreshold: number;
  globalPolicyEnforced: boolean;
  enforcedFrequencyValue: string;
  /** Admin-pinned delivery hour, or null to use each user's own setting. */
  enforcedDigestHour: number | null;
  enforcedDigestMinute: number | null;
  todayCohort: number;
}

/**
 * Cohort day index. Anchored to the epoch rather than to the day of the year so
 * the rotation does not jump at the new year boundary.
 */
export function getTodayCohort(cycleDays: number, now: Date = new Date()): number {
  const cycle = Math.max(1, Math.floor(cycleDays) || 1);
  const epochDay = Math.floor(now.getTime() / MS_PER_DAY);
  return (((epochDay % cycle) + cycle) % cycle) + 1;
}

/**
 * Folds a stored dispatch group into the active cycle length.
 *
 * Without this, shrinking the cycle (e.g. 3 days down to 2) left every user in
 * group 3 permanently unreachable, because no day ever matched their group.
 */
export function resolveCohortGroup(dispatchGroup: number | null | undefined, cycleDays: number): number {
  const cycle = Math.max(1, Math.floor(cycleDays) || 1);
  const group = Math.max(1, Math.floor(Number(dispatchGroup) || 1));
  return (((group - 1) % cycle) + cycle) % cycle + 1;
}

export async function loadNotificationPolicy(overrides?: {
  brevoLimit?: number;
  safetyBuffer?: number;
  now?: Date;
}): Promise<NotificationPolicy> {
  const envLimit = Number(process.env.BREVO_DAILY_LIMIT) || 300;
  const envBuffer = Number(process.env.BREVO_SAFETY_BUFFER) || 50;

  const notificationsEnabled = await isFeatureEnabled('notifications.enabled', true);
  const brevoLimit = overrides?.brevoLimit ?? (await isFeatureEnabled('email.brevo_daily_limit', envLimit));
  const safetyBuffer = overrides?.safetyBuffer ?? (await isFeatureEnabled('email.transactional_safety_buffer', envBuffer));
  const rawCycleDays = await isFeatureEnabled('email.cohort_cycle_days', 3);
  const cohortGroupingEnabled = await isFeatureEnabled('email.cohort_grouping_enabled', true);
  const rawPressureRatio = await isFeatureEnabled('email.cohort_pressure_ratio', 0.75);

  const isEnforcedGlobal1 = await isFeatureEnabled('notifications.enforce_frequency', false);
  const isEnforcedGlobal2 = await isFeatureEnabled('email.enforce_frequency_policy', false);
  const enforcedFrequencyValue = await isFeatureEnabled('notifications.enforced_frequency_value', 'daily');
  // -1 is the "not pinned" sentinel: each user keeps their own delivery time.
  const rawEnforcedHour = await isFeatureEnabled('notifications.enforced_digest_hour', -1);
  const rawEnforcedMinute = await isFeatureEnabled('notifications.enforced_digest_minute', -1);

  const cycleDays = Math.max(1, Math.floor(Number(rawCycleDays) || 3));
  const effectiveDigestLimit = Math.max(1, Number(brevoLimit) - Number(safetyBuffer));
  const cohortPressureRatio = Math.min(1, Math.max(0, Number(rawPressureRatio) || 0));

  const enforcedHourNum = Number(rawEnforcedHour);
  const enforcedMinuteNum = Number(rawEnforcedMinute);
  const hourPinned = Number.isFinite(enforcedHourNum) && enforcedHourNum >= 0 && enforcedHourNum <= 23;

  return {
    notificationsEnabled: Boolean(notificationsEnabled),
    brevoLimit: Number(brevoLimit),
    safetyBuffer: Number(safetyBuffer),
    effectiveDigestLimit,
    cycleDays,
    cohortGroupingEnabled: Boolean(cohortGroupingEnabled),
    cohortPressureRatio,
    cohortPressureThreshold: Math.floor(effectiveDigestLimit * cohortPressureRatio),
    globalPolicyEnforced: Boolean(isEnforcedGlobal1 || isEnforcedGlobal2),
    enforcedFrequencyValue: typeof enforcedFrequencyValue === 'string' ? enforcedFrequencyValue : 'daily',
    enforcedDigestHour: hourPinned ? normalizeDigestHour(enforcedHourNum) : null,
    enforcedDigestMinute: hourPinned
      ? normalizeDigestMinute(
          Number.isFinite(enforcedMinuteNum) && enforcedMinuteNum >= 0 ? enforcedMinuteNum : DEFAULT_DIGEST_MINUTE,
        )
      : null,
    todayCohort: getTodayCohort(cycleDays, overrides?.now),
  };
}

/**
 * Decides whether staggered cohort rotation should hold a user's digest back.
 *
 * Cohort grouping exists to stop a burst of digests blowing the Brevo daily
 * allowance. It used to apply unconditionally, which silently overrode every
 * user's chosen frequency: with the default 3-day cycle a "daily" subscriber
 * received mail every third day, and a "realtime" subscriber did too. It is now
 * only applied once the day's allowance is genuinely under pressure, and never
 * to realtime deliveries.
 */
export function shouldDeferForCohort(args: {
  policy: NotificationPolicy;
  dispatchGroup: number | null | undefined;
  sentToday: number;
  isRealtime: boolean;
  isQuotaExempt: boolean;
}): { defer: boolean; reason: string; userGroup: number } {
  const { policy, dispatchGroup, sentToday, isRealtime, isQuotaExempt } = args;
  const userGroup = resolveCohortGroup(dispatchGroup, policy.cycleDays);

  if (!policy.cohortGroupingEnabled) {
    return { defer: false, reason: 'Cohort grouping disabled.', userGroup };
  }
  if (isQuotaExempt) {
    return { defer: false, reason: 'Quota-exempt recipient bypasses cohort rotation.', userGroup };
  }
  if (isRealtime) {
    return { defer: false, reason: 'Realtime delivery bypasses cohort rotation.', userGroup };
  }
  if (sentToday < policy.cohortPressureThreshold) {
    return {
      defer: false,
      reason: `Daily allowance not under pressure (${sentToday}/${policy.cohortPressureThreshold}); cohort rotation not applied.`,
      userGroup,
    };
  }
  if (userGroup === policy.todayCohort) {
    return { defer: false, reason: `Cohort group ${userGroup} matches today.`, userGroup };
  }
  return {
    defer: true,
    reason: `Daily allowance under pressure (${sentToday}/${policy.cohortPressureThreshold}) and cohort group ${userGroup} is not today's group ${policy.todayCohort}.`,
    userGroup,
  };
}

export { DEFAULT_DIGEST_HOUR, DEFAULT_DIGEST_MINUTE };
