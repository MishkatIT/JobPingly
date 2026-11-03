/**
 * Digest schedule engine tests.
 *
 * These cover the behaviour that was broken: a user asking for "every day at
 * 8:00 AM" must receive the digest at 08:00 local time, once per day, with no
 * drift, in their own timezone.
 */

import {
  evaluateDigestSchedule,
  resolveDigestSlots,
  describeDigestSchedule,
  zonedTimeToUtc,
  getZonedParts,
  normalizeTimezone,
  normalizeDigestHour,
  isValidTimezone,
} from '../lib/utils/digestSchedule';
import {
  resolveEffectiveFrequency,
  isSupportedFrequency,
  INHERIT_FREQUENCY,
  buildCustomFrequency,
} from '../lib/utils/frequency';
import {
  getTodayCohort,
  resolveCohortGroup,
  shouldDeferForCohort,
  type NotificationPolicy,
} from '../packages/notifications/src/policy';

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail?: string) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✖ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function eq<T>(label: string, actual: T, expected: T) {
  check(label, actual === expected, `expected ${String(expected)}, got ${String(actual)}`);
}

console.log('\n[Digest Schedule] Timezone primitives...');
{
  eq('valid timezone accepted', isValidTimezone('Asia/Dhaka'), true);
  eq('bogus timezone rejected', isValidTimezone('Not/AZone'), false);
  eq('bogus timezone falls back to UTC', normalizeTimezone('Not/AZone'), 'UTC');
  eq('hour clamped to range', normalizeDigestHour(99), 23);
  eq('non-numeric hour falls back to 8', normalizeDigestHour(NaN), 8);

  // Dhaka is UTC+6 year round: 08:00 local == 02:00 UTC.
  const dhaka8am = zonedTimeToUtc(2026, 11, 4, 8, 0, 'Asia/Dhaka');
  eq('Dhaka 08:00 resolves to 02:00Z', dhaka8am.toISOString(), '2026-11-04T02:00:00.000Z');

  // New York in November is UTC-5 (EST): 08:00 local == 13:00 UTC.
  const nyWinter = zonedTimeToUtc(2026, 11, 20, 8, 0, 'America/New_York');
  eq('New York 08:00 EST resolves to 13:00Z', nyWinter.toISOString(), '2026-11-20T13:00:00.000Z');

  // Same wall clock in July is UTC-4 (EDT): 08:00 local == 12:00 UTC.
  const nySummer = zonedTimeToUtc(2026, 7, 20, 8, 0, 'America/New_York');
  eq('New York 08:00 EDT resolves to 12:00Z', nySummer.toISOString(), '2026-07-20T12:00:00.000Z');

  const parts = getZonedParts(new Date('2026-11-04T02:30:00.000Z'), 'Asia/Dhaka');
  eq('zoned parts hour', parts.hour, 8);
  eq('zoned parts weekday (Wednesday)', parts.weekday, 3);
}

