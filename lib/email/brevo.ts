import { db, client } from '@/lib/db/client';
import { sentEmailLogs } from '@/lib/db/schema';

export interface SendEmailOptions {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  templateType?: string;
  senderId?: string;
  senderEmail?: string;
  metadata?: any;
}

let tableChecked = false;
async function ensureSentEmailLogsTable() {
  if (tableChecked) return;
  try {
    await client`
      CREATE TABLE IF NOT EXISTS sent_email_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        recipient_email TEXT NOT NULL,
        sender_email TEXT,
        subject TEXT NOT NULL,
        template_type TEXT NOT NULL DEFAULT 'general',
        status TEXT NOT NULL DEFAULT 'sent',
        error_message TEXT,
        html_content TEXT,
        sender_id UUID,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await client`
      ALTER TABLE sent_email_logs ADD COLUMN IF NOT EXISTS html_content TEXT;
      ALTER TABLE sent_email_logs ADD COLUMN IF NOT EXISTS sender_email TEXT;
    `;
    tableChecked = true;
  } catch (err: any) {
    console.error('[EnsureSentEmailLogsTable Error]', err.message);
  }
}

export async function recordSentEmailLog(log: {
  recipientEmail: string;
  senderEmail?: string;
  subject: string;
  templateType?: string;
  status: 'sent' | 'failed';
  errorMessage?: string;
  htmlContent?: string;
  senderId?: string;
  metadata?: any;
}) {
  await ensureSentEmailLogsTable();
  try {
    const template = log.templateType || 'general';
    // Admin-dispatched emails ('broadcast', 'test', 'admin_custom') store full HTML body & Admin sender.
    // Automated system emails ('otp', 'digest', 'invite', 'reset') track count & status without storing heavy HTML body.
    const isAdminDispatched = ['broadcast', 'test', 'admin_custom'].includes(template);
    const fromEmail = log.senderEmail || (isAdminDispatched ? 'admin@jobpingly.com' : (process.env.SENDER_EMAIL || process.env.EMAIL_FROM || 'notifications@jobpingly.com'));

    // Validate UUID format for senderId to prevent Postgres UUID syntax errors
    let validSenderId: string | null = null;
    if (log.senderId && typeof log.senderId === 'string' && /^[0-9a-fA-F-]{36}$/.test(log.senderId.trim())) {
      validSenderId = log.senderId.trim();
    }

    await db.insert(sentEmailLogs).values({
      recipientEmail: log.recipientEmail.toLowerCase().trim(),
      senderEmail: fromEmail,
      subject: log.subject,
      templateType: template,
      status: log.status,
      errorMessage: log.errorMessage || null,
      htmlContent: isAdminDispatched ? (log.htmlContent || null) : null,
      senderId: validSenderId,
      metadata: log.metadata || {},
      createdAt: new Date(),
    });
  } catch (err: any) {
    console.error('[SentEmailLogs DB Insert Error]', err.message);
  }
}

/**
 * Sends a transactional email using the Brevo REST API v3 (POST https://api.brevo.com/v3/smtp/email).
 */
export async function sendBrevoEmail(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  // Always use verified Brevo sender address for SMTP API payload
  const brevoSenderEmail = process.env.SENDER_EMAIL || process.env.EMAIL_FROM || 'notifications@jobpingly.com';
  const brevoSenderName = process.env.SENDER_NAME || 'JobPingly';
  
  // Track admin/display sender for sent email audit logs
  const logSenderEmail = options.senderEmail || brevoSenderEmail;

  if (!apiKey) {
    console.warn('[Brevo Email Service] BREVO_API_KEY is missing in environment variables.');
    await recordSentEmailLog({
      recipientEmail: options.toEmail,
      senderEmail: logSenderEmail,
      subject: options.subject,
      templateType: options.templateType,
      status: 'failed',
      errorMessage: 'Brevo API key is not configured in environment variables',
      htmlContent: options.htmlContent,
      senderId: options.senderId,
    });
    return { success: false, error: 'Brevo API key is not configured' };
  }

  const payload = {
    sender: {
      name: brevoSenderName,
      email: brevoSenderEmail,
    },
    to: [
      {
        email: options.toEmail,
        name: options.toName || options.toEmail.split('@')[0],
      },
    ],
    subject: options.subject,
    htmlContent: options.htmlContent,
    textContent: options.textContent,
  };

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('[Brevo Email Error]', res.status, data);
      const errMsg = data.message || `Brevo request failed with status ${res.status}`;
      await recordSentEmailLog({
        recipientEmail: options.toEmail,
        senderEmail: logSenderEmail,
        subject: options.subject,
        templateType: options.templateType,
        status: 'failed',
        errorMessage: errMsg,
        htmlContent: options.htmlContent,
        senderId: options.senderId,
      });
      return {
        success: false,
        error: errMsg,
      };
    }

    await recordSentEmailLog({
      recipientEmail: options.toEmail,
      senderEmail: logSenderEmail,
      subject: options.subject,
      templateType: options.templateType,
      status: 'sent',
      htmlContent: options.htmlContent,
      senderId: options.senderId,
      metadata: { messageId: data.messageId, ...(options.metadata || {}) },
    });

    return {
      success: true,
      messageId: data.messageId,
    };
  } catch (err: any) {
    console.error('[Brevo Email Exception]', err);
    const errMsg = err.message || 'Network error occurred while connecting to Brevo';
    await recordSentEmailLog({
      recipientEmail: options.toEmail,
      senderEmail: logSenderEmail,
      subject: options.subject,
      templateType: options.templateType,
      status: 'failed',
      errorMessage: errMsg,
      htmlContent: options.htmlContent,
      senderId: options.senderId,
    });
    return {
      success: false,
      error: errMsg,
    };
  }
}

/**
 * Sends a 6-digit OTP verification email via Brevo.
 */
export async function sendOtpVerificationEmail(toEmail: string, otpCode: string): Promise<{ success: boolean; error?: string }> {
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email</title>
</head>
<body style="margin:0; padding:0; background-color:#f8fafc; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#334155;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8fafc; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="500" border="0" cellspacing="0" cellpadding="0" style="max-width:500px; background-color:#ffffff; border-radius:16px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 10px 30px rgba(15,23,42,0.06);">
          <!-- Header / Logo -->
          <tr>
            <td align="center" style="padding:32px 32px 20px 32px; border-bottom:1px solid #f1f5f9;">
              <div style="font-size:26px; font-weight:800; color:#0f172a; letter-spacing:-0.5px;">
                Job<span style="color:#2563eb;">Pingly</span>
              </div>
            </td>
          </tr>
          
          <!-- Content Padding Area -->
          <tr>
            <td style="padding:32px;">
              <!-- Title -->
              <h1 style="margin:0 0 12px 0; font-size:20px; font-weight:700; color:#0f172a; text-align:center;">Verify your email address</h1>
              
              <!-- Body Text -->
              <p style="margin:0 0 24px 0; font-size:14px; color:#475569; line-height:1.6; text-align:center;">
                Thank you for joining JobPingly. Please enter the 6-digit verification code below to activate your account and access all features.
              </p>
              
              <!-- Code Box -->
              <div style="text-align:center; margin-bottom:24px;">
                <div style="background-color:#f0f9ff; border:1.5px solid #3b82f6; border-radius:14px; padding:18px 28px; display:inline-block; box-shadow:0 4px 12px rgba(59,130,246,0.15);">
                  <span style="font-family:'Courier New', Courier, monospace; font-size:34px; font-weight:800; letter-spacing:10px; color:#1d4ed8;">${otpCode}</span>
                </div>
              </div>
              
              <!-- Expiration Notice -->
              <p style="margin:0 0 24px 0; font-size:13px; color:#64748b; text-align:center;">
                This verification code will expire in <strong>10 minutes</strong>.
              </p>
              
              <hr style="border:none; border-top:1px solid #f1f5f9; margin:0 0 24px 0;">
              
              <!-- Footer -->
              <p style="margin:0; font-size:12px; color:#94a3b8; text-align:center; line-height:1.5;">
                If you didn't create a JobPingly account, you can safely ignore this email.
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

  const textContent = `JobPingly\n\nVerify your email\n\nYour verification code is: ${otpCode}\n\nThis code expires in 10 minutes.\n\nIf you didn't create a JobPingly account, you can safely ignore this email.`;

  return sendBrevoEmail({
    toEmail,
    subject: 'JobPingly - Email Verification Code',
    htmlContent,
    textContent,
    templateType: 'otp',
  });
}

/**
 * Sends a collaborator invitation email via Brevo when added to a watch list.
 */
export async function sendCollaboratorInviteEmail(options: {
  toEmail: string;
  toName?: string;
  inviterName: string;
  listName: string;
  listId: string;
  listSlug?: string;
  role: string;
  inviteToken: string;
  baseUrl?: string;
}): Promise<{ success: boolean; error?: string }> {
  const hostUrl = options.baseUrl || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://jobpingly.onrender.com';
  const cleanHost = hostUrl.replace(/\/$/, '');
  const acceptUrl = `${cleanHost}/api/collaborators/accept?token=${options.inviteToken}`;
  const browseUrl = options.listSlug ? `${cleanHost}/lists/${options.listSlug}` : `${cleanHost}/discover`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Watch List Collaborator Invitation</title>
</head>
<body style="margin:0; padding:0; background-color:#f8fafc; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#334155;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8fafc; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="560" border="0" cellspacing="0" cellpadding="0" style="max-width:560px; background-color:#ffffff; border-radius:16px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 10px 30px rgba(15,23,42,0.06);">
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
              <h1 style="margin:0 0 16px 0; font-size:20px; font-weight:700; color:#0f172a; text-align:center;">Watch List Collaboration Invitation</h1>

              <p style="margin:0 0 24px 0; font-size:15px; color:#475569; line-height:1.6; text-align:center;">
                <strong style="color:#0f172a;">${options.inviterName}</strong> has invited you as a <strong style="color:#2563eb; text-transform:uppercase;">${options.role}</strong> to co-manage the watch list <strong style="color:#0f172a;">"${options.listName}"</strong>.
              </p>

              <!-- Action Buttons -->
              <div style="text-align:center; margin-bottom:28px;">
                <a href="${acceptUrl}" style="background-color:#2563eb; color:#ffffff; font-weight:700; text-decoration:none; padding:14px 28px; border-radius:12px; font-size:14px; display:inline-block; box-shadow:0 4px 14px rgba(37,99,235,0.3); margin-right:8px; margin-bottom:8px;">
                  Accept Invitation &amp; Join List &rarr;
                </a>
                <a href="${browseUrl}" style="background-color:#f1f5f9; color:#475569; font-weight:600; text-decoration:none; padding:14px 24px; border-radius:12px; font-size:14px; display:inline-block; border:1px solid #cbd5e1; margin-bottom:8px;">
                  Browse Watch List &rarr;
                </a>
              </div>

              <hr style="border:none; border-top:1px solid #f1f5f9; margin:0 0 24px 0;">

              <p style="margin:0; font-size:12px; color:#94a3b8; text-align:center; line-height:1.5;">
                You can accept invitations to co-manage career pages or browse public watch lists anytime on JobPingly.
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

  const textContent = `JobPingly\n\n${options.inviterName} invited you as a ${options.role} to collaborate on watch list "${options.listName}".\n\nAccept invitation: ${acceptUrl}\nBrowse watch list: ${browseUrl}`;

  return sendBrevoEmail({
    toEmail: options.toEmail,
    toName: options.toName,
    subject: `Action Required: Collaboration Invitation for "${options.listName}"`,
    htmlContent,
    textContent,
    templateType: 'invite',
  });
}

/**
 * Sends a password reset link email via Brevo.
 */
export async function sendPasswordResetEmail(toEmail: string, resetUrl: string, userName?: string): Promise<{ success: boolean; error?: string }> {
  const displayName = userName || toEmail.split('@')[0];

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password</title>
</head>
<body style="margin:0; padding:0; background-color:#f8fafc; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#334155;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8fafc; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="500" border="0" cellspacing="0" cellpadding="0" style="max-width:500px; background-color:#ffffff; border-radius:16px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 10px 30px rgba(15,23,42,0.06);">
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
              <h1 style="margin:0 0 12px 0; font-size:20px; font-weight:700; color:#0f172a; text-align:center;">Reset Your Password</h1>
              
              <p style="margin:0 0 24px 0; font-size:14px; color:#475569; line-height:1.6; text-align:center;">
                Hello <strong>${displayName}</strong>, we received a request to reset your password for your JobPingly account. Click the button below to set a new password.
              </p>
              
              <!-- CTA Button -->
              <div style="text-align:center; margin-bottom:24px;">
                <a href="${resetUrl}" style="background-color:#2563eb; color:#ffffff; font-weight:700; text-decoration:none; padding:14px 32px; border-radius:12px; font-size:14px; display:inline-block; box-shadow:0 4px 14px rgba(37,99,235,0.3);">
                  Reset Password &rarr;
                </a>
              </div>
              
              <p style="margin:0 0 24px 0; font-size:13px; color:#64748b; text-align:center;">
                This password reset link will expire in <strong>1 hour</strong>.
              </p>
              
              <hr style="border:none; border-top:1px solid #f1f5f9; margin:0 0 24px 0;">
              
              <p style="margin:0; font-size:12px; color:#94a3b8; text-align:center; line-height:1.5;">
                If you didn't request a password reset, please ignore this email or contact support if you have concerns.
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

  const textContent = `JobPingly\n\nReset Your Password\n\nHello ${displayName},\n\nWe received a request to reset your password. Use the link below to set a new password:\n\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, you can safely ignore this email.`;

  return sendBrevoEmail({
    toEmail,
    subject: 'JobPingly - Password Reset Request',
    htmlContent,
    textContent,
    templateType: 'reset',
  });
}

