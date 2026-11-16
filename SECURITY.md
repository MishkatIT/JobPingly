# Security

## Reporting a vulnerability

Please report security problems privately: use the contact form on the site's Help page (`/help#contact`) or contact the repository owner directly on GitHub. Do not open a public issue. Include steps to reproduce and the impact you expect. You will get an acknowledgement, and a fix is prioritised by severity.

## How the application protects users

| Area | Protection | Where |
| --- | --- | --- |
| Sessions | Opaque 256-bit random tokens; only a SHA-256 hash is stored. `httpOnly`, `SameSite=Lax`, `Secure` in production. 30-day sliding expiry; revoked on sign-out, password change/reset and suspension; users can see and end sessions. | `lib/auth/session.ts` |
| Sign-up | Email ownership is proved with a 6-digit code bound to a short-lived ticket; limited attempts. Registering someone else's address cannot set or change that account's password. Responses do not reveal whether an address is registered. | `lib/auth/accounts.ts`, `lib/auth/verification.ts` |
| Passwords | bcrypt; minimum length, maximum size, a common-password list and the email's name part are checked. Resets use single-use, expiring tokens and sign out other sessions. | `lib/auth/password.ts` |
| Google sign-in | ID token signature, audience and expiry verified against Google's keys; accounts are linked only for a verified matching email. | `lib/auth/google.ts` |
| Authorisation | Every API route declares the permission it needs; roles are explicit permission sets; staff cannot act on equal or higher roles (the one exception is sending a password-reset link, which only reaches the account's own address); only owners change roles and sensitive switches. The UI hides controls, but the server always decides. | `lib/api/route.ts`, `lib/auth/rbac.ts` |
| Data isolation | Private watchlists, their companies and jobs are visible only to the owner and accepted collaborators; followers lose access when a list becomes private. Public lists are visible to non-followers only while public lists are switched on and the owner is not suspended. Alert keywords are never shown to other people. | `lib/lists/access.ts` |
| CSRF | State-changing API requests from another site are rejected (Origin / Sec-Fetch-Site). Exempt: cron and webhooks (shared secrets) and one-click unsubscribe (signed token). | `proxy.ts` |
| SSRF | Monitored URLs are checked for syntax, private/reserved ranges and credentials; the hostname is resolved and every address checked; each redirect hop is re-checked; the socket-level lookup refuses private addresses, which also defeats DNS rebinding. | `lib/security/ssrf.ts`, `lib/monitoring/http.ts` |
| Untrusted content | Scraped text is stored as plain text; only http(s) links are kept; emails escape all scraped values; stored email HTML is shown to admins only inside a sandboxed iframe; no user or scraped HTML is rendered with `dangerouslySetInnerHTML`. | `lib/security/html.ts`, `lib/email/templates.ts` |
| Uploads | Avatars accept PNG, JPEG, WebP and GIF data up to 256 KB (SVG refused) and are served from a dedicated endpoint with the right content type. | `lib/users/avatar.ts` |
| Abuse | Per-IP ceiling in the proxy plus tighter per-route limits (sign-in, sign-up, codes, resets, invites, suggestions, exports, rescans); optional Upstash backend for multiple instances. | `lib/security/rateLimit.ts` |
| Headers | Content-Security-Policy, HSTS (production), `X-Frame-Options: DENY`, `nosniff`, a strict Referrer-Policy and Permissions-Policy. | `next.config.mjs` |
| Secrets | Read from the environment only; production refuses to start without `DATABASE_URL` and a strong `APP_SECRET`; secrets are never shown in the admin panel. | `lib/env.ts` |
| Accountability | Administrative and security-relevant actions are appended to an audit log that no route can modify. | `lib/audit.ts` |
| Email | Unsubscribe tokens are HMAC-signed for one purpose; bounce and complaint webhooks require a secret; production never reports unsent mail as sent. | `lib/email/*`, `app/api/webhooks/brevo` |

Content-Security-Policy note: scripts allow `'unsafe-inline'` so that public pages can stay statically cached (a nonce policy would make every page dynamic). This is mitigated by never rendering untrusted HTML; revisit if that ever changes.

## Problems found in v1 and fixed in v2

| Severity | Problem in v1 | Fix |
| --- | --- | --- |
| Critical | `POST /api/auth/verify-email` returned a valid access token for any already-verified account given only its email address and any 6-digit code: anyone could sign in as any user, including administrators. | Verification requires the browser's ticket and the correct code, and never issues a session for an already-verified account. Regression test included. |
| High | Registering an address before its owner could leave the attacker's password on the account (pre-account hijacking). | A pending password is stored with the verification record and applied only after the emailed code is entered. Regression test included. |
| High | A real Upstash Redis token was committed in `.env.example`. | Removed from the file. **The token must still be rotated**: it remains in git history. |
| High | Next.js 14 (end of life, with published security advisories). | Upgraded to Next.js 16. |
| High | Verification codes, password-reset links and invitation tokens were stored in clear text in the email log and displayed in the admin panel. | Bodies of those emails are no longer stored (migration 0004 removed existing ones); storing bodies is off by default. |
| Medium | SSRF protection checked only the URL text when a company was added; the scraper followed redirects and connected to whatever a hostname resolved to. | DNS, redirect and socket-level checks on every request. |
| Medium | Failed scans were recorded as successful scans with zero jobs, which silently closed real postings and hid broken sources. | Failures are recorded and classified as failures; jobs close only after consecutive misses; mass disappearances are held as suspicious. |
| Low | Alert emails had no unsubscribe link (a deliverability and compliance problem). | Signed one-click unsubscribe with a confirmation page (link scanners cannot trigger it) and RFC 8058 `List-Unsubscribe` support. |

## Operational recommendations

- Rotate the Upstash token (see above), and rotate `APP_SECRET`/`JWT_ACCESS_SECRET` if it was ever shared.
- Keep `BREVO_WEBHOOK_SECRET` and `CRON_SECRET` long and random; they are compared in constant time.
- Give staff the lowest role that works; owners only for people who manage roles.
- Run `npm audit` regularly; CI runs type-check, lint, tests and a build on every push.