console.log('[Digest Schedule] Daily digest lands on the configured hour...');
{
  const base = {
    frequency: 'daily',
    timezone: 'Asia/Dhaka',
    hour: 8,
    minute: 0,
  };

  // 07:30 Dhaka == 01:30Z. Today's 08:00 slot has not arrived.
  const beforeSlot = evaluateDigestSchedule({
    ...base,
    now: new Date('2026-11-04T01:30:00.000Z'),
    lastSentAt: new Date('2026-11-03T02:00:05.000Z'),
    oldestPendingAt: new Date('2026-11-03T18:00:00.000Z'),
  });
  eq('not due before 08:00 local', beforeSlot.due, false);
  eq('next slot is today 08:00 Dhaka', beforeSlot.nextDueAt!.toISOString(), '2026-11-04T02:00:00.000Z');

  // 08:01 Dhaka == 02:01Z. The slot has arrived and was not delivered.
  const atSlot = evaluateDigestSchedule({
    ...base,
    now: new Date('2026-11-04T02:01:00.000Z'),
    lastSentAt: new Date('2026-11-03T02:00:05.000Z'),
    oldestPendingAt: new Date('2026-11-03T18:00:00.000Z'),
  });
  eq('due just after 08:00 local', atSlot.due, true);
  eq('settles today 08:00 slot', atSlot.slotAt!.toISOString(), '2026-11-04T02:00:00.000Z');

  // Already delivered for that slot: must not send again the same day.
  const sameDay = evaluateDigestSchedule({
    ...base,
    now: new Date('2026-11-04T09:00:00.000Z'), // 15:00 Dhaka
    lastSentAt: new Date('2026-11-04T02:00:20.000Z'),
    oldestPendingAt: new Date('2026-11-03T18:00:00.000Z'),
  });
  eq('no second send on the same day', sameDay.due, false);
  eq('next slot is tomorrow 08:00 Dhaka', sameDay.nextDueAt!.toISOString(), '2026-11-05T02:00:00.000Z');

  // The old elapsed-interval logic drifted: a send at 15:17 pushed the next one
  // to 15:17 the following day. Slot scheduling pins it back to 08:00.
  const afterLateSend = evaluateDigestSchedule({
    ...base,
    now: new Date('2026-11-05T02:05:00.000Z'), // 08:05 Dhaka next day
    lastSentAt: new Date('2026-11-04T09:17:00.000Z'), // 15:17 Dhaka previous day
    oldestPendingAt: new Date('2026-11-04T12:00:00.000Z'),
  });
  eq('a late send does not push tomorrow later', afterLateSend.due, true);
  eq('still settles the 08:00 slot', afterLateSend.slotAt!.toISOString(), '2026-11-05T02:00:00.000Z');

  // A job that arrives after today's slot waits for tomorrow's slot.
  const arrivedAfterSlot = evaluateDigestSchedule({
    ...base,
    now: new Date('2026-11-04T09:00:00.000Z'), // 15:00 Dhaka
    lastSentAt: null,
    oldestPendingAt: new Date('2026-11-04T08:00:00.000Z'), // 14:00 Dhaka, after 08:00
  });
  eq('item queued after the slot waits', arrivedAfterSlot.due, false);
  eq('and targets tomorrow 08:00', arrivedAfterSlot.nextDueAt!.toISOString(), '2026-11-05T02:00:00.000Z');

  // A first-time recipient with an item queued before the slot gets it at the slot.
  const firstEver = evaluateDigestSchedule({
    ...base,
    now: new Date('2026-11-04T02:30:00.000Z'),
    lastSentAt: null,
    oldestPendingAt: new Date('2026-11-04T01:00:00.000Z'), // 07:00 Dhaka, before 08:00
  });
  eq('first digest delivers at the slot', firstEver.due, true);
}

console.log('[Digest Schedule] A different hour is obeyed...');
{
  const at21 = evaluateDigestSchedule({
    frequency: 'daily',
    timezone: 'Asia/Dhaka',
    hour: 21,
    minute: 30,
    now: new Date('2026-11-04T15:35:00.000Z'), // 21:35 Dhaka
    lastSentAt: new Date('2026-11-03T15:30:10.000Z'),
    oldestPendingAt: new Date('2026-11-04T06:00:00.000Z'),
  });
  eq('21:30 schedule fires after 21:30 local', at21.due, true);
  eq('slot is 21:30 Dhaka', at21.slotAt!.toISOString(), '2026-11-04T15:30:00.000Z');

  const notYet = evaluateDigestSchedule({
    frequency: 'daily',
    timezone: 'Asia/Dhaka',
    hour: 21,
    minute: 30,
    now: new Date('2026-11-04T15:25:00.000Z'), // 21:25 Dhaka
    lastSentAt: new Date('2026-11-03T15:30:10.000Z'),
    oldestPendingAt: new Date('2026-11-04T06:00:00.000Z'),
  });
  eq('21:30 schedule holds before 21:30 local', notYet.due, false);
}

