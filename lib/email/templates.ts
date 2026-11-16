import { env } from '@/lib/env';
import { escapeHtml, safeUrl } from '@/lib/security/html';
import { pluralize } from '@/lib/utils/pluralize';

/**
 * Email templates.
 *
 * Rule: every interpolated value goes through `escapeHtml` (text) or
 * `safeUrl` (links). Names come from sign-up forms and job titles, company
 * names and URLs come from scraped pages, so all of it is untrusted.
 *
 * Styling is inline and table-based because that is what email clients
 * render reliably. The palette mirrors the web app: ink text, hairline
 * borders, one accent colour.
 */

const INK = '#0f1115';
const MUTED = '#5b6270';
const SUBTLE = '#8a909c';
const BORDER = '#e6e8ec';
const SURFACE = '#f6f7f9';
const ACCENT = '#2457f5';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function button(label: string, href: string): string {
  return `<a href="${safeUrl(href)}" style="display:inline-block;background:${INK};color:#ffffff;font-weight:600;font-size:14px;line-height:1;text-decoration:none;padding:12px 20px;border-radius:8px;">${escapeHtml(label)}</a>`;
}

function layout(options: { preheader: string; heading: string; body: string; footer?: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(options.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${SURFACE};font-family:${FONT};color:${INK};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${SURFACE};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;">
<tr><td style="padding:24px 32px 0 32px;">
<div style="font-size:16px;font-weight:700;letter-spacing:-0.2px;color:${INK};">JobPingly</div>
</td></tr>
<tr><td style="padding:20px 32px 28px 32px;">
<h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;font-weight:650;letter-spacing:-0.3px;color:${INK};">${escapeHtml(options.heading)}</h1>
${options.body}
</td></tr>
<tr><td style="padding:16px 32px 24px 32px;border-top:1px solid ${BORDER};font-size:12px;line-height:1.6;color:${SUBTLE};">
${options.footer ?? `You are receiving this because you have a JobPingly account.`}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const paragraph = (html: string) => `<p style="margin:0 0 16px 0;font-size:14px;line-height:1.65;color:${MUTED};">${html}</p>`;

function greeting(name?: string | null): string {
  const clean = (name ?? '').trim();
  return clean ? `Hi ${escapeHtml(clean.split(/\s+/)[0])},` : 'Hi,';
}

// ---------------------------------------------------------------------------

export function otpEmail(code: string): RenderedEmail {
  const safeCode = escapeHtml(code);
  return {
    // The code is deliberately not in the subject: subjects are kept in the
    // delivery log, and a verification code must never be stored.
    subject: 'Your JobPingly verification code',
    html: layout({
      preheader: `Your verification code is ${code}. It expires in 10 minutes.`,
      heading: 'Confirm your email address',
      body:
        paragraph('Enter this code to finish creating your JobPingly account. It expires in 10 minutes.') +
        `<div style="margin:0 0 20px 0;padding:18px;background:${SURFACE};border:1px solid ${BORDER};border-radius:10px;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:8px;color:${INK};">${safeCode}</div>` +
        paragraph('If you did not request this, you can ignore this email. Nobody can use your address without this code.'),
      footer: 'This is an automated security message from JobPingly.',
    }),
    text: `Your JobPingly verification code is ${code}. It expires in 10 minutes.\n\nIf you did not request this, ignore this email.`,
  };
}

export function accountExistsEmail(name?: string | null): RenderedEmail {
  const loginUrl = `${env.appUrl}/login`;
  const resetUrl = `${env.appUrl}/forgot-password`;
  return {
    subject: 'Someone tried to create a JobPingly account with your email',
    html: layout({
      preheader: 'You already have an account. Sign in or reset your password.',
      heading: 'You already have an account',
      body:
        paragraph(`${greeting(name)} someone just tried to sign up for JobPingly with this email address. You already have an account, so nothing was changed.`) +
        `<div style="margin:0 0 16px 0;">${button('Sign in', loginUrl)}</div>` +
        paragraph(`Forgot your password? <a href="${safeUrl(resetUrl)}" style="color:${ACCENT};">Reset it here</a>. If this was not you, you can ignore this email.`),
      footer: 'This is an automated security message from JobPingly.',
    }),
    text: `Someone tried to sign up for JobPingly with this email address. You already have an account, so nothing was changed.

Sign in: ${loginUrl}
Reset your password: ${resetUrl}`,
  };
}

export function passwordResetEmail(resetUrl: string, name?: string | null): RenderedEmail {
  return {
    subject: 'Reset your JobPingly password',
    html: layout({
      preheader: 'Use this link to choose a new password. It expires in 1 hour.',
      heading: 'Reset your password',
      body:
        paragraph(`${greeting(name)} we received a request to reset the password for your account. This link works once and expires in 1 hour.`) +
        `<div style="margin:0 0 20px 0;">${button('Choose a new password', resetUrl)}</div>` +
        paragraph('If you did not ask for this, ignore this email and your password will stay the same.'),
      footer: 'This is an automated security message from JobPingly.',
    }),
    text: `Reset your JobPingly password using this link (valid for 1 hour):\n${resetUrl}\n\nIf you did not ask for this, ignore this email.`,
  };
}

export function passwordChangedEmail(name?: string | null): RenderedEmail {
  return {
    subject: 'Your JobPingly password was changed',
    html: layout({
      preheader: 'Your password was just changed.',
      heading: 'Your password was changed',
      body:
        paragraph(`${greeting(name)} the password for your JobPingly account was just changed and all other devices were signed out.`) +
        paragraph('If this was not you, reset your password immediately from the sign-in page and contact support.'),
      footer: 'This is an automated security message from JobPingly.',
    }),
    text: 'The password for your JobPingly account was just changed and all other devices were signed out. If this was not you, reset your password immediately.',
  };
}

export function welcomeEmail(name?: string | null): RenderedEmail {
  const dashboard = `${env.appUrl}/dashboard`;
  return {
    subject: 'Your JobPingly alerts are active',
    html: layout({
      preheader: 'Add the companies you care about and we will watch their careers pages for you.',
      heading: 'Your job alerts are active',
      body:
        paragraph(`${greeting(name)} your email address is approved, so JobPingly can now send you alerts.`) +
        paragraph('Add the companies you want to work for to a watchlist. We check their careers pages around the clock and email you when a role that matches your keywords is posted.') +
        `<div style="margin:0 0 4px 0;">${button('Open your dashboard', dashboard)}</div>`,
    }),
    text: `Your email address is approved and your JobPingly alerts are active.\n\nOpen your dashboard: ${dashboard}`,
  };
}

export function inviteEmail(options: { inviterName: string; listName: string; role: string; acceptUrl: string }): RenderedEmail {
  return {
    subject: `${options.inviterName} invited you to collaborate on "${options.listName}"`,
    html: layout({
      preheader: `You have been invited to help maintain the watchlist "${options.listName}".`,
      heading: 'You have been invited to a watchlist',
      body:
        paragraph(`<strong style="color:${INK};">${escapeHtml(options.inviterName)}</strong> invited you to help maintain the watchlist <strong style="color:${INK};">${escapeHtml(options.listName)}</strong> as ${escapeHtml(options.role === 'moderator' ? 'a moderator' : 'an editor')}.`) +
        `<div style="margin:0 0 20px 0;">${button('Review the invitation', options.acceptUrl)}</div>` +
        paragraph('You will be asked to sign in before accepting. If you were not expecting this, you can ignore it.'),
    }),
    text: `${options.inviterName} invited you to help maintain the watchlist "${options.listName}".\n\nReview the invitation: ${options.acceptUrl}`,
  };
}

export interface DigestJob {
  title: string;
  companyName: string;
  url?: string | null;
  location?: string | null;
  /** Why this job was sent, e.g. `"react" in the title`. */
  reason?: string | null;
  jobId?: string;
}

const MAX_DIGEST_JOBS = 30;

export function digestEmail(options: {
  name?: string | null;
  jobs: DigestJob[];
  unsubscribeUrl: string;
  listNames?: string[];
}): RenderedEmail {
  const { jobs } = options;
  const shown = jobs.slice(0, MAX_DIGEST_JOBS);
  const remaining = jobs.length - shown.length;
  const companies = Array.from(new Set(jobs.map(job => job.companyName)));
  const feedUrl = `${env.appUrl}/dashboard/jobs?view=matching`;
  const settingsUrl = `${env.appUrl}/dashboard/settings/notifications`;

  const subject =
    jobs.length === 1
      ? `New: ${jobs[0].title} at ${jobs[0].companyName}`
      : `${jobs.length} new jobs at ${companies.slice(0, 2).join(', ')}${companies.length > 2 ? ` and ${companies.length - 2} more` : ''}`;

  // Group by company so the reader can scan for the employers they care about.
  const grouped = new Map<string, DigestJob[]>();
  for (const job of shown) {
    const bucket = grouped.get(job.companyName) ?? [];
    bucket.push(job);
    grouped.set(job.companyName, bucket);
  }

  const sections = Array.from(grouped.entries())
    .map(([company, companyJobs]) => {
      const rows = companyJobs
        .map(job => {
          const href = job.url ? safeUrl(job.url, feedUrl) : safeUrl(job.jobId ? `${env.appUrl}/dashboard/jobs/${job.jobId}` : feedUrl);
          const meta = [job.location, job.reason].filter(Boolean).map(value => escapeHtml(value)).join(' &middot; ');
          return `<tr><td style="padding:10px 0;border-top:1px solid ${BORDER};">
<a href="${href}" style="font-size:14px;font-weight:600;color:${ACCENT};text-decoration:none;line-height:1.4;">${escapeHtml(job.title)}</a>
${meta ? `<div style="font-size:12px;color:${SUBTLE};line-height:1.5;margin-top:2px;">${meta}</div>` : ''}
</td></tr>`;
        })
        .join('');
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 18px 0;">
<tr><td style="padding:0 0 6px 0;font-size:12px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:${INK};">${escapeHtml(company)}</td></tr>
${rows}
</table>`;
    })
    .join('');

  const html = layout({
    preheader: shown.slice(0, 3).map(job => `${job.title} (${job.companyName})`).join(' · '),
    heading: jobs.length === 1 ? 'A new job matches your alerts' : `${jobs.length} new jobs match your alerts`,
    body:
      paragraph(`${greeting(options.name)} here is what was posted at the companies you are watching.`) +
      sections +
      (remaining > 0 ? paragraph(`Plus ${pluralize(remaining, 'more job')} in your feed.`) : '') +
      `<div style="margin:4px 0 0 0;">${button('View all matching jobs', feedUrl)}</div>`,
    footer: `You are receiving this because you turned on job alerts in JobPingly.<br>
<a href="${safeUrl(settingsUrl)}" style="color:${MUTED};text-decoration:underline;">Change how often you get these</a> &nbsp;&middot;&nbsp;
<a href="${safeUrl(options.unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline;">Unsubscribe from job alerts</a>`,
  });

  const text =
    `${jobs.length === 1 ? 'A new job matches' : `${jobs.length} new jobs match`} your JobPingly alerts:\n\n` +
    shown.map(job => `- ${job.title} at ${job.companyName}${job.location ? ` (${job.location})` : ''}\n  ${job.url ?? feedUrl}`).join('\n') +
    (remaining > 0 ? `\n\n...and ${remaining} more: ${feedUrl}` : '') +
    `\n\nChange frequency: ${settingsUrl}\nUnsubscribe: ${options.unsubscribeUrl}`;

  return { subject, html, text };
}

export function reminderEmail(options: { name?: string | null; jobTitle: string; companyName: string; note?: string | null; jobUrl: string }): RenderedEmail {
  return {
    subject: `Reminder: ${options.jobTitle} at ${options.companyName}`,
    html: layout({
      preheader: `You asked to be reminded about ${options.jobTitle}.`,
      heading: 'Application reminder',
      body:
        paragraph(`${greeting(options.name)} you asked to be reminded about <strong style="color:${INK};">${escapeHtml(options.jobTitle)}</strong> at ${escapeHtml(options.companyName)}.`) +
        (options.note ? `<div style="margin:0 0 16px 0;padding:12px 14px;background:${SURFACE};border:1px solid ${BORDER};border-radius:8px;font-size:13px;line-height:1.6;color:${MUTED};white-space:pre-wrap;">${escapeHtml(options.note)}</div>` : '') +
        `<div>${button('Open in your tracker', options.jobUrl)}</div>`,
    }),
    text: `Reminder: ${options.jobTitle} at ${options.companyName}.\n${options.note ? `\n${options.note}\n` : ''}\n${options.jobUrl}`,
  };
}

/** Plain-text message from an administrator. Line breaks are preserved; no HTML is accepted. */
export function broadcastEmail(options: { name?: string | null; subject: string; message: string; unsubscribeUrl?: string }): RenderedEmail {
  const body = escapeHtml(options.message).replace(/\r?\n/g, '<br>');
  return {
    subject: options.subject,
    html: layout({
      preheader: options.message.slice(0, 120),
      heading: options.subject,
      body: paragraph(greeting(options.name)) + `<div style="margin:0 0 16px 0;font-size:14px;line-height:1.7;color:${MUTED};">${body}</div>`,
      footer: `This announcement was sent to JobPingly users by the JobPingly team.${
        options.unsubscribeUrl ? `<br><a href="${safeUrl(options.unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline;">Unsubscribe from announcements and alerts</a>` : ''
      }`,
    }),
    text: `${options.message}\n\n${options.unsubscribeUrl ? `Unsubscribe: ${options.unsubscribeUrl}` : ''}`.trim(),
  };
}

export function testEmail(note?: string | null): RenderedEmail {
  return {
    subject: 'JobPingly test email',
    html: layout({
      preheader: 'Email delivery is working.',
      heading: 'Email delivery is working',
      body:
        paragraph('This is a test message sent from the JobPingly admin panel. If you are reading it, the email provider is configured correctly.') +
        (note ? paragraph(escapeHtml(note)) : ''),
      footer: 'Sent from the JobPingly admin panel.',
    }),
    text: `This is a test message from the JobPingly admin panel.${note ? `\n\n${note}` : ''}`,
  };
}
