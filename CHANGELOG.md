# Changelog

## 2.0.0 — 2026-11-16 (branch `transformation/v2`, not yet deployed)

A rebuild of the application on the same database. Existing accounts, watchlists, companies, jobs and subscriptions are kept; see the upgrade notes in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### Added

- **Dashboard**: overview, job feed with views (matching, new, all open, recently closed, dismissed), search and filters, job pages with history and match explanations, application tracker (board and list, notes, reminders, CSV export), companies with monitoring health, notifications centre, settings (profile, notifications, sign-in and sessions, data export, account deletion), onboarding.
- **Watchlists**: per-user alert rules with keyword groups, exclusions, fields, workplace/type/level/location filters and a live preview; import and export; members with editor and moderator roles; suggestions for public lists; duplicating lists; following public lists with your own keywords.
- **Admin panel**: overview with charts, users, sources, jobs, workers and queue, email (delivery, logs, approvals, alert queue, test and announcement sending), reported issues, settings, audit log, system.
- **Roles**: support, moderator, admin and owner with explicit permissions.
- **Monitoring**: adapters for SmartRecruiters, Recruitee, Workable, BambooHR, Personio and Pinpoint in addition to Greenhouse, Lever, Ashby and Workday; structured-data and embedded-API detection for company sites; robots.txt support; per-host politeness; a PostgreSQL work queue; job history; failure classification with backoff and auto-pause.
- **Email**: digest schedules including custom intervals in the user's time zone, one-click unsubscribe, delivery webhooks, approval of new recipients, daily quota protection and staggered delivery.
- **Public site**: new home page (live data only), pricing, help and contact, privacy, terms, bot policy, directory of public watchlists, public profiles, robots.txt and sitemap.
- **Operations**: `npm start` applies migrations and runs web and worker; `worker:once`, `/api/cron/tick` and a scheduled GitHub Action for hosts that sleep; `/api/health`; CLI scripts `admin:grant`, `seed:demo`, `scan:url`, `db:check`; CI workflow.
- **Tests**: 106 unit and 52 integration tests (Node test runner, real PostgreSQL, fake network).
- **Documentation**: README, architecture, API, database, deployment, admin and user guides, security.

### Changed

- Next.js 14 → 16, React 19; new design system with light and dark themes, accessible components and responsive layouts.
- Sessions are opaque server-side tokens instead of JWTs; email verification uses a code plus a browser ticket.
- Alert matching moved from ad-hoc keyword checks to a rule engine with stored matches.
- Settings are a typed registry with per-setting permissions.

### Fixed

- Failed scans were logged as successful scans with zero jobs, which closed real postings and hid broken sources.
- Jobs no longer close after a single missed scan, and a mass disappearance is held back as suspicious.
- List owners without a subscription row never received alerts for their own list (rows are created, with alerts off).
- Broadcasts now exclude unsubscribed and revoked addresses.
- Many smaller issues found during testing; see the git history.

### Security

See [SECURITY.md](SECURITY.md#problems-found-in-v1-and-fixed-in-v2). Most important: an account-takeover flaw in v1's email verification endpoint, pre-account hijacking, a committed Upstash token (must be rotated), clear-text storage of sign-in codes and reset links in the email log, and SSRF checks that ignored DNS and redirects.

### Removed

- The v1 Redis-dependent session cache, the AI client wrapper tied to one provider, the separate `packages/` scraper and notifier, and the old `job-monitor.yml` workflow (replaced by `worker.yml`). The v1 code remains available at the tag `pre-transformation-2026-11-16`.