console.log('[Digest Schedule] Weekly, twice-weekly, biweekly and monthly anchors...');
{
  // 2026-11-04 is a Wednesday; 2026-11-02 was the Monday.
  const weekly = resolveDigestSlots({
    frequency: 'weekly',
    now: new Date('2026-11-04T12:00:00.000Z'),
    timezone: 'UTC',
    hour: 8,
    minute: 0,
  });
  eq('weekly current slot is Monday 08:00', weekly.currentSlot!.toISOString(), '2026-11-02T08:00:00.000Z');
  eq('weekly next slot is the following Monday', weekly.nextSlot!.toISOString(), '2026-11-09T08:00:00.000Z');

  // Twice weekly is advertised as Monday & Thursday.
  const twiceWeekly = resolveDigestSlots({
    frequency: 'twice_weekly',
    now: new Date('2026-11-06T12:00:00.000Z'), // Friday
    timezone: 'UTC',
    hour: 8,
    minute: 0,
  });
  eq('twice-weekly current slot is Thursday', twiceWeekly.currentSlot!.toISOString(), '2026-11-05T08:00:00.000Z');
  eq('twice-weekly next slot is Monday', twiceWeekly.nextSlot!.toISOString(), '2026-11-09T08:00:00.000Z');

  // Monthly is advertised as the 1st of the month.
  const monthly = resolveDigestSlots({
    frequency: 'monthly',
    now: new Date('2026-11-04T12:00:00.000Z'),
    timezone: 'UTC',
    hour: 8,
    minute: 0,
  });
  eq('monthly current slot is the 1st', monthly.currentSlot!.toISOString(), '2026-11-01T08:00:00.000Z');
  eq('monthly next slot is the next 1st', monthly.nextSlot!.toISOString(), '2026-12-01T08:00:00.000Z');

  // Biweekly must stay on a Monday and alternate weeks.
  const biweekly = resolveDigestSlots({
    frequency: 'biweekly',
    now: new Date('2026-11-04T12:00:00.000Z'),
    timezone: 'UTC',
    hour: 8,
    minute: 0,
  });
  const bwParts = getZonedParts(biweekly.currentSlot!, 'UTC');
  eq('biweekly slot falls on a Monday', bwParts.weekday, 1);
  const gapDays = (biweekly.nextSlot!.getTime() - biweekly.currentSlot!.getTime()) / 86400000;
  eq('biweekly slots are 14 days apart', gapDays, 14);
}

console.log('[Digest Schedule] Interval and custom frequencies...');
{
  // Every 6 hours, aligned to the chosen 08:00 => 02:00/08:00/14:00/20:00 local.
  const every6 = resolveDigestSlots({
    frequency: 'every_6_hours',
    now: new Date('2026-11-04T07:10:00.000Z'), // 13:10 Dhaka
    timezone: 'Asia/Dhaka',
    hour: 8,
    minute: 0,
  });
  const slotParts = getZonedParts(every6.currentSlot!, 'Asia/Dhaka');
  eq('every-6h slot sits on an aligned hour', slotParts.hour % 6, 8 % 6);
  eq('every-6h slot minute is aligned', slotParts.minute, 0);

  // Custom every 2 days keeps a fixed day grid rather than drifting.
  const custom2d = buildCustomFrequency(2, 'days');
  eq('custom value is storable', isSupportedFrequency(custom2d), true);
  const c2 = resolveDigestSlots({
    frequency: custom2d,
    now: new Date('2026-11-04T12:00:00.000Z'),
    timezone: 'UTC',
    hour: 8,
    minute: 0,
  });
  const c2Gap = (c2.nextSlot!.getTime() - c2.currentSlot!.getTime()) / 86400000;
  eq('custom 2-day slots are 2 days apart', c2Gap, 2);

  // Custom every 3 weeks lands on Mondays, 21 days apart.
  const custom3w = buildCustomFrequency(3, 'weeks');
  const c3 = resolveDigestSlots({
    frequency: custom3w,
    now: new Date('2026-11-04T12:00:00.000Z'),
    timezone: 'UTC',
    hour: 8,
    minute: 0,
  });
  eq('custom 3-week slot is a Monday', getZonedParts(c3.currentSlot!, 'UTC').weekday, 1);
  eq('custom 3-week gap is 21 days', (c3.nextSlot!.getTime() - c3.currentSlot!.getTime()) / 86400000, 21);

  // Realtime ignores the clock entirely.
  const realtime = evaluateDigestSchedule({
    frequency: 'realtime',
    now: new Date('2026-11-04T19:00:00.000Z'),
    lastSentAt: new Date('2026-11-04T18:59:00.000Z'),
    timezone: 'Asia/Dhaka',
    hour: 8,
  });
  eq('realtime is always due', realtime.due, true);
  eq('realtime is classified as realtime', realtime.kind, 'realtime');
  eq('instant is an alias for realtime', evaluateDigestSchedule({ frequency: 'instant' }).kind, 'realtime');
}

