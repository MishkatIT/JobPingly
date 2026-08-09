interface SendEmailOptions {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

/**
 * Sends a transactional email using the Brevo REST API v3 (POST https://api.brevo.com/v3/smtp/email).
 */
export async function sendBrevoEmail(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.SENDER_EMAIL || process.env.EMAIL_FROM || 'notifications@jobpingly.com';
  const senderName = process.env.SENDER_NAME || 'JobPingly';

  if (!apiKey) {
    console.warn('[Brevo Email Service] BREVO_API_KEY is missing in environment variables.');
    return { success: false, error: 'Brevo API key is not configured' };
  }

  const payload = {
    sender: {
      name: senderName,
      email: senderEmail,
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
      return {
        success: false,
        error: data.message || `Brevo request failed with status ${res.status}`,
      };
    }

    return {
      success: true,
      messageId: data.messageId,
    };
  } catch (err: any) {
    console.error('[Brevo Email Exception]', err);
    return {
      success: false,
      error: err.message || 'Network error occurred while connecting to Brevo',
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
<body style="margin:0; padding:0; background-color:#0b0f19; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#e2e8f0;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0b0f19; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="500" border="0" cellspacing="0" cellpadding="0" style="max-width:500px; background-color:#1e293b; border-radius:16px; border:1px solid #334155; padding:32px; box-shadow:0 10px 25px rgba(0,0,0,0.5);">
          <!-- Header / Logo -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <div style="font-size:24px; font-weight:800; color:#ffffff; tracking:tight;">
                Job<span style="color:#2563eb;">Pingly</span>
              </div>
            </td>
          </tr>
          
          <!-- Title -->
          <tr>
            <td align="center" style="padding-bottom:12px;">
              <h1 style="margin:0; font-size:20px; font-weight:700; color:#ffffff;">Verify your email address</h1>
            </td>
          </tr>
          
          <!-- Body Text -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <p style="margin:0; font-size:14px; color:#94a3b8; line-height:1.5;">
                Thank you for joining JobPingly. Please enter the 6-digit verification code below to complete your registration.
              </p>
            </td>
          </tr>
          
          <!-- Code Box -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <div style="background-color:#0f172a; border:1px solid #3b82f6; border-radius:12px; padding:16px 24px; display:inline-block;">
                <span style="font-family:'Courier New', monospace; font-size:32px; font-weight:700; letter-spacing:8px; color:#3b82f6;">${otpCode}</span>
              </div>
            </td>
          </tr>
          
          <!-- Expiration Notice -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <p style="margin:0; font-size:13px; color:#64748b;">
                This verification code expires in <strong>10 minutes</strong>.
              </p>
            </td>
          </tr>
          
          <hr style="border:none; border-top:1px solid #334155; margin:0 0 20px 0;">
          
          <!-- Footer -->
          <tr>
            <td align="center">
              <p style="margin:0; font-size:12px; color:#64748b;">
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
  const hostUrl = options.baseUrl || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
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
<body style="margin:0; padding:0; background-color:#0b0f19; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#e2e8f0;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0b0f19; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="560" border="0" cellspacing="0" cellpadding="0" style="max-width:560px; background-color:#1e293b; border-radius:16px; border:1px solid #334155; padding:32px; box-shadow:0 10px 25px rgba(0,0,0,0.5);">
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <div style="font-size:24px; font-weight:800; color:#ffffff;">
                Job<span style="color:#2563eb;">Pingly</span>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:12px;">
              <h1 style="margin:0; font-size:20px; font-weight:700; color:#ffffff;">Watch List Collaboration Invitation</h1>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <p style="margin:0; font-size:14px; color:#94a3b8; line-height:1.5;">
                <strong style="color:#ffffff;">${options.inviterName}</strong> has invited you as a <strong style="color:#3b82f6; text-transform:uppercase;">${options.role}</strong> to collaborate on the watch list <strong style="color:#ffffff;">"${options.listName}"</strong>.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <table border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding:4px;">
                    <a href="${acceptUrl}" style="background-color:#2563eb; color:#ffffff; font-weight:700; text-decoration:none; padding:12px 20px; border-radius:10px; font-size:13px; display:inline-block; box-shadow:0 4px 12px rgba(37,99,235,0.4);">
                      Accept Invitation &amp; Join List &rarr;
                    </a>
                  </td>
                  <td align="center" style="padding:4px;">
                    <a href="${browseUrl}" style="background-color:#334155; color:#cbd5e1; font-weight:600; text-decoration:none; padding:12px 20px; border-radius:10px; font-size:13px; display:inline-block; border:1px solid #475569;">
                      Browse Watch List &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <hr style="border:none; border-top:1px solid #334155; margin:0 0 20px 0;">
          <tr>
            <td align="center">
              <p style="margin:0; font-size:12px; color:#64748b;">
                You can accept the invitation to co-manage career pages or browse public lists anytime on JobPingly.
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
  });
}
