import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users, emailApprovals } from '@/lib/db/schema';
import { isFeatureEnabled } from '@/lib/flags/check';
import { eq } from 'drizzle-orm';

export async function PUT(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { name, avatarUrl, emailNotificationsEnabled, notificationPreference, socials } = body;

  const isEnforcedGlobal = await isFeatureEnabled('notifications.enforce_frequency', false);
  const enforcedFrequencyValue = await isFeatureEnabled('notifications.enforced_frequency_value', 'daily');
  const isExempt = Boolean(authUser.userRecord?.frequencyEnforcementExempt);
  const isEnforced = isEnforcedGlobal && !isExempt;

  const finalPreference = isEnforced ? enforcedFrequencyValue : (notificationPreference || 'daily');

  const updateFields: any = {
    name,
    emailNotificationsEnabled: Boolean(emailNotificationsEnabled),
    notificationPreference: finalPreference,
  };

  if (avatarUrl !== undefined) {
    updateFields.avatarUrl = avatarUrl ? String(avatarUrl).trim() : null;
  }

  if (socials !== undefined) {
    updateFields.socials = socials;
  }

  const [updated] = await db.update(users).set(updateFields).where(eq(users.id, authUser.userId)).returning();

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

  return NextResponse.json({
    user: {
      ...updated,
      emailApprovalStatus,
    },
  });
}