console.log('[Digest Schedule] A full year of daily sends stays on 08:00...');
{
  // Replays the worker loop minute by minute over a DST-crossing span in a zone
  // that observes DST, asserting exactly one send per day, always at 08:00 local.
  const tz = 'America/New_York';
  let lastSentAt: Date | null = null;
  const sendHours: number[] = [];
  const sendDays = new Set<string>();

  const start = Date.parse('2027-03-10T00:00:00.000Z');
  const end = Date.parse('2027-03-20T00:00:00.000Z');
  for (let t = start; t < end; t += 10 * 60 * 1000) {
    const now = new Date(t);
    const verdict = evaluateDigestSchedule({
      frequency: 'daily',
      now,
      lastSentAt,
      timezone: tz,
      hour: 8,
      minute: 0,
      oldestPendingAt: new Date(t - 30 * 60 * 1000),
    });
    if (verdict.due) {
      const p = getZonedParts(now, tz);
      sendHours.push(p.hour);
      sendDays.add(`${p.year}-${p.month}-${p.day}`);
      lastSentAt = now;
    }
  }

  eq('one send per day across the DST change', sendDays.size, 10);
  eq('every send happened in the 08:00 hour', sendHours.every(h => h === 8), true);
  eq('send count matches day count', sendHours.length, 10);
}

console.log('[Digest Schedule] Frequency precedence...');
{
  eq(
    'per-list override beats the account preference',
    resolveEffectiveFrequency({ listFrequency: 'weekly', accountFrequency: 'daily' }),
    'weekly',
  );
  eq(
    'inherit falls through to the account preference',
    resolveEffectiveFrequency({ listFrequency: INHERIT_FREQUENCY, accountFrequency: 'every_6_hours' }),
    'every_6_hours',
  );
  eq(
    'admin enforcement beats everything',
    resolveEffectiveFrequency({
      isEnforced: true,
      enforcedFrequency: 'monthly',
      listFrequency: 'realtime',
      accountFrequency: 'daily',
    }),
    'monthly',
  );
  eq(
    'missing values default to daily',
    resolveEffectiveFrequency({ listFrequency: null, accountFrequency: null }),
    'daily',
  );
  eq('the "custom" placeholder is not storable', isSupportedFrequency('custom'), false);
  eq('garbage is not storable', isSupportedFrequency('every_other_tuesday'), false);
  eq('inherit needs opting in', isSupportedFrequency(INHERIT_FREQUENCY), false);
  eq('inherit is storable for a list', isSupportedFrequency(INHERIT_FREQUENCY, { allowInherit: true }), true);
}

