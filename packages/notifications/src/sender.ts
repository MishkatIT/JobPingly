import { sendBrevoEmail } from '@/lib/email/brevo';
import { isFeatureEnabled } from '@/lib/flags/check';
import { db } from '@/lib/db/client';
import { emailApprovals } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export interface SendEmailDigestResult {
  success: boolean;
  messageId?: string;
  error?: string;
  disabled?: boolean;
  unapproved?: boolean;
  mocked?: boolean;
}

export async function sendEmailDigest(toEmail: string, userName: string, jobListings: { companyName: string; title: string; url?: string }[]): Promise<SendEmailDigestResult> {
  // 1. Check feature flag
  const notificationsEnabled = await isFeatureEnabled('notifications.enabled', true);
  if (!notificationsEnabled) {
    console.log('[Email Notifier] Email notifications are disabled via feature flag.');
    return { success: false, disabled: true, error: 'Email notifications are currently disabled by administrator.' };
  }

  // 2. Check admin approval status for target email
  const cleanEmail = toEmail.toLowerCase().trim();
  const [approvalRecord] = await db.select().from(emailApprovals).where(eq(emailApprovals.email, cleanEmail));

  if (!approvalRecord || approvalRecord.status !== 'approved') {
    const statusStr = approvalRecord ? approvalRecord.status : 'not_requested';
    console.log(`[Email Notifier] Email '${toEmail}' is not approved by admin (status: ${statusStr}). Skipping email delivery.`);
    return { success: false, unapproved: true, error: `Email address is ${statusStr} for admin approval.` };
  }

  if (!process.env.BREVO_API_KEY) {
    console.log(`[Brevo Dev Fallback] Sending Digest to ${toEmail} with ${jobListings.length} jobs (BREVO_API_KEY is missing).`);
    return { success: true, mocked: true };
  }

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://jobpingly.onrender.com').replace(/\/$/, '');

  const MAX_DISPLAY_JOBS = 30;
  const displayedJobs = jobListings.slice(0, MAX_DISPLAY_JOBS);
  const remainingCount = jobListings.length - displayedJobs.length;

  const jobsHtml = displayedJobs.map(j => `
    <div style="margin-bottom:10px; padding:12px 16px; background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">
      <div style="margin-bottom:4px;">
        <span style="font-size:11px; text-transform:uppercase; color:#3730a3; background-color:#e0e7ff; padding:2px 8px; border-radius:6px; font-weight:700; display:inline-block;">${j.companyName}</span>
      </div>
      <a href="${j.url || '#'}" target="_blank" style="font-size:14px; font-weight:700; color:#2563eb; text-decoration:none; display:inline-block;">${j.title} &rarr;</a>
    </div>
  `).join('');

  const overflowHtml = remainingCount > 0 ? `
    <div style="margin-top:16px; padding:16px; background-color:#eff6ff; border:1.5px dashed #93c5fd; border-radius:12px; text-align:center;">
      <p style="margin:0 0 10px 0; font-size:14px; font-weight:700; color:#1e40af;">
        + ${remainingCount} more new job openings on your watch lists
      </p>
      <a href="${baseUrl}/dashboard" style="background-color:#2563eb; color:#ffffff; font-weight:700; text-decoration:none; padding:10px 20px; border-radius:8px; font-size:13px; display:inline-block; box-shadow:0 3px 10px rgba(37,99,235,0.25);">
        View All ${jobListings.length} Jobs on Dashboard &rarr;
      </a>
    </div>
  ` : '';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JobPingly Daily Digest</title>
</head>
<body style="margin:0; padding:0; background-color:#f8fafc; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#334155;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8fafc; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="580" border="0" cellspacing="0" cellpadding="0" style="max-width:580px; background-color:#ffffff; border-radius:16px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 10px 30px rgba(15,23,42,0.06);">
          <!-- Header / Logo -->
          <tr>
            <td align="center" style="padding:32px 32px 20px 32px; border-bottom:1px solid #f1f5f9;">
              <div style="font-size:26px; font-weight:800; color:#0f172a; letter-spacing:-0.5px;">
                Job<span style="color:#2563eb;">Pingly</span>
              </div>
            </td>
          </tr>

          <!-- Content Padding -->
          <tr>
            <td style="padding:32px;">
              <div style="font-size:16px; font-weight:700; color:#0f172a; margin-bottom:8px;">Hi ${userName},</div>
              <p style="margin:0 0 20px 0; font-size:14px; color:#475569; line-height:1.6;">
                Here are <strong>${jobListings.length}</strong> new job openings matching your watch list preferences today:
              </p>

              <div style="margin-bottom:28px;">
                ${jobsHtml}
                ${overflowHtml}
              </div>

              <!-- CTA Button -->
              <div style="text-align:center; margin-bottom:28px;">
                <a href="${baseUrl}/dashboard" style="background-color:#2563eb; color:#ffffff; font-weight:700; text-decoration:none; padding:14px 32px; border-radius:12px; font-size:14px; display:inline-block; box-shadow:0 4px 14px rgba(37,99,235,0.3);">
                  Open JobPingly Dashboard &rarr;
                </a>
              </div>

              <hr style="border:none; border-top:1px solid #f1f5f9; margin:0 0 24px 0;">

              <!-- Footer -->
              <p style="margin:0; font-size:12px; color:#94a3b8; text-align:center; line-height:1.5;">
                You are receiving this digest from your JobPingly active subscriptions.<br>
                <a href="${baseUrl}/dashboard/settings" style="color:#2563eb; text-decoration:underline;">Manage Notification Preferences</a>
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

  const textContent = `JobPingly Daily Digest\n\nHi ${userName},\n\nHere are ${jobListings.length} new job openings matching your watch list preferences today:\n\n` +
    jobListings.map(j => `- [${j.companyName}] ${j.title}: ${j.url || ''}`).join('\n') +
    `\n\nManage Preferences: ${baseUrl}/dashboard/settings`;

  return sendBrevoEmail({
    toEmail,
    toName: userName,
    subject: `[JobPingly] ${jobListings.length} New Job Openings Found Today`,
    htmlContent: html,
    textContent,
    templateType: 'digest',
  });
}
