import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { sendBrevoEmail, sendOtpVerificationEmail } from '@/lib/email/brevo';
import { sendEmailDigest } from '@/packages/notifications/src/sender';
import { db } from '@/lib/db/client';
import { adminAuditLog } from '@/lib/db/schema';

export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { toEmail, template = 'otp', customSubject, customMessage } = body;

    if (!toEmail || typeof toEmail !== 'string' || !toEmail.includes('@')) {
      return NextResponse.json({ error: 'Valid recipient email address is required.' }, { status: 400 });
    }

    const cleanEmail = toEmail.toLowerCase().trim();
    let result: { success: boolean; messageId?: string; error?: string; mocked?: boolean } = { success: false };

    if (template === 'otp') {
      // 1. Send OTP Verification Code Email
      const testOtp = Math.floor(100000 + Math.random() * 900000).toString();
      result = await sendOtpVerificationEmail(cleanEmail, testOtp);
    } else if (template === 'digest') {
      // 2. Send Sample Job Digest Email
      const mockJobs = [
        { companyName: 'Google', title: 'Senior Software Engineer, Full Stack', url: 'https://careers.google.com' },
        { companyName: 'Stripe', title: 'Staff Systems Architect', url: 'https://stripe.com/jobs' },
        { companyName: 'Vercel', title: 'Principal Platform Engineer', url: 'https://vercel.com/careers' },
      ];
      result = await sendEmailDigest(cleanEmail, cleanEmail.split('@')[0], mockJobs);
    } else if (template === 'custom') {
      // 3. Send Custom Test Email
      const subject = customSubject?.trim() || 'JobPingly Admin Test Email';
      const messageText = customMessage?.trim() || 'This is a custom test email sent from the JobPingly Admin Panel.';
      
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="margin:0; padding:0; background-color:#0b0f19; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:#e2e8f0;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0b0f19; padding:40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" max-width="550" border="0" cellspacing="0" cellpadding="0" style="max-width:550px; background-color:#1e293b; border-radius:16px; border:1px solid #334155; padding:32px;">
                  <tr>
                    <td style="padding-bottom:16px;">
                      <div style="font-size:22px; font-weight:800; color:#ffffff;">Job<span style="color:#2563eb;">Pingly</span> Admin Test</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom:20px; line-height:1.6; font-size:15px; color:#cbd5e1;">
                      ${messageText.replace(/\n/g, '<br/>')}
                    </td>
                  </tr>
                  <tr>
                    <td style="border-top:1px solid #334155; padding-top:16px; font-size:12px; color:#64748b;">
                      Sent via Brevo Email Service by Admin (${adminUser.email})
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `.trim();

      result = await sendBrevoEmail({
        toEmail: cleanEmail,
        subject,
        htmlContent,
        textContent: `${subject}\n\n${messageText}\n\nSent via Brevo by Admin`,
      });
    } else {
      return NextResponse.json({ error: 'Invalid template type specified.' }, { status: 400 });
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to dispatch test email via Brevo.' }, { status: 500 });
    }

    // Log in admin audit trail
    await db.insert(adminAuditLog).values({
      adminId: adminUser.userId,
      action: 'send_test_email',
      targetType: 'email_test',
      targetId: cleanEmail,
      metadata: { toEmail: cleanEmail, template, messageId: result.messageId },
    });

    return NextResponse.json({
      success: true,
      message: `Test email (${template}) successfully dispatched to ${cleanEmail}`,
      messageId: result.messageId,
      mocked: result.mocked,
    });
  } catch (err: any) {
    console.error('[Admin Test Email Error]', err);
    return NextResponse.json({ error: err.message || 'Internal server error while sending test email.' }, { status: 500 });
  }
}