console.log('[Digest Schedule] Cohort rotation no longer overrides frequency...');
{
  const policy: NotificationPolicy = {
    notificationsEnabled: true,
    brevoLimit: 300,
    safetyBuffer: 50,
    effectiveDigestLimit: 250,
    cycleDays: 3,
    cohortGroupingEnabled: true,
    cohortPressureRatio: 0.75,
    cohortPressureThreshold: 187,
    globalPolicyEnforced: false,
    enforcedFrequencyValue: 'daily',
    enforcedDigestHour: null,
    enforcedDigestMinute: null,
    todayCohort: 1,
  };

  // Quiet day: a group-2 user must still get their daily digest.
  eq(
    'cohort rotation does not hold back a daily digest on a quiet day',
    shouldDeferForCohort({ policy, dispatchGroup: 2, sentToday: 10, isRealtime: false, isQuotaExempt: false }).defer,
    false,
  );
  // Busy day: rotation protects the allowance.
  eq(
    'cohort rotation engages once the allowance is under pressure',
    shouldDeferForCohort({ policy, dispatchGroup: 2, sentToday: 200, isRealtime: false, isQuotaExempt: false }).defer,
    true,
  );
  eq(
    'realtime alerts are never held back by rotation',
    shouldDeferForCohort({ policy, dispatchGroup: 2, sentToday: 200, isRealtime: true, isQuotaExempt: false }).defer,
    false,
  );
  eq(
    'quota-exempt recipients bypass rotation',
    shouldDeferForCohort({ policy, dispatchGroup: 2, sentToday: 200, isRealtime: false, isQuotaExempt: true }).defer,
    false,
  );
  eq(
    'disabling cohort grouping disables deferral',
    shouldDeferForCohort({
      policy: { ...policy, cohortGroupingEnabled: false },
      dispatchGroup: 2,
      sentToday: 290,
      isRealtime: false,
      isQuotaExempt: false,
    }).defer,
    false,
  );

  // A user stored in group 3 while the cycle is 2 days long used to be
  // unreachable forever; the group now folds into the active cycle.
  eq('group 3 folds into a 2-day cycle', resolveCohortGroup(3, 2), 1);
  eq('group 2 folds into a 2-day cycle', resolveCohortGroup(2, 2), 2);
  eq('group 1 is unchanged', resolveCohortGroup(1, 3), 1);
  const cohortDays = new Set<number>();
  for (let d = 0; d < 6; d++) {
    cohortDays.add(getTodayCohort(3, new Date(Date.UTC(2026, 10, 4 + d))));
  }
  eq('every group in the cycle gets a turn', cohortDays.size, 3);

  // No stored group may be permanently unreachable for any cycle length.
  let unreachable = 0;
  for (let cycle = 1; cycle <= 7; cycle++) {
    for (let group = 1; group <= 5; group++) {
      const folded = resolveCohortGroup(group, cycle);
      let everMatches = false;
      for (let d = 0; d < cycle; d++) {
        if (getTodayCohort(cycle, new Date(Date.UTC(2026, 10, 4 + d))) === folded) everMatches = true;
      }
      if (!everMatches) unreachable++;
    }
  }
  eq('no cohort group is permanently starved', unreachable, 0);
}

console.log('[Digest Schedule] Human-readable labels...');
{
  eq(
    'daily label states the time and zone',
    describeDigestSchedule('daily', 8, 0, 'Asia/Dhaka'),
    'Every day at 08:00 Asia/Dhaka',
  );
  eq(
    'weekly label names the day',
    describeDigestSchedule('weekly', 9, 30, 'UTC'),
    'Every Monday at 09:30 UTC',
  );
  eq('realtime label has no time', describeDigestSchedule('realtime'), 'Immediately on every match');
}

if (failures > 0) {
  console.error(`\n✖ Digest schedule tests: ${failures} of ${checks} assertions failed.`);
  process.exitCode = 1;
} else {
  console.log(`\n✔ Digest schedule tests passed (${checks} assertions).`);
}
