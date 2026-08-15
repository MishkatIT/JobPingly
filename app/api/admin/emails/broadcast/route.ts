import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users, adminAuditLog } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { sendBrevoEmail } from '@/lib/email/brevo';
import { isFeatureEnabled } from '@/lib/flags/check';

/**
 * GET /api/admin/emails/broadcast
 * Returns the list of users with id, name, email, role, and emailVerified
 * so the admin dashboard UI can display the user exclusion checkboxes.
 */
export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const allUsers = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    emailVerified: users.emailVerified,
    createdAt: users.createdAt,
  })
  .from(users)
  .orderBy(desc(users.createdAt));

  return NextResponse.json({
    totalUsers: allUsers.length,
    users: allUsers,
  });
}

/**
 * POST /api/admin/emails/broadcast
 * Sends a broadcast update/announcement email to targeted users with exclusion support.
 */
export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const body = await req.json();
  const {
    subject,
    message,
    excludedUserIds = [],
    excludedEmails = [],
    selectedUserIds = [],
    onlyVerified = true,
    targetRole = 'all',
  } = body;

  if (!subject || !subject.trim()) {
    return NextResponse.json({ error: 'Email subject is required.' }, { status: 400 });
  }

  if (!message || !message.trim()) {
    return NextResponse.json({ error: 'Email message body is required.' }, { status: 400 });
  }

  // Check global email notifications feature flag
  const notificationsEnabled = await isFeatureEnabled('notifications.enabled', true);
  if (!notificationsEnabled) {
    return NextResponse.json({
      error: 'Email notifications are currently disabled via feature flag.',
    }, { status: 400 });
  }

  // Normalize excluded sets
  const excludedIdSet = new Set<string>((excludedUserIds || []).map((id: string) => String(id).trim()));
  const excludedEmailSet = new Set<string>((excludedEmails || []).map((e: string) => String(e).toLowerCase().trim()));
  const selectedIdSet = Array.isArray(selectedUserIds) && selectedUserIds.length > 0
    ? new Set<string>(selectedUserIds.map((id: string) => String(id).trim()))
    : null;

  // Fetch all users
  const allUsers = await db.select().from(users);

  // Filter target recipients
  const targetRecipients = allUsers.filter(u => {
    // 1. Role filter
    if (targetRole !== 'all' && u.role !== targetRole) return false;

    // 2. Verified filter
    if (onlyVerified && u.emailVerified === false) return false;

    // 3. Explicit selection filter (if provided)
    if (selectedIdSet && !selectedIdSet.has(u.id)) return false;

    // 4. Exclusion filters
    if (excludedIdSet.has(u.id)) return false;
    if (excludedEmailSet.has(u.email.toLowerCase())) return false;

    return true;
  });

  const excludedCount = allUsers.length - targetRecipients.length;

  if (targetRecipients.length === 0) {
    return NextResponse.json({
      error: 'No target users match the specified selection and exclusion criteria.',
      totalUsers: allUsers.length,
      excludedCount,
    }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://jobpingly.com';
  const cleanAppUrl = appUrl.replace(/\/$/, '');

  let sentCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  // Format HTML message linebreaks
  const formattedMessageHtml = message
    .trim()
    .split('\n\n')
    .map((paragraph: string) => `<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('');

  const plainTextMessage = `${message}\n\n---\nJobPingly Platform Announcement\n${cleanAppUrl}`;

  // Process email sending in series / small batches
  for (const recipient of targetRecipients) {
    const userName = recipient.name || recipient.email.split('@')[0];

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0; padding:0; background-color:#0b0f19; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#e2e8f0;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0b0f19; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="580" border="0" cellspacing="0" cellpadding="0" style="max-width:580px; background-color:#ffffff; border-radius:16px; border:1px solid #e2e8f0; padding:36px; box-shadow:0 10px 25px rgba(0,0,0,0.1);">
          <!-- Header / Logo -->
          <tr>
            <td align="center" style="padding-bottom:24px; border-bottom:1px solid #f1f5f9;">
              <div style="font-size:24px; font-weight:800; color:#0f172a;">
                Job<span style="color:#2563eb;">Pingly</span>
              </div>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding-top:24px; padding-bottom:12px;">
              <div style="font-size:16px; font-weight:600; color:#0f172a;">Hi ${userName},</div>
            </td>
          </tr>

          <!-- Message Body -->
          <tr>
            <td style="padding-bottom:24px;">
              ${formattedMessageHtml}
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <a href="${cleanAppUrl}/dashboard" style="background-color:#2563eb; color:#ffffff; font-weight:700; text-decoration:none; padding:12px 24px; border-radius:10px; font-size:14px; display:inline-block; box-shadow:0 4px 12px rgba(37,99,235,0.3);">
                Go to Dashboard &rarr;
              </a>
            </td>
          </tr>

          <hr style="border:none; border-top:1px solid #f1f5f9; margin:0 0 20px 0;">

          <!-- Footer -->
          <tr>
            <td align="center">
              <p style="margin:0; font-size:12px; color:#94a3b8; line-height:1.5;">
                You are receiving this official announcement as a registered user of JobPingly.<br>
                <a href="${cleanAppUrl}/dashboard/settings" style="color:#2563eb; text-decoration:underline;">Manage Preferences</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    try {
      const res = await sendBrevoEmail({
        toEmail: recipient.email,
        toName: userName,
        subject,
        htmlContent,
        textContent: plainTextMessage,
      });

      if (res.success) {
        sentCount++;
      } else {
        failedCount++;
        errors.push(`${recipient.email}: ${res.error || 'Failed to send'}`);
      }
    } catch (err: any) {
      failedCount++;
      errors.push(`${recipient.email}: ${err.message}`);
    }
  }

  // Record Admin Audit Log
  await db.insert(adminAuditLog).values({
    adminId: adminUser.userId,
    action: 'send_broadcast_email',
    targetType: 'users',
    metadata: {
      subject,
      totalUsers: allUsers.length,
      targetRecipientsCount: targetRecipients.length,
      sentCount,
      failedCount,
      excludedCount,
      excludedUserIds,
      excludedEmails,
    },
  });

  return NextResponse.json({
    success: true,
    message: `Broadcast email processed: ${sentCount} sent, ${failedCount} failed, ${excludedCount} excluded out of ${allUsers.length} total users.`,
    stats: {
      totalUsers: allUsers.length,
      targetCount: targetRecipients.length,
      sentCount,
      failedCount,
      excludedCount,
    },
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  });
}
