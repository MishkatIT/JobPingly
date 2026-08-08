import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users, emailApprovals } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [dbUser] = await db.select().from(users).where(eq(users.id, authUser.userId));
  if (!dbUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Check email approval status
  const [approvalRecord] = await db.select().from(emailApprovals).where(eq(emailApprovals.email, dbUser.email.toLowerCase().trim()));
  const emailApprovalStatus = approvalRecord ? approvalRecord.status : 'pending';

  return NextResponse.json({
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      avatarUrl: dbUser.avatarUrl,
      role: dbUser.role,
      emailVerified: dbUser.emailVerified,
      emailNotificationsEnabled: dbUser.emailNotificationsEnabled,
      notificationPreference: dbUser.notificationPreference,
      emailApprovalStatus,
      createdAt: dbUser.createdAt,
    },
  });
}
