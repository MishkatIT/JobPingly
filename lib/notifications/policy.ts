import { env } from '@/lib/env';
import { getSettings } from '@/lib/settings/store';
import { DEFAULT_DIGEST_MINUTE, normalizeDigestHour, normalizeDigestMinute } from '@/lib/utils/digestSchedule';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Admin-controlled delivery policy, loaded once per processing cycle. The
 * worker and the admin diagnostics screen both read the policy through this
 * module, so the diagnostics always describe what the worker will really do.
 */
export interface NotificationPolicy {
  notificationsEnabled: boolean;
  dailyLimit: number;
  safetyBuffer: number;
  /** Daily allowance available to digests (limit minus the transactional reserve). */
  effectiveDigestLimit: number;
  cycleDays: number;
  cohortGroupingEnabled: boolean;
  cohortPressureRatio: number;
  /** Sends today at which cohort staggering starts. */
  cohortPressureThreshold: number;
  globalPolicyEnforced: boolean;
  enforcedFrequencyValue: string;
  /** Admin-pinned delivery hour, or null to use each user's own setting. */
  enforcedDigestHour: number | null;
  enforcedDigestMinute: number | null;
  todayCohort: number;
  requireApproval: boolean;
}

/** Cohort for a day, anchored to the epoch so the rotation does not jump at new year. */
export function getTodayCohort(cycleDays: number, now: Date = new Date()): number {
  const cycle = Math.max(1, Math.floor(cycleDays) || 1);
  const epochDay = Math.floor(now.getTime() / MS_PER_DAY);
  return (((epochDay % cycle) + cycle) % cycle) + 1;
}

/** Folds a stored dispatch group into the active cycle length, so shrinking the cycle strands nobody. */
export function resolveCohortGroup(dispatchGroup: number | null | undefined, cycleDays: number): number {
  const cycle = Math.max(1, Math.floor(cycleDays) || 1);
  const group = Math.max(1, Math.floor(Number(dispatchGroup) || 1));
  return ((((group - 1) % cycle) + cycle) % cycle) + 1;
}

export async function loadNotificationPolicy(overrides?: { dailyLimit?: number; safetyBuffer?: number; now?: Date }): Promise<NotificationPolicy> {
  const settings = await getSettings([
    'notifications.enabled',
    'email.brevo_daily_limit',
    'email.transactional_safety_buffer',
    'email.cohort_cycle_days',
    'email.cohort_grouping_enabled',
    'email.cohort_pressure_ratio',
    'notifications.enforce_frequency',
    'notifications.enforced_frequency_value',
    'notifications.enforced_digest_hour',
    'notifications.enforced_digest_minute',
    'email.auto_approve_enabled',
  ]);

  const dailyLimit = overrides?.dailyLimit ?? (settings['email.brevo_daily_limit'] || env.email.dailyLimit);
  const safetyBuffer = overrides?.safetyBuffer ?? settings['email.transactional_safety_buffer'];
  const cycleDays = Math.max(1, Math.floor(settings['email.cohort_cycle_days']));
  const effectiveDigestLimit = Math.max(1, dailyLimit - safetyBuffer);
  const cohortPressureRatio = Math.min(1, Math.max(0, settings['email.cohort_pressure_ratio']));

  const hour = settings['notifications.enforced_digest_hour'];
  const minute = settings['notifications.enforced_digest_minute'];
  const hourPinned = hour >= 0 && hour <= 23;

  return {
    notificationsEnabled: settings['notifications.enabled'],
    dailyLimit,
    safetyBuffer,
    effectiveDigestLimit,
    cycleDays,
    cohortGroupingEnabled: settings['email.cohort_grouping_enabled'],
    cohortPressureRatio,
    cohortPressureThreshold: Math.floor(effectiveDigestLimit * cohortPressureRatio),
    globalPolicyEnforced: settings['notifications.enforce_frequency'],
    enforcedFrequencyValue: settings['notifications.enforced_frequency_value'] || 'daily',
    enforcedDigestHour: hourPinned ? normalizeDigestHour(hour) : null,
    enforcedDigestMinute: hourPinned ? normalizeDigestMinute(minute >= 0 ? minute : DEFAULT_DIGEST_MINUTE) : null,
    todayCohort: getTodayCohort(cycleDays, overrides?.now),
    requireApproval: !settings['email.auto_approve_enabled'],
  };
}

/**
 * Decides whether staggered cohort rotation should hold a digest back.
 *
 * Staggering exists to stop a burst of digests exhausting the provider's
 * daily allowance. It applies only once the allowance is under real pressure
 * and never to realtime deliveries, so it cannot silently override the
 * frequency a user chose.
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

  if (!policy.cohortGroupingEnabled) return { defer: false, reason: 'Staggering is off.', userGroup };
  if (isQuotaExempt) return { defer: false, reason: 'Quota-exempt recipient.', userGroup };
  if (isRealtime) return { defer: false, reason: 'Realtime delivery is never staggered.', userGroup };
  if (sentToday < policy.cohortPressureThreshold) {
    return { defer: false, reason: `Allowance not under pressure (${sentToday}/${policy.cohortPressureThreshold}).`, userGroup };
  }
  if (userGroup === policy.todayCohort) return { defer: false, reason: `Group ${userGroup} is today's group.`, userGroup };
  return {
    defer: true,
    reason: `Allowance under pressure (${sentToday}/${policy.cohortPressureThreshold}); group ${userGroup} waits for its day (today is group ${policy.todayCohort}).`,
    userGroup,
  };
}
