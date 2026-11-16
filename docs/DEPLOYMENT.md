# Deployment

This guide covers deploying JobPingly v2, including the one-time upgrade of the existing v1 production database. Read the upgrade section in full before the first v2 deploy.

## What you need

| Service | Required | Notes |
| --- | --- | --- |
| PostgreSQL 14+ | Yes | Supabase works (use the pooler URL for the app and a direct/session URL for migrations). |
| Node.js host | Yes | Render web service today; any host that runs `npm start` with Node 20.9+ (22 recommended). |
| Brevo | For email | Without it, sign-up codes cannot be delivered in production and alerts stay queued. The free plan allows 300 emails a day. |
| Google OAuth client | Optional | Enables "Sign in with Google". |
| Groq / OpenAI / Ollama key | Optional | AI extraction for careers pages no adapter understands. |
| Upstash Redis | Optional | Shares rate limits between several instances; not needed for one instance. |

All variables are documented in [`.env.example`](../.env.example). In production only `DATABASE_URL` and `APP_SECRET` (or the existing `JWT_ACCESS_SECRET`) are mandatory; the process refuses to start without them. Set `NEXT_PUBLIC_APP_URL` too, so links in emails are correct.

## Upgrading the existing v1 deployment (one time)

The v1 code is preserved at the git tag `pre-transformation-2026-11-16`.

1. **Rotate the leaked Upstash token.** The old `.env.example` in git history contained a real `UPSTASH_REDIS_REST_TOKEN`. Rotate it in the Upstash console (or delete that database if it is unused) and update the environment variable wherever it is set. Removing it from the current file does not remove it from history.
2. **Back up the production database** and keep the file until v2 has run for a while:
   ```bash
   pg_dump "postgresql://USER:PASSWORD@HOST:5432/postgres" --format=custom --no-owner --file=jobpingly-before-v2.dump
   ```
   (Supabase: use the direct or session connection string, port 5432. Supabase's own daily backups are a second line of defence, not a replacement.)
3. **Rehearse on a copy** (strongly recommended): restore the dump into a scratch database, then
   ```bash
   MIGRATION_DATABASE_URL="postgresql://...scratch..." npm run db:migrate -- --dry   # lists what will run
   MIGRATION_DATABASE_URL="postgresql://...scratch..." npm run db:migrate
   DATABASE_URL="postgresql://...scratch..." npm run db:check                         # code and schema agree
   ```
   During development the migrations were run against a copy of the production data this way, including a second run to confirm they are idempotent.
4. **Know what the migrations change.** `npm start` applies them automatically before the server starts (set `SKIP_MIGRATIONS=true` to manage them by hand). They run in order, each in a transaction under an advisory lock:
   - `0003_schema_v2` creates the new tables (job history, matches, tracker, work queue, in-app notifications, ...) and adds columns and indexes. It checks before every change, so it works on the drifted v1 database and on an empty one.
   - `0004_v2_data` backfills derived data (scan outcomes, adapter names, open-job counts, source health), removes stored bodies of sign-in, reset and invite emails (the delivery records stay), restores the plain description of the old "master admin list", creates missing owner subscription rows **with alerts off** (nobody starts receiving new email), recounts followers, merges a duplicated setting and settles alert-queue rows for users who can no longer receive mail. It deletes no user-facing records.
   - `0005_verification_and_directory` adds the columns for code-based email verification, deletes old unused verification rows, adds featured lists, and marks verified v1 users as onboarded.
   See [DATABASE.md](DATABASE.md) for details.
5. **Deploy** (below). Watch the log for `[migrate] Applied ...` and then `[start] Web server started`.
6. **Check** the post-deploy list at the end of this page.

**Rollback:** redeploy the commit tagged `pre-transformation-2026-11-16` **and** restore the backup from step 2 (`pg_restore --clean --if-exists --no-owner --dbname "..." jobpingly-before-v2.dump`). Running v1 code against the v2 schema without restoring was not tested.

## Render

Web service settings:

| Setting | Value |
| --- | --- |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |
| Environment | `NODE_VERSION=22`, `NODE_ENV=production`, plus the variables from `.env.example` |

`npm start` runs migrations, then the web server and the worker (`WORKER_MODE=separate`). On a 512 MB instance, `WORKER_MODE=inline` runs the worker inside the web server and saves roughly one Node.js process.

### Free instances sleep

Render's free web services stop after about 15 minutes without traffic, and the worker stops with them. Choose at least one of:

- **Scheduled GitHub Action** (included): `.github/workflows/worker.yml` runs `npm run worker:once` every three hours, like v1's `job-monitor.yml` did. Add these repository secrets: `DATABASE_URL`, `APP_SECRET` (or `JWT_ACCESS_SECRET`, identical to the web service's value), `NEXT_PUBLIC_APP_URL`, `BREVO_API_KEY`, and optionally `SENDER_EMAIL`, `SENDER_NAME` and AI keys. Without `DATABASE_URL` the job skips itself; without `NEXT_PUBLIC_APP_URL` it fails on purpose rather than send emails with wrong links.
- **External cron** (for example cron-job.org): `POST https://<host>/api/cron/tick` with the header `Authorization: Bearer <CRON_SECRET>` every 15–60 minutes. This also wakes the service. Disabled unless `CRON_SECRET` (16+ characters) is set.
- **A paid instance**, which keeps the built-in worker running continuously.

These can be combined; the database queue prevents duplicate scans.

## Supabase

- `DATABASE_URL`: the transaction pooler string (port 6543). The client already disables prepared statements for it.
- `MIGRATION_DATABASE_URL`: the direct or session-mode string (port 5432). Migrations need a real session.
- `DB_POOL_MAX` (default 10 in production) must stay below the pooler's client limit across all instances.

## Email (Brevo)

1. Create an API key and verify the sender address or domain; set `BREVO_API_KEY`, `SENDER_EMAIL`, `SENDER_NAME`.
2. Set `BREVO_DAILY_LIMIT` to your plan's daily allowance (300 on the free plan). Admin > Settings can lower it further and reserves a buffer for sign-in emails.
3. Webhook (recommended): set `BREVO_WEBHOOK_SECRET` to a random string, then in Brevo add a transactional webhook to `https://<host>/api/webhooks/brevo?token=<BREVO_WEBHOOK_SECRET>` for delivered, hard bounce, soft bounce, blocked, invalid email and spam events. Bounces and complaints switch alerts off for that address.
4. New accounts need approval before alert emails are sent, unless Admin > Settings > "Approve new recipients automatically" is on. Approvals are in Admin > Email.

## Google sign-in

Create an OAuth client ID of type "Web application" in Google Cloud, add your site (for example `https://jobpingly.onrender.com`) to the authorised JavaScript origins, and set both `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (read at build time, so rebuild after changing it) and `GOOGLE_CLIENT_ID`.

## Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main` and `transformation/**` and on pull requests: type-check, lint, unit and integration tests against a PostgreSQL service container, and a production build.

## After every deploy

- `GET /api/health` returns `{"status":"ok"}` (`degraded` means no worker has reported recently; HTTP 503 means the database is unreachable). Point an uptime monitor at it; `HEAD` works too.
- Admin > Overview shows no "Monitoring is not running" warning, and Admin > Workers & queue lists a live worker.
- Admin > Sources: run "Scan now" on one source and confirm it succeeds.
- Admin > Email > Send: send a test email to yourself.
- Admin > System: no configuration warnings you did not expect.
- Make sure an owner exists: set `ADMIN_BOOTSTRAP_EMAIL`, or run `npm run admin:grant -- you@example.com owner` once with production credentials.
