import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, invalidateUserSessionCache } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users, emailApprovals } from '@/lib/db/schema';
import { isFeatureEnabled } from '@/lib/flags/check';
import { eq } from 'drizzle-orm';
import { isSupportedFrequency, normalizeFrequencyValue } from '@/lib/utils/frequency';
import {
  isValidTimezone,
  normalizeDigestHour,
  normalizeDigestMinute,
  describeDigestSchedule,
  evaluateDigestSchedule,
} from '@/lib/utils/digestSchedule';

export async function PUT(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const {
    name,
    avatarUrl,
    emailNotificationsEnabled,
    notificationPreference,
    digestHour,
    digestMinute,
    timezone,
    socials,
  } = body;

  const isEnforcedGlobal = await isFeatureEnabled('notifications.enforce_frequency', false);
  const enforcedFrequencyValue = await isFeatureEnabled('notifications.enforced_frequency_value', 'daily');
  const isExempt = Boolean(authUser.userRecord?.frequencyEnforcementExempt);
  const isEnforced = isEnforcedGlobal && !isExempt;

  const updateFields: any = {};
  if (name !== undefined) updateFields.name = name;
  if (emailNotificationsEnabled !== undefined) updateFields.emailNotificationsEnabled = Boolean(emailNotificationsEnabled);

  // While a policy is enforced the stored preference is left untouched: the
  // processor resolves the enforced value at send time, and preserving the user's
  // own choice means it comes back intact once the policy is lifted. Overwriting
  // it here also used to clobber the preference on unrelated saves (e.g. a name
  // change), because the write fired whenever enforcement was active.
  if (notificationPreference !== undefined && !isEnforced) {
    const requested = String(notificationPreference).trim();
    if (!isSupportedFrequency(requested)) {
      return NextResponse.json(
        { error: `Unsupported notification frequency '${requested}'.` },
        { status: 400 },
      );
    }
    updateFields.notificationPreference = normalizeFrequencyValue(requested);
  }

  // Wall-clock delivery time for scheduled digests.
  if (digestHour !== undefined) {
    const h = Number(digestHour);
    if (!Number.isFinite(h) || h < 0 || h > 23) {
      return NextResponse.json({ error: 'Digest hour must be between 0 and 23.' }, { status: 400 });
    }
    updateFields.digestHour = normalizeDigestHour(h);
  }

  if (digestMinute !== undefined) {
    const m = Number(digestMinute);
    if (!Number.isFinite(m) || m < 0 || m > 59) {
      return NextResponse.json({ error: 'Digest minute must be between 0 and 59.' }, { status: 400 });
    }
    updateFields.digestMinute = normalizeDigestMinute(m);
  }

  if (timezone !== undefined) {
    const tz = String(timezone).trim();
    if (!isValidTimezone(tz)) {
      return NextResponse.json({ error: `'${tz}' is not a recognised IANA timezone.` }, { status: 400 });
    }
    updateFields.timezone = tz;
  }

  if (avatarUrl !== undefined) {
    updateFields.avatarUrl = avatarUrl ? String(avatarUrl).trim() : null;
  }

  if (socials !== undefined) {
    updateFields.socials = socials;
  }

  // Drizzle rejects an empty SET clause, so a no-op payload is read back instead.
  let updated;
  if (Object.keys(updateFields).length > 0) {
    [updated] = await db.update(users).set(updateFields).where(eq(users.id, authUser.userId)).returning();
    await invalidateUserSessionCache(authUser.userId);
  } else {
    [updated] = await db.select().from(users).where(eq(users.id, authUser.userId));
  }

  let emailApprovalStatus = 'pending';
  const autoApproveEnabled = await isFeatureEnabled('email.auto_approve_enabled', false);

  const userEmail = authUser.email.toLowerCase().trim();
  const [existingRecord] = await db.select().from(emailApprovals).where(eq(emailApprovals.email, userEmail));

  if (existingRecord) {
    emailApprovalStatus = existingRecord.status;
    if (existingRecord.status === 'unapproved' && emailNotificationsEnabled) {
      const nextStatus = autoApproveEnabled ? 'approved' : 'pending';
      await db.update(emailApprovals).set({
        status: nextStatus,
        requestedAt: new Date(),
        approvedAt: autoApproveEnabled ? new Date() : null,
      }).where(eq(emailApprovals.id, existingRecord.id));
      emailApprovalStatus = nextStatus;
    }
  } else if (emailNotificationsEnabled) {
    const initialStatus = autoApproveEnabled ? 'approved' : 'pending';
    await db.insert(emailApprovals).values({
      email: userEmail,
      userId: authUser.userId,
      status: initialStatus,
      requestedAt: new Date(),
      approvedAt: autoApproveEnabled ? new Date() : null,
    });
    emailApprovalStatus = initialStatus;
  }

  const effectivePreference = isEnforced
    ? String(enforcedFrequencyValue)
    : (updated?.notificationPreference || 'daily');

  return NextResponse.json({
    user: {
      ...updated,
      notificationPreference: effectivePreference,
      rawNotificationPreference: updated?.notificationPreference,
      emailApprovalStatus,
      digestScheduleLabel: describeDigestSchedule(
        effectivePreference,
        updated?.digestHour,
        updated?.digestMinute,
        updated?.timezone,
      ),
      nextDigestAt: evaluateDigestSchedule({
        frequency: effectivePreference,
        lastSentAt: updated?.lastDigestSentAt,
        timezone: updated?.timezone,
        hour: updated?.digestHour,
        minute: updated?.digestMinute,
      }).nextDueAt,
    },
  });
}
