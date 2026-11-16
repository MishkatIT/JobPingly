# Admin guide

The admin panel is at `/admin`. It is available to staff roles only; every page and action checks the same permission on the server that the interface uses to show or hide it.

## Roles

| Role | Can |
| --- | --- |
| Support | See everything that is not sensitive; verify, suspend and reactivate regular accounts; triage reported issues. |
| Moderator | Support, plus manage sources and jobs, watchlists, monitoring tasks and pausing monitoring; read settings and the audit log. |
| Admin | Everything except changing roles and the sensitive switches. |
| Owner | Everything, including roles, sign-up/sign-in availability, maintenance mode and the email alert kill-switch. |

Staff can only act on accounts with a lower role than their own, and nobody can change their own role. The account in `ADMIN_BOOTSTRAP_EMAIL` is always an owner. From a terminal: `npm run admin:grant -- person@example.com moderator`.

## Overview

Live platform figures: users, activity, open jobs, source health, scan success over 24 hours, the scan queue, today's email use against the daily limit and the database size. Thirty-day charts (new jobs, scans, sign-ups, emails) each have a "View as table" option. Warnings at the top point to anything that needs attention: no worker running, monitoring or email switched off, recipients waiting for approval, broken sources, open issues.

## Users

Search by name, email or ID; filter by status (active, not verified, suspended, staff), role and plan. A user's page shows their account, email schedule and approval, plan and limits, watchlists, tracker activity, recent emails, signed-in devices and every staff action taken on the account. Actions (permission permitting):

- **Mark email as verified** — only when you have confirmed ownership another way. Sending a password reset link also verifies the address when it is used.
- **Suspend** (reason required, kept in the audit log) / **Reactivate**. Suspension signs the person out everywhere and stops their alerts; nothing is deleted.
- **Sign out of all devices.**
- **Approve email alerts / Revoke approval.**
- **Change plan or limits** — plans only change limits; no payment is taken. Optional end date. "Exempt from plan limits" removes all limits; "Exempt from the platform email schedule" keeps the user's own frequency when a schedule is enforced.
- **Change role** (owners).
- **Delete account** — permanent; type the email address to confirm. Their watchlists, including public ones others follow, are deleted with it.

## Sources (monitored careers pages)

A source is stored once and scanned once, however many watchlists include it. The list shows status, adapter, open jobs, watchers, consecutive failures, the last successful scan and the next check. Bulk actions: scan, pause (with a reason), resume, delete.

- **Add source** tests the URL first (dry run, nothing stored) and shows the adapter and the jobs it found.
- A source's page shows its health, recent scans with the error class and message, its jobs, the watchlists that include it and its recent tasks. You can scan it now, pause or resume it, override the adapter, change the check interval and run an extraction test.
- **Statuses**: Healthy; Pending (never read successfully yet, no error); Degraded (failing, or never read successfully after an error); Broken (failing repeatedly or a definitive error such as a board that no longer exists); Paused (by an admin, or automatically after too many failures). Users see these in plain language with a hint about what to do.

Common error classes: timed out, domain not found, blocked by the site, robots.txt disallows, not found on the ATS, rendered with JavaScript only (the page needs a browser; try the company's job-board link instead), too large, unexpected format.

## Jobs

Browse open, closed, hidden and possibly duplicated jobs, filter by source, and hide jobs (for example spam) with a reason; hidden jobs disappear from feeds and their pending alerts are cancelled. Restore undoes it. A job's dialog shows its history (discovered, updated, closed, reopened), the identity keys used to recognise it, how many alerts it produced and its raw source data.

## Workers & queue

Shows each worker (continuous, or scheduled runs such as the GitHub Action), its last heartbeat and last cycle, the queue (waiting, running, oldest due task, average wait and duration), failures by cause and scans per hour. Actions: run a cycle now, pause or resume monitoring, return stuck tasks to the queue, cancel everything queued, and retry or cancel individual tasks.

If the overview says "Monitoring is not running", no worker has reported recently. See [DEPLOYMENT.md](DEPLOYMENT.md#free-instances-sleep).

## Email

- **Delivery**: today's use against the daily limit (part of it is reserved for sign-in and account emails), a 14-day chart, outcomes reported by the provider, the sending configuration, the platform-wide digest schedule (optional; overrides users' own frequency) and staggering of large audiences into groups.
- **Sent emails**: every email with its status; the body (when stored) opens in an isolated frame. Sign-in codes, reset links and invitations are never stored.
- **Approvals**: new recipients wait here unless automatic approval is on. Approving sends a welcome email.
- **Alert queue**: what is waiting and what the next delivery would do (a dry run); process now; send everything now; or discard everything (typed confirmation).
- **Send**: a test email to yourself, or an announcement to an audience (all users, recently active, or users with alerts on). An announcement must be previewed first; the preview shows the recipient count, and sending requires typing SEND. Unsubscribed and revoked addresses are always excluded.

## Reported issues

Messages from the Help page and the in-app feedback form. Filter by status and category, set priority and status, and keep internal notes.

## Settings

Every platform setting with its description, grouped by area: registration, platform (maintenance mode and message), monitoring (master switch, global check interval, scanning sources on no watchlist, AI extraction, robots.txt, failures before auto-pause, retention), notifications, email (automatic approval, daily limit, safety buffer, staggering, storing bodies, retention), free-plan limits and public watchlists. Settings your role cannot change are shown locked with the reason; risky switches ask for confirmation. Changes apply within about 30 seconds.

The **site announcement** shows a bar on the public site and the dashboard; people can dismiss it, and changing its text shows it again.

## Audit log

Append-only record of administrative and security-relevant actions: who, what, target, details, IP address and time. Filter by actor, action, target and date; export CSV (requires the export permission).

## System

Configuration and health of the deployment: database version, size and connections, largest tables, applied migrations, email provider, AI provider, rate-limit backend, cron endpoint, Google sign-in and supported adapters. Secrets are never displayed.
