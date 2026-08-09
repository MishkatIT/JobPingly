import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users, emailVerifications, emailApprovals, adminAuditLog } from '@/lib/db/schema';
import { generateOtp, hashOtp } from '@/lib/auth/otp';
import { sendOtpVerificationEmail } from '@/lib/email/brevo';
import { isFeatureEnabled } from '@/lib/flags/check';
import { eq } from 'drizzle-orm';

// POST: Admin actions on an unverified user (verify | resend)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const userId = params.id;
  const body = await req.json();
  const { action } = body;

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    return NextResponse.json({ error: 'Unverified user not found.' }, { status: 404 });
  }

  if (action === 'verify') {
    // 1. Mark user emailVerified = true
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, userId));

    // 2. Clean up any verification codes
    await db.delete(emailVerifications).where(eq(emailVerifications.userId, userId));

    // 3. Create email approval entry
    const [existingApproval] = await db.select().from(emailApprovals).where(eq(emailApprovals.email, user.email));
    if (!existingApproval) {
      const isAdminBootstrap = process.env.ADMIN_BOOTSTRAP_EMAIL && user.email.toLowerCase() === process.env.ADMIN_BOOTSTRAP_EMAIL.toLowerCase().trim();
      const autoApprove = await isFeatureEnabled('email.auto_approve_enabled', false) || isAdminBootstrap;
      const initialStatus = autoApprove ? 'approved' : 'pending';

      await db.insert(emailApprovals).values({
        email: user.email,
        userId: user.id,
        status: initialStatus,
        requestedAt: new Date(),
        approvedAt: autoApprove ? new Date() : null,
        approvedBy: adminUser.userId,
      });
    }

    // 4. Audit Log
    await db.insert(adminAuditLog).values({
      adminId: adminUser.userId,
      action: 'manually_verify_unverified_email',
      targetType: 'user',
      targetId: userId,
      metadata: { email: user.email },
    });

    return NextResponse.json({ success: true, message: `Successfully verified email for ${user.email}.` });
  }

  if (action === 'resend') {
    // Delete existing verification tokens
    await db.delete(emailVerifications).where(eq(emailVerifications.userId, userId));

    // Generate new OTP
    const otp = generateOtp();
    const tokenHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.insert(emailVerifications).values({
      userId: user.id,
      tokenHash,
      expiresAt,
      attempts: 0,
      lastSentAt: new Date(),
    });

    // Send email via Brevo
    const emailResult = await sendOtpVerificationEmail(user.email, otp);
    if (!emailResult.success) {
      console.error('[Admin Resend OTP Failed]', emailResult.error);
      return NextResponse.json({ error: 'Failed to send OTP email via provider.' }, { status: 500 });
    }

    // Audit Log
    await db.insert(adminAuditLog).values({
      adminId: adminUser.userId,
      action: 'resend_unverified_email_otp',
      targetType: 'user',
      targetId: userId,
      metadata: { email: user.email },
    });

    return NextResponse.json({ success: true, message: `Resent verification OTP code to ${user.email}.` });
  }

  return NextResponse.json({ error: 'Invalid action provided.' }, { status: 400 });
}

// DELETE: Delete unverified registration
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const userId = params.id;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    return NextResponse.json({ error: 'Unverified user not found.' }, { status: 404 });
  }

  if (user.emailVerified) {
    return NextResponse.json({ error: 'Cannot delete verified user from unverified view.' }, { status: 400 });
  }

  // Delete user (cascade removes emailVerifications)
  await db.delete(users).where(eq(users.id, userId));

  // Audit Log
  await db.insert(adminAuditLog).values({
    adminId: adminUser.userId,
    action: 'delete_unverified_signup',
    targetType: 'user',
    targetId: userId,
    metadata: { email: user.email },
  });

  return NextResponse.json({ success: true, message: `Deleted unverified signup for ${user.email}.` });
}
