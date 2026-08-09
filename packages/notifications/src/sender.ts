import { sendBrevoEmail } from '@/lib/email/brevo';
import { isFeatureEnabled } from '@/lib/flags/check';
import { db } from '@/lib/db/client';
import { emailApprovals } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function sendEmailDigest(toEmail: string, userName: string, jobListings: { companyName: string; title: string; url?: string }[]) {
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

  const jobsHtml = jobListings.map(j => `
    <div style="margin-bottom: 12px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <div style="font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 600;">${j.companyName}</div>
      <a href="${j.url || '#'}" style="font-size: 16px; font-weight: bold; color: #0270c7; text-decoration: none;">${j.title}</a>
    </div>
  `).join('');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
      <h2 style="color: #0c406e;">JobPingly Daily Digest</h2>
      <p>Hi ${userName},</p>
      <p>Here are ${jobListings.length} new job openings matching your watch list preferences today:</p>
      ${jobsHtml}
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 12px; color: #94a3b8;">You are receiving this digest from your JobPingly active subscriptions. <a href="${process.env.NEXT_PUBLIC_APP_URL || ''}/dashboard/settings">Manage Preferences</a></p>
    </div>
  `;

  const textContent = `JobPingly Daily Digest\n\nHi ${userName},\n\nHere are ${jobListings.length} new job openings matching your watch list preferences today:\n\n` +
    jobListings.map(j => `- [${j.companyName}] ${j.title}: ${j.url || ''}`).join('\n') +
    `\n\nManage Preferences: ${process.env.NEXT_PUBLIC_APP_URL || ''}/dashboard/settings`;

  return sendBrevoEmail({
    toEmail,
    toName: userName,
    subject: `[JobPingly] ${jobListings.length} New Job Openings Found Today`,
    htmlContent: html,
    textContent,
  });
}
