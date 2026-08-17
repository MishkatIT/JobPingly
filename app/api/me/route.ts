import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users, emailApprovals } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

import { isFeatureEnabled } from '@/lib/flags/check';

export async function GET(req: NextRequest) {
  const tTotalStart = performance.now();

  const tAuthStart = performance.now();
  const authUser = await getAuthUser(req);
  const tAuthEnd = performance.now();

  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dbUser = authUser.userRecord;
  if (!dbUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Check email approval status
  const tApprovalStart = performance.now();
  const [approvalRecord] = await db.select().from(emailApprovals).where(eq(emailApprovals.email, dbUser.email.toLowerCase().trim()));
  const emailApprovalStatus = approvalRecord ? approvalRecord.status : 'pending';
  const tApprovalEnd = performance.now();

  // Check frequency enforcement status
  const isEnforcedGlobal = await isFeatureEnabled('notifications.enforce_frequency', false);
  const enforcedFrequencyValue = await isFeatureEnabled('notifications.enforced_frequency_value', 'daily');
  const isExempt = Boolean(dbUser.frequencyEnforcementExempt);
  const isEnforced = isEnforcedGlobal && !isExempt;
  const effectivePreference = isEnforced ? enforcedFrequencyValue : dbUser.notificationPreference;

  const tTotalEnd = performance.now();
  console.log(`[PERF /api/me] Total: ${(tTotalEnd - tTotalStart).toFixed(2)}ms | Auth: ${(tAuthEnd - tAuthStart).toFixed(2)}ms | EmailApprovalQuery: ${(tApprovalEnd - tApprovalStart).toFixed(2)}ms`);

  return NextResponse.json({
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      avatarUrl: dbUser.avatarUrl,
      role: dbUser.role,
      emailVerified: dbUser.emailVerified,
      emailNotificationsEnabled: dbUser.emailNotificationsEnabled,
      notificationPreference: effectivePreference,
      rawNotificationPreference: dbUser.notificationPreference,
      frequencyEnforcementExempt: isExempt,
      frequencyEnforcement: {
        isEnforced,
        enforcedFrequency: enforcedFrequencyValue,
        isExempt,
      },
      socials: dbUser.socials || {},
      emailApprovalStatus,
      createdAt: dbUser.createdAt,
    },
  });
}
