# JobPingly database

The data model and the migration process for JobPingly's PostgreSQL database.

Sources of truth, in order:

1. The SQL files in `drizzle/` (from `0003_schema_v2.sql` on). They are what real databases receive, via `npm run db:migrate`.
2. `lib/db/schema.ts`, the Drizzle description the application queries through. It must describe the same shape; `npm run db:check` compares it with a live database.
3. `lib/db/migrate.ts`, the migration runner.

If this document and those files disagree, the files are right and this document needs fixing.

Contents

1. [Overview](#1-overview)
2. [Tables](#2-tables)
3. [What deletes what](#3-what-deletes-what)
4. [Retention](#4-retention)
5. [Migrations](#5-migrations)
6. [Backup and restore](#6-backup-and-restore)
7. [Notes and caveats](#7-notes-and-caveats)

---

## 1. Overview

- **Engine**: PostgreSQL. Migrations call the built-in `gen_random_uuid()`, so PostgreSQL 13 or later is required; CI runs PostgreSQL 16. Everything lives in the `public` schema.
- **Size**: 26 application tables, plus `schema_migrations`, which the runner creates for its own bookkeeping.
- **Conventions** (header of `lib/db/schema.ts`):
  - Every timestamp is `timestamp with time zone`.
  - Status-like columns are `text`. Their allowed values are listed in comments in `schema.ts` and in `lib/constants.ts`, and are enforced only by application code: there are no Postgres enums and no CHECK constraints. A new value needs no migration, and nothing in the database rejects a wrong one.
  - Every foreign key states its delete rule (`CASCADE` or `SET NULL`).
  - Primary keys are `uuid DEFAULT gen_random_uuid()`, except `feature_flags.key`, `worker_heartbeat.id` and `schema_migrations.name` (text).
- **Soft states**: trashed watchlists (`lists.deleted_at`) and hidden jobs (`jobs.hidden_at`) stay in their tables. Raw SQL must filter them the way the existing queries do (`deleted_at IS NULL`, `hidden_at IS NULL`).
- **Access** (`lib/db/client.ts`): one postgres.js pool per process. `max` is `DB_POOL_MAX` (default 10 in production and 5 otherwise, range 1-50); idle timeout 20 s; connect timeout 10 s; connections are recycled after 30 minutes; `prepare: false`, so the application works through Supabase's transaction pooler (port 6543). Ordinary queries use Drizzle; heavier SQL uses postgres.js tagged templates with bound parameters.
- **Roles beyond storage**: the database is also the scan queue (`monitor_tasks`), the email outbox (`notification_queue`), the settings store (`feature_flags`) and the audit log (`admin_audit_log`). There is no Redis or queue service to keep in step.

### 1.1 Relationship sketch

The core path: a **user** owns **lists**. A list contains **career_pages** (shared company sources) through **list_career_pages**. A career page has **jobs**. A user's alert rules for one list live in **list_subscriptions**. When a scan finds a new job that satisfies a subscription, a **job_matches** row is written and, if alerts are on, a **notification_queue** row. The worker turns pending queue rows into digest emails, which are logged in **sent_email_logs**.

```mermaid
erDiagram
  users ||--o{ refresh_tokens : "sessions"
  users ||--o{ oauth_accounts : "Google link"
  users ||--o{ email_verifications : "sign-up codes"
  users ||--o{ password_resets : "reset tokens"
  users ||--o{ lists : "owns"
  lists ||--o{ list_career_pages : "contains"
  career_pages ||--o{ list_career_pages : "appears in"
  users ||--o{ list_subscriptions : "alert rules"
  lists ||--o{ list_subscriptions : "followed via"
  lists ||--o{ list_collaborators : "members"
  users ||--o{ list_collaborators : "member of"
  lists ||--o{ list_contributions : "suggestions"
  career_pages ||--o{ jobs : "postings"
  jobs ||--o{ job_events : "history"
  users ||--o{ job_matches : "matched for"
  jobs ||--o{ job_matches : "matched"
  lists ||--o{ job_matches : "matched via"
  users ||--o{ user_jobs : "tracker"
  jobs |o--o{ user_jobs : "optional, SET NULL"
  users ||--o{ notification_queue : "pending alerts"
  jobs ||--o{ notification_queue : "alert about"
  lists |o--o{ notification_queue : "attributed to, SET NULL"
  users ||--o{ notifications : "in-app"
  career_pages ||--o{ monitor_tasks : "scan queue"
  career_pages ||--o{ scrape_logs : "scan history"
```

Not drawn: `sent_email_logs`, `email_approvals`, `feature_flags`, `admin_audit_log`, `reported_issues` (each references `users` with `ON DELETE SET NULL`), `worker_heartbeat` (no foreign keys), the legacy `subscriptions` table and `schema_migrations`. `email_approvals` is matched to users by the email text, not by a key.

---

## 2. Tables

Each entry lists the purpose, the columns whose meaning is not obvious, keys and indexes, foreign keys with their delete rule, and retention. Columns not mentioned are self-explanatory (`id`, `created_at`, plain names). Types are abbreviated: `ts` is `timestamp with time zone`.

### 2.1 Identity and sessions

#### `users`

One row per account (password, Google, or both).

| Column | Type | Notes |
|---|---|---|
| `email` | text, unique (`users_email_unique`) | Stored lower-cased by the application. `email_approvals` and `sent_email_logs` are joined to users by this text. |
| `password_hash` | text | bcrypt, cost 10. NULL for Google-only accounts and for sign-ups not yet verified (the chosen password waits on `email_verifications`). |
| `avatar_url` | text | An `https:` URL, or a base64 `data:` URL of an uploaded PNG/JPEG/WebP/GIF of at most 256 KB. API responses replace data URLs with `/api/avatar/<id>?v=<hash>`. |
| `google_id` | text, unique (`users_google_id_unique`) | Google `sub`, set on the first Google sign-in. |
| `email_verified` | bool, default false | Sessions are valid only when true. |
| `role` | text, default `user` | `user`, `support`, `moderator`, `admin`, `owner` (`lib/auth/rbac.ts`). Unknown values act as `user`. The account matching `ADMIN_BOOTSTRAP_EMAIL` is set to `owner` when its session loads. |
| `is_blocked`, `blocked_reason`, `blocked_at` | | Suspension: no sign-in, sessions rejected, no alerts, hidden from the public directory. |
| `email_notifications_enabled` | bool, default true | Master switch for non-transactional mail: digests, reminder emails, broadcasts. Turned off by unsubscribe links and by Brevo bounce or complaint events. |
| `notification_preference` | text, default `daily` | Account digest frequency: `realtime`, `every_6_hours`, `every_12_hours`, `daily`, `twice_weekly`, `weekly`, `biweekly`, `monthly`, `custom_<n>_<hours\|days\|weeks>`. |
| `digest_hour`, `digest_minute`, `timezone` | int 8, int 0, text `UTC` | Delivery time in the user's IANA time zone. |
| `last_digest_sent_at` | ts | When a digest was last actually sent; the schedule is evaluated from here. `notification_queue.sent_at` cannot serve this purpose because rows settled without sending are stamped too. |
| `frequency_enforcement_exempt` | bool | Not subject to a platform-enforced digest frequency (`notifications.enforce_frequency`). |
| `quota_exempt` | bool | Ignores the daily sending allowance and cohort staggering; unlimited plan limits. |
| `dispatch_group` | int, default 1 | Cohort for digest staggering under quota pressure. Folded into the current rotation length (`email.cohort_cycle_days`); rebalanced by `POST /api/admin/emails/cohorts`. |
| `socials` | jsonb | `{ website, linkedin, github, twitter }`, http(s) URLs. |
| `notification_settings` | jsonb, default `{}` | In-app switches. Keys read by code: `inApp`, `jobChanges`, `sourceFailures` (a missing key means on). |
| `plan`, `plan_expires_at` | text `free`, ts | `free`, `pro`, `team` (`lib/plans.ts`). Billing is not connected; staff set these. |
| `onboarding_completed_at` | ts | Set when onboarding finishes. Migration 0005 back-filled it for every verified account. |
| `last_active_at` | ts | Written at most every 5 minutes per session. |

- **Indexes**: `idx_users_created` (`created_at`), `idx_users_role` (`role`), `idx_users_last_active` (`last_active_at`).
- **Retention**: never deleted automatically, including accounts that never verified. Deleted by the user (`DELETE /api/me`, refused for owners) or by staff with `users.delete`. See [What deletes what](#3-what-deletes-what).

#### `refresh_tokens`

Server-side sessions. The name comes from v1 (which stored refresh tokens here); v2 reuses the table so people who were signed in stayed signed in across the upgrade.

| Column | Type | Notes |
|---|---|---|
| `token_hash` | text, unique (`refresh_tokens_token_hash_unique`) | SHA-256 hex of the 64-hex cookie token. The token itself is never stored. |
| `device_hint` | text | "Chrome on Windows", derived from the user agent. |
| `user_agent` | text | First 400 characters. |
| `ip_address` | text | Client IP at sign-in (shown masked to the user). |
| `expires_at` | ts | 30 days after sign-in; moved to 30 days from now when less than 15 days remain at a request. |
| `revoked_at` | ts | Sign-out, "sign out other devices", password change or reset, suspension. |
| `last_used_at` | ts | Updated at most every 5 minutes. |

- **Indexes**: the unique index on `token_hash`, plus `idx_refresh_tokens_hash` on the same column, `idx_refresh_tokens_user`, `idx_refresh_tokens_expires`.
- **Foreign keys**: `user_id` → `users` `CASCADE`.
- **Retention**: housekeeping deletes rows 7 days after `expires_at` or 30 days after `revoked_at`.

#### `oauth_accounts`

Linked external identities: `provider` (`google`), `provider_id` (Google `sub`) and `email` at link time. Written on every Google sign-in (`INSERT … ON CONFLICT DO NOTHING`). No code reads it; Google sign-in matches on `users.google_id`.

- **Keys**: unique `(provider, provider_id)` (`unique_provider_provider_id`).
- **Foreign keys**: `user_id` → `users` `CASCADE`.
- **Retention**: removed with the user.

#### `email_verifications`

One row per registration attempt, and per sign-in that resumes an unfinished sign-up. Verifying needs both secrets on the row: the ticket held by the browser that registered and the code sent by email (`lib/auth/verification.ts`).

| Column | Type | Notes |
|---|---|---|
| `token_hash` | text, unique (`email_verifications_token_hash_unique`) | SHA-256 of the ticket returned to the browser. |
| `code_hash` | text | HMAC-SHA256 keyed with `APP_SECRET` over `"<token_hash>:<code>"`. Added by 0005. |
| `pending_password_hash` | text | bcrypt hash of the password chosen at sign-up; copied to `users.password_hash` only when the code is verified. Added by 0005. |
| `pending_name` | text | Name from the sign-up form, applied on verification. Added by 0005. |
| `expires_at` | ts | 10 minutes after the latest code was sent. |
| `attempts` | int | Wrong codes, counted atomically before comparison; 5 allowed per code; reset when a new code is sent. |
| `last_sent_at` | ts | Drives the 60-second resend cooldown. |
| `used_at` | ts | Not set by current code: a successful verification deletes all of the user's rows instead. |

- **Indexes**: `idx_email_verifications_user`.
- **Foreign keys**: `user_id` → `users` `CASCADE`.
- **Retention**: all of a user's rows are deleted when they verify, reset their password, or sign in with Google for the first time on an unverified account. Housekeeping deletes the rest 7 days after `expires_at`.

#### `password_resets`

| Column | Type | Notes |
|---|---|---|
| `token_hash` | text, unique (`password_resets_token_hash_unique`) | SHA-256 of the 64-hex token in the emailed link. |
| `expires_at` | ts | 60 minutes after the request. |
| `used_at` | ts | Set when the token is used; the user's other reset rows are deleted at the same moment. |

- **Indexes**: `idx_password_resets_user`.
- **Foreign keys**: `user_id` → `users` `CASCADE`.
- **Retention**: housekeeping deletes rows 7 days after `expires_at`.

### 2.2 Watchlists

#### `lists`

Watchlists. Each has one owner, a visibility, and a soft-delete marker.

| Column | Type | Notes |
|---|---|---|
| `slug` | text, unique (`lists_slug_unique`) | Slugified name plus `-` and 6 random hex characters. Used in public URLs. |
| `visibility` | text, default `private` | `private` or `public`. |
| `parent_list_id` | uuid | Set on a copy made with "duplicate", pointing at the source list. Nothing reads it. |
| `is_canonical` | bool, default true | false on copies. Nothing reads it. |
| `follower_count` | int | Cached number of subscriptions excluding the owner's. Refreshed on follow and unfollow; recomputed by 0004. |
| `contribution_count` | int | Number of approved suggestions. |
| `tags` | text[], default `{}` | At most 8, lower-case, at most 30 characters each (application rules). |
| `pinned` | bool | The owner's pin; pinned lists sort first. |
| `featured_at` | ts | Staff feature a public list at the top of the directory. Added by 0005. |
| `deleted_at` | ts | Trash. Trashed lists are invisible to users, their matches are deleted and their pending alerts settled; staff can restore or purge them. |
| `updated_at` | ts | Bumped when details or companies change. |

- **Indexes**: `idx_list_user`, `idx_list_visibility`, `idx_list_parent`, `idx_list_deleted_at`, `idx_list_featured` (partial: `WHERE featured_at IS NOT NULL`).
- **Foreign keys**: `user_id` → `users` `CASCADE`; `parent_list_id` → `lists` `SET NULL`.
- **Retention**: never purged automatically. Trashed lists stay until staff delete them (`DELETE /api/admin/lists/{id}`, which requires the trash first).

#### `list_career_pages`

Which companies are on which list. The company itself is a shared `career_pages` row.

| Column | Type | Notes |
|---|---|---|
| `is_paused` | bool | Per-list pause: the company is left out of this list's feed, matching, alerts and open-job counts. When no live list has it unpaused and `monitoring.scan_unwatched_sources` is off, the source is no longer scheduled. |
| `category`, `notes` | text | At most 60 and 500 characters. |
| `added_by`, `added_at` | uuid, ts | Who added it, and when. |

- **Keys**: unique `(list_id, career_page_id)` (`unique_list_career_page`). Indexes `idx_list_pages_list`, `idx_list_pages_page`.
- **Foreign keys**: `list_id` → `lists` `CASCADE`; `career_page_id` → `career_pages` `CASCADE`; `added_by` → `users` `SET NULL`.
- **Retention**: removed with the list or the source, or when a company is removed from the list.

#### `list_subscriptions`

A user's alert settings for one list. The owner gets a row when creating a list; a collaborator gets one when first saving alert settings; for a public list, having a row is what "following" means.

| Column | Type | Notes |
|---|---|---|
| `positive_keywords`, `negative_keywords` | text[] | Flat keyword lists in the v1 format. Kept in sync from `match_rules`; used for matching only when `match_rules` is NULL or invalid. |
| `match_rules` | jsonb | The full rule set (`lib/matching/rules.ts`): `include` (groups of terms), `exclude`, `fields`, `wholeWord`, `workplace`, `employment`, `seniority`, `locations`, `includeUnknown`. NULL means keywords only. |
| `alerts_enabled` | bool, default true | Email and in-app alerts for new matching jobs. Matches are recorded either way. |
| `digest_frequency` | text, default `inherit` | `inherit` uses `users.notification_preference`; otherwise one of its values. |

- **Keys**: unique `(user_id, list_id)` (`unique_user_list_sub`). Indexes `idx_list_sub_list`, `idx_list_sub_user`.
- **Foreign keys**: `user_id` → `users` `CASCADE`; `list_id` → `lists` `CASCADE`.
- **Retention**: removed on unfollow, or with the user or the list.

#### `list_collaborators`

Invitations and memberships for helping maintain a list.

| Column | Type | Notes |
|---|---|---|
| `role` | text, default `editor` | `editor` or `moderator`. |
| `status` | text, default `pending` | `pending`, `accepted`, `declined`. Only `accepted` grants access. |
| `invite_token` | uuid, default `gen_random_uuid()` | Secret part of the `/invite/<token>` link. Regenerated when a pending or declined invitation is sent again. |
| `invited_by` | uuid | The inviting owner. |
| `created_at` | ts | Invitation age: a pending invitation expires 14 days after `created_at`. Expiry is checked in code; the row is not deleted. |

- **Keys**: unique `(user_id, list_id)` (`unique_user_list_collab`). Indexes on `list_id`, `user_id`, `status`, `(user_id, status)` and `invite_token`.
- **Foreign keys**: `list_id` → `lists` `CASCADE`; `user_id` → `users` `CASCADE`; `invited_by` → `users` `SET NULL`.
- **Retention**: deleted when a member is removed or leaves, or with the list or user. Expired and declined rows stay.

#### `list_contributions`

Company suggestions on public lists.

| Column | Type | Notes |
|---|---|---|
| `url` | text | Canonical URL; only its syntax is checked until the suggestion is approved. |
| `status` | text, default `pending` | `pending`, `approved`, `rejected`. |
| `ats_type` | text, default `unknown` | Never set by current code. |
| `reviewed_at` | ts | When the owner or a moderator decided. |

- **Indexes**: `idx_list_contrib_list`, `idx_list_contrib_status`.
- **Foreign keys**: `list_id` → `lists` `CASCADE`; `contributor_user_id` → `users` `SET NULL`.
- **Retention**: never pruned.

### 2.3 Sources and jobs

#### `career_pages`

The platform-wide company registry: one row per canonical careers URL. A source is scanned once however many lists include it. Users never edit it directly; staff do.

| Column | Type | Notes |
|---|---|---|
| `url` | text, unique (`career_pages_url_unique`) | Canonical form: https, lower-case host, no fragment, no tracking parameters, no trailing slash. |
| `company_name`, `website_url`, `logo_url`, `industry`, `hq_location` | text | Display metadata. `company_name` may be filled from the first successful extraction. |
| `ats_type` | text, default `unknown` | Adapter id of the latest successful scan (for example `greenhouse`, `lever`, `workday`, `generic_html`, `ai`), or the adapter detected from the URL at creation. 0004 normalised older values. |
| `adapter_override` | text | Adapter forced by staff; NULL means detect automatically. |
| `scrape_method` | text, default `html` | Extraction kind of the latest successful scan: `api`, `html`, `ai`, `browser`. |
| `status` | text, default `active` | `active`, `degraded`, `broken`, `paused`; rules below. |
| `paused_reason` | text | Why the source is paused. Text starting with "Paused automatically" marks an automatic pause, which a manual rescan or a task retry lifts. |
| `priority` | int, default 0 | Copied into scheduled scan tasks. Staff set -10 to 100. |
| `last_success_at` | ts | NULL means the source was never scanned successfully ("pending" health). |
| `next_check_at` | ts, default `now()` | When the next scheduled scan is due. After a success: the interval with ±10% jitter. After a failure: exponential backoff from 30 minutes to 24 hours, at least 12 hours for non-retryable errors, longer if the site sent `Retry-After`. |
| `consecutive_failures` | int | Reset to 0 by any successful scan. |
| `check_interval_minutes` | int, default 180 | Used only when `scraper.use_global_timer` is off; otherwise `scraper.global_check_interval_minutes` (default 180) applies to every source. |
| `last_content_hash` | text | A page hash, or `r:<hash>` of the extracted job set. An identical hash turns the next scan into an "unchanged" scan. Cleared when the URL or the adapter override changes; not updated by suspicious or truncated scans. |
| `last_error`, `last_error_class`, `last_http_status` | text, text, int | The error class comes from `lib/monitoring/errors.ts`: `timeout`, `dns`, `network`, `tls`, `http_404`, `http_403`, `http_429`, `http_4xx`, `http_5xx`, `blocked`, `unsafe_url`, `robots_disallowed`, `too_large`, `redirect_loop`, `parse`, `ai_failed`, `js_rendered`, `not_found_on_ats`, `unknown`. |
| `active_job_count` | int | Denormalised count of active, non-hidden jobs. Maintained by the scan pipeline, job hide/restore and deadline closing; recomputed by 0004. |
| `robots_allowed`, `robots_checked_at` | bool, ts | Latest `robots.txt` verdict. |
| `created_by` | uuid | The user who first added the URL. |

Status rules (`lib/monitoring/pipeline.ts`): 3 or more consecutive failures make a source `degraded`; 7 or more (or 2 or more with a non-retryable error) make it `broken`; reaching `monitoring.max_failures_before_pause` (default 14) pauses it automatically; `unsafe_url` and `robots_disallowed` pause it at once. A successful scan sets `active`, or `degraded` when the anti-spike guard is holding back closures.

- **Indexes**: the unique index on `url`, `idx_career_pages_due` (`status, next_check_at`), `idx_career_pages_company` (`company_name`).
- **Foreign keys**: `created_by` → `users` `SET NULL`.
- **Retention**: never deleted automatically, even when no list includes it any more. Sources nobody watches keep being scanned while `monitoring.scan_unwatched_sources` is on (the default). Staff with `sources.delete` delete sources; see [What deletes what](#3-what-deletes-what).

#### `jobs`

One posting at one source.

| Column | Type | Notes |
|---|---|---|
| `fingerprint` | text | Primary identity key (`lib/monitoring/fingerprint.ts`): `ext:` plus a hash of the ATS's own id, else `url:` plus a hash of the canonical posting URL, else `tl:` plus a hash of the normalised title and location. Byte-compatible with v1 hashes. |
| `external_id` | text | The ATS's id for the posting. |
| `url_key`, `dedupe_key` | text | Fallback identity keys (`url:…`, `tl:…`) that recognise a posting whose primary key changed (ATS migration, URL restructuring, adapter change). `dedupe_key` also drives the admin "possible duplicates" view. |
| `job_type` | text | Employment type exactly as the source reported it. |
| `workplace_type`, `employment_type`, `seniority` | text | Normalised facets (`lib/monitoring/classify.ts`); values in `lib/constants.ts`. |
| `description` | text | Plain text. |
| `content_hash` | text | Hash of the attributes users care about; a change produces an `updated` event. NULL on rows written before v2; filled when the job is next seen. |
| `deadline_at` | ts | Once it passes, the job is closed at the next worker cycle. A new job whose deadline is already past is stored as closed. |
| `status` | text, default `active` | `active` or `closed`. |
| `missed_scrapes` | int | Consecutive scans the job was absent from. It closes at 2 for API adapters and 3 for HTML, AI and browser extraction. Reset when the job is seen; not counted on suspicious or truncated scans. |
| `first_seen_at`, `last_seen_at`, `closed_at`, `reopened_at` | ts | |
| `hidden_at`, `hidden_reason`, `hidden_by` | ts, text, uuid | Staff removal of spam or invalid postings. Hidden jobs are never shown, counted, matched or alerted, and stay hidden if scans see them again. |
| `raw_data` | jsonb | The adapter's raw payload. |

- **Keys**: unique `(career_page_id, fingerprint)` (`unique_career_page_fingerprint`).
- **Indexes**: `idx_jobs_career_page_status` (`career_page_id, status`), `idx_jobs_fingerprint`, `idx_jobs_feed` (`status, first_seen_at`), `idx_jobs_page_first_seen` (`career_page_id, first_seen_at`), `idx_jobs_dedupe` (`career_page_id, dedupe_key`), `idx_jobs_url_key` (`career_page_id, url_key`), `idx_jobs_closed_at`.
- **Foreign keys**: `career_page_id` → `career_pages` `CASCADE`; `hidden_by` → `users` `SET NULL`.
- **Retention**: closed jobs are deleted once `closed_at` is older than `monitoring.closed_job_retention_days` (default 90), unless a tracker entry with a status other than `dismissed` references them. Active jobs are deleted only with their source.

#### `job_events`

Append-only history of each job.

| Column | Type | Notes |
|---|---|---|
| `type` | text | `discovered`, `updated`, `closed`, `reopened`, `hidden`, `restored`. |
| `changes` | jsonb | For `updated`: `{ field: { from, to } }`. For a deadline closure: `{ reason: { from: null, to: "deadline passed" } }`. For `hidden`: `{ reason: { from: null, to: <reason> } }`. Otherwise NULL. |

- **Indexes**: `idx_job_events_job` (`job_id, created_at`), `idx_job_events_page` (`career_page_id, created_at`), `idx_job_events_type` (`type, created_at`).
- **Foreign keys**: `job_id` → `jobs` `CASCADE`; `career_page_id` → `career_pages` `CASCADE`.
- **Retention**: removed only with the job.

### 2.4 Matching and alerts

#### `job_matches`

A job that satisfied one user's rules on one list, with the reason. It powers the "Matching" feed and the "why it matched" explanations, and digests read `reasons` from it.

| Column | Type | Notes |
|---|---|---|
| `matched_terms` | text[], default `{}` | The include terms that were found; `{*}` when the rules have no keywords (readers filter `*` out). |
| `reasons` | jsonb | Explanation fragments, for example `[{ field: "title", term: "react" }]`. |

- **Keys**: unique `(user_id, job_id, list_id)` (`unique_job_match`). Indexes `idx_job_matches_user` (`user_id, created_at`), `idx_job_matches_job`, `idx_job_matches_list`.
- **Foreign keys**: `user_id`, `job_id`, `list_id` → `CASCADE`.
- **Lifecycle** (`lib/monitoring/matching.ts`, `lib/companies/service.ts`): written when a scan inserts new jobs; rebuilt for one (user, list) pair when its rules change, when a list is followed, duplicated or restored; added for already-open jobs when a company is added to a list; deleted on unfollow, list trash and company removal. If the table is empty while subscriptions exist, the worker computes every subscription's matches once per process start (the upgrade path from v1, which had no match table).
- **Retention**: no age-based pruning; rows go with their job, list or user.

#### `notification_queue`

Pending email alerts, drained into digests by `lib/notifications/processor.ts`. A row is settled by stamping `sent_at`.

| Column | Type | Notes |
|---|---|---|
| `event_type` | text | Documented as `new`, `updated` or `closed`; only `new` is ever written. |
| `list_id` | uuid | The list the alert is attributed to: of the user's lists that matched, the one with the fastest delivery frequency. Its `digest_frequency` decides when the alert is sent. NULL falls back to the account frequency. |
| `keyword_matched` | text[] | Terms that matched. |
| `sent_at` | ts | NULL while pending. Set when the digest containing the row was accepted by the provider, or when the row is settled without sending (`last_error` then says why). |
| `digest_date` | text | UTC date (`YYYY-MM-DD`) of the digest that delivered the row. |
| `attempts`, `last_attempt_at`, `last_error` | int, ts, text | A failed send is retried after 10 minutes × 2^(attempts − 1), at most 320 minutes; after 5 failed attempts the rows are settled as given up. |

- **Keys**: unique `(user_id, job_id, event_type)` (`unique_user_job_event`), so a user gets at most one alert row per job. Indexes `idx_notification_queue_pending` (`user_id, sent_at`), `idx_notification_queue_list`, `idx_notification_queue_unsent` (partial on `created_at` `WHERE sent_at IS NULL`).
- **Foreign keys**: `user_id` → `users` `CASCADE`; `job_id` → `jobs` `CASCADE`; `list_id` → `lists` `SET NULL`.
- **Settled without sending** when: the recipient is suspended or has turned alert email off; the job closed or was hidden before delivery; delivery failed 5 times; the list was trashed or unfollowed, or the company was removed from it, before delivery; staff hid the job or cleared the queue; the row is older than 14 days.
- **Held** (left pending) while: the address waits for approval, the digest slot is not due yet, the daily sending allowance is used up, cohort staggering defers the user, email delivery is not configured, or `notifications.enabled` is off.
- **Retention**: unsent rows created more than 14 days ago are settled with `last_error = 'Expired: not deliverable within 14 days'`; settled rows are deleted 90 days after `sent_at`.

### 2.5 Notifications

#### `notifications`

The in-app notification centre.

| Column | Type | Notes |
|---|---|---|
| `type` | text | `job_match`, `job_updated`, `source_failed`, `source_recovered`, `list_invite`, `contribution`, `reminder`, `system`. |
| `title`, `body` | text | Truncated by the application to 200 and 500 characters. |
| `link` | text | Site-relative path. |
| `data` | jsonb | Extra context, for example `{ careerPageId, count }`. |
| `dedupe_key` | text | Makes creation idempotent per user, for example `match:<careerPageId>:<YYYY-MM-DDTHH>`, `source_failed:<id>:<day>`, `reminder:<entryId>`, `invite:<id>:<token>`. |
| `read_at` | ts | NULL while unread. |

- **Keys**: unique `(user_id, dedupe_key)` (`unique_notification_dedupe`); rows with a NULL key are not constrained. Indexes `idx_notifications_user` (`user_id, created_at`), `idx_notifications_unread` (partial on `user_id` `WHERE read_at IS NULL`).
- **Foreign keys**: `user_id` → `users` `CASCADE`.
- **Retention**: deleted 60 days after `created_at`, read or not.

### 2.6 Monitoring queue and workers

#### `monitor_tasks`

The scan queue (`lib/monitoring/queue.ts`). Workers claim rows with `FOR UPDATE SKIP LOCKED`, so any number of workers can drain it without scanning a source twice.

| Column | Type | Notes |
|---|---|---|
| `trigger` | text, default `schedule` | `schedule`, `manual`, `retry`, `onboarding`. |
| `priority` | int | `manual` 100, `onboarding` 80, `retry` 50, `schedule` the source's own priority. Claimed highest first. |
| `status` | text, default `queued` | `queued`, `running`, `succeeded`, `failed`, `cancelled`. |
| `force` | bool | Ignore the "nothing changed" shortcuts. |
| `attempts`, `max_attempts` | int, int default 2 | `attempts` grows at each claim. |
| `run_after` | ts | Not claimable before this time. |
| `locked_by`, `lease_expires_at` | text, ts | The claiming worker id and a 10-minute lease. An expired lease is returned to the queue (with `run_after` one minute later) while attempts remain, otherwise the task fails with class `timeout`. |
| `error`, `error_class`, `result` | text, text, jsonb | Failure text and class, or the scan summary (`outcome`, `adapter`, job counts, `durationMs`). |
| `requested_by` | uuid | User or staff member who asked for a manual scan. |

- **Keys**: partial unique index `unique_active_task_per_page` on `career_page_id` `WHERE status IN ('queued', 'running')`: at most one active task per source. Indexes `idx_monitor_tasks_claim` (`status, run_after, priority`), `idx_monitor_tasks_page` (`career_page_id, enqueued_at`), `idx_monitor_tasks_finished`.
- **Foreign keys**: `career_page_id` → `career_pages` `CASCADE`; `requested_by` → `users` `SET NULL`.
- **Retention**: finished tasks (`succeeded`, `failed`, `cancelled`) are deleted 7 days after `finished_at`.

#### `scrape_logs`

One row per scan attempt: the durable scan history of a source.

| Column | Type | Notes |
|---|---|---|
| `success` | bool | false only for failed scans. |
| `suspicious` | bool | The anti-spike guard fired: at least 5 open jobs and more than 80% of them missing in one scan. Closures are held back until the same thing has been seen on 3 consecutive scans. |
| `outcome` | text | `success`, `unchanged`, `suspicious`, `failed`. (`skipped` is defined in `lib/constants.ts` but never written.) 0004 derived it for older rows. |
| `trigger` | text | Copied from the task. |
| `adapter`, `http_status`, `error_class`, `error_message` | | `error_message` also carries notes on successful scans (anti-spike, truncated list). |
| `jobs_found`, `jobs_added`, `jobs_removed`, `jobs_updated`, `jobs_reopened` | int | Per-scan counts. |
| `task_id` | uuid | The `monitor_tasks` row, if any. No foreign key (tasks are pruned after 7 days). |
| `worker_id`, `scraper_version` | text | `scraper_version` is `2.0.0` for v2 scans; the column default `1.0.0` marks older rows. |

- **Indexes**: `idx_scrape_logs_page_time` (`career_page_id, scraped_at`), `idx_scrape_logs_time` (`scraped_at`).
- **Foreign keys**: `career_page_id` → `career_pages` `CASCADE`.
- **Retention**: deleted once older than `monitoring.scan_log_retention_days` (default 30).

#### `worker_heartbeat`

One row per worker id that has run a cycle. Read by `/api/health` and the admin monitoring screen.

| Column | Type | Notes |
|---|---|---|
| `id` | text, primary key | `WORKER_ID` (default `default`) for the loop worker and `npm run worker:once`; `<WORKER_ID>-inline` for `WORKER_MODE=inline`; `<WORKER_ID>-cron` for `/api/cron/tick`; `<WORKER_ID>-manual` for the admin "run cycle" button. The GitHub Actions workflow sets `WORKER_ID=github-actions`. |
| `heartbeat_at` | ts | Refreshed at each cycle, and by a running loop every 30 seconds (or every poll interval, if shorter). |
| `stats` | jsonb | The last cycle report, including `mode` (`loop`, `once`, `cron`, `manual`), which decides how stale the row may be before the worker counts as dead. |
| `last_error`, `started_at`, `cycle_started_at` | | |

- **Retention**: never pruned. Rows of retired worker ids stay and show as not alive.

### 2.7 Email

#### `sent_email_logs`

One row per send attempt by `lib/email/send.ts`, including messages handled by the console provider and messages that could not be sent because no provider is configured.

| Column | Type | Notes |
|---|---|---|
| `recipient_email` | text | Lower-cased. |
| `subject` | text | First 300 characters. |
| `template_type` | text, default `general` | `otp`, `digest`, `invite`, `reset`, `welcome`, `broadcast`, `test`, `reminder`, `general`. |
| `status` | text, default `sent` | Outcome of the API call: `sent` or `failed`. (`skipped` is documented and filterable but never written.) |
| `delivery_status`, `delivery_updated_at` | text, ts | From the Brevo webhook: `delivered`, `bounced`, `deferred`, `blocked`, `complained`. |
| `provider_message_id` | text | Brevo's message id (or `console-<ms>` for the console provider); the webhook matches on it. |
| `attempts` | int, default 1 | Brevo calls made: up to 3, retried after a 5xx, a 429, a timeout or a network error. |
| `html_content` | text | The body, stored only while `email.store_bodies` is on and never for `otp`, `reset` and `invite` (their bodies hold codes or access links). 0004 removed such bodies stored by older versions. |
| `sender_id` | uuid | The staff member who sent a test or broadcast, or the inviter of an invitation. |
| `metadata` | jsonb | Includes `provider`; digests add job and list counts. |

- **Indexes**: `idx_sent_email_recipient`, `idx_sent_email_template`, `idx_sent_email_created`, `idx_sent_email_status` (`status, created_at`), `idx_sent_email_message` (`provider_message_id`).
- **Foreign keys**: `user_id` → `users` `SET NULL`; `sender_id` → `users` `SET NULL`.
- **Uses**: the daily sending count (rows since 00:00 UTC), the "send the welcome email once" check, the admin email screens.
- **Retention**: deleted once older than `email.log_retention_days` (default 90).

#### `email_approvals`

Allow-list of addresses that may receive alert email when `email.auto_approve_enabled` is off (the default, so approval is required out of the box).

| Column | Type | Notes |
|---|---|---|
| `email` | text, unique (`email_approvals_email_unique`) | The key; matched to `users.email` as text. |
| `user_id` | uuid | The account last associated with the address. |
| `status` | text, default `pending` | `pending`, `approved`, `unapproved`. |
| `requested_at`, `approved_at`, `approved_by` | ts, ts, uuid | |

- **Foreign keys**: `user_id` → `users` `SET NULL`; `approved_by` → `users` `SET NULL`.
- **Writes**: a row is created (or its `user_id` updated) when an account verifies its email, signs in with Google, resets its password or is verified by staff. A new row is approved at once when auto-approval is on, and always for `ADMIN_BOOTSTRAP_EMAIL`; a pending row is approved when auto-approval has since been switched on. Staff approve or revoke addresses, including addresses with no account.
- **Retention**: the application deletes the row for an address when its account is deleted. Otherwise never pruned.

### 2.8 Platform settings and audit

#### `feature_flags`

Key/value store for every platform setting (`lib/settings/registry.ts`, `lib/settings/store.ts`).

| Column | Type | Notes |
|---|---|---|
| `key` | text, primary key | A registry key such as `auth.signup_enabled` or `monitoring.closed_job_retention_days`. |
| `value` | jsonb | The value. Reads coerce it to the registry type and fall back to the default when it does not fit; a missing row means the default. |
| `description` | text | Copied from the registry on first write. |
| `updated_at`, `updated_by` | ts, uuid | Last change. |

- **Foreign keys**: `updated_by` → `users` `SET NULL`.
- **Notes**: values are cached for 30 seconds per process. The application writes only registry keys (validated); migration 0004 wrote one directly. Settings used by retention: `monitoring.closed_job_retention_days` (default 90, range 7-730), `monitoring.scan_log_retention_days` (30, 3-365), `email.log_retention_days` (90, 7-730), `email.store_bodies` (false).

#### `admin_audit_log`

Append-only record of administrative and security-relevant actions (`lib/audit.ts`). No API route updates or deletes rows.

| Column | Type | Notes |
|---|---|---|
| `admin_id` | uuid | The actor; NULL for actions run by the system or the `npm run admin:grant` CLI, and after the actor's account is deleted. |
| `actor_email`, `actor_role` | text | Snapshots, so the trail stays readable after the account is gone. |
| `action` | text | For example `user.suspend`, `source.delete`, `settings.update` (list in `AUDIT_ACTIONS`). Pre-v2 strings are still displayed. |
| `target_type`, `target_id` | text | `user`, `source`, `job`, `list`, `task`, `setting`, `issue`, `email`, `audit_log`; `target_id` is text (a uuid or a setting key). |
| `metadata` | jsonb | Before and after values, reasons, counts. |
| `ip_address`, `user_agent` | text | `user_agent` truncated to 300 characters. |

- **Indexes**: `idx_audit_created`, `idx_audit_action` (`action, created_at`), `idx_audit_target` (`target_type, target_id`), `idx_audit_actor` (`admin_id, created_at`).
- **Foreign keys**: `admin_id` → `users` `SET NULL`.
- **Retention**: never pruned.

### 2.9 Others

#### `user_jobs`

The application tracker: a user's saved, dismissed and applied-to jobs, and jobs added by hand.

| Column | Type | Notes |
|---|---|---|
| `job_id` | uuid | NULL for entries added by hand, and for entries whose job was deleted. |
| `status` | text, default `saved` | `saved`, `applied`, `interviewing`, `offer`, `rejected`, `withdrawn`, `dismissed` (`dismissed` hides the job from the user's feed and is excluded from the tracker view). |
| `applied_at`, `reminder_at`, `reminder_sent_at` | ts | A due reminder is stamped `reminder_sent_at` first, then announced in-app and by email (if alert email is on); at most 200 per worker cycle. |
| `snapshot` | jsonb, not null | `{ title, companyName, url, location, companyId? }`, so the entry stays meaningful after the job or company disappears. |

- **Keys**: unique `(user_id, job_id)` (`unique_user_job`). Postgres treats NULLs as distinct, so any number of entries with `job_id` NULL are allowed. Indexes `idx_user_jobs_user_status` (`user_id, status`), `idx_user_jobs_reminder` (`reminder_at`).
- **Foreign keys**: `user_id` → `users` `CASCADE`; `job_id` → `jobs` `SET NULL`.
- **Limits**: hand-added entries are refused once a user has 2,000 rows.
- **Retention**: never pruned; removed by the user or with the user. A non-dismissed entry keeps its closed job from being deleted by retention.

#### `reported_issues`

Problem reports and feedback from `POST /api/issues`.

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | The reporter's account, if signed in. |
| `reporter_email`, `reporter_name` | text | Contact details (the account email when signed in). |
| `category` | text, default `general` | `broken_url`, `scraper_bug`, `ui_bug`, `feature_request`, `general`. |
| `target_url` | text | Kept only if http(s). |
| `status` | text, default `open` | `open`, `in_progress`, `resolved`, `closed`. |
| `priority` | text, default `medium` | `low`, `medium`, `high`, `critical`. |
| `admin_notes`, `resolved_at`, `resolved_by` | | `resolved_at`/`resolved_by` are set for `resolved` and `closed` and cleared otherwise. |

- **Indexes**: `idx_reported_issues_status`, `idx_reported_issues_category`.
- **Foreign keys**: `user_id` → `users` `SET NULL`; `resolved_by` → `users` `SET NULL`.
- **Retention**: never pruned; staff delete issues.

#### `subscriptions` (legacy)

v1's per-source keyword subscriptions (`user_id`, `career_page_id`, `positive_keywords`, `negative_keywords`, `is_active`). Superseded by `list_subscriptions`. No code reads or writes it; it is kept so existing rows are preserved.

- **Keys**: unique `(user_id, career_page_id)` (`unique_user_career_page_sub`); index `idx_subscriptions_career_page`.
- **Foreign keys**: `user_id` → `users` `CASCADE`; `career_page_id` → `career_pages` `CASCADE`.

#### `schema_migrations`

Created by the migration runner, not described in `schema.ts` (`db:check` ignores it).

| Column | Type | Notes |
|---|---|---|
| `name` | text, primary key | Migration file name, for example `0005_verification_and_directory.sql`. |
| `checksum` | text | SHA-256 of the file content with CRLF normalised to LF. |
| `applied_at` | ts, default `now()` | |
| `execution_ms` | int | Time the file took. |

---

## 3. What deletes what

Foreign-key delete rules decide most of what happens when a row goes. The application adds a few explicit steps, noted below.

**Deleting a user** (`DELETE /api/me`, or staff with `users.delete`):

- The application first deletes the `email_approvals` row for the address (it is keyed by email, not by user).
- `CASCADE`: `refresh_tokens`, `oauth_accounts`, `email_verifications`, `password_resets`, the user's own `lists` (and through them everything under "deleting a list"), their `list_subscriptions`, `list_collaborators` memberships, `job_matches`, `user_jobs`, `notification_queue`, `notifications` and legacy `subscriptions`.
- `SET NULL`: `career_pages.created_by`, `list_career_pages.added_by`, `list_collaborators.invited_by`, `list_contributions.contributor_user_id`, `jobs.hidden_by`, `monitor_tasks.requested_by`, `sent_email_logs.user_id` and `sender_id`, other `email_approvals` rows' `user_id` and `approved_by`, `feature_flags.updated_by`, `admin_audit_log.admin_id` (the actor's email and role remain), `reported_issues.user_id` and `resolved_by`.

**Deleting a list permanently** (staff purge from the trash, or the owner's account being deleted):

- `CASCADE`: `list_career_pages`, `list_subscriptions` (every follower's), `list_collaborators`, `list_contributions`, `job_matches` of the list.
- `SET NULL`: `notification_queue.list_id`, `lists.parent_list_id` of copies.
- The shared `career_pages` and their jobs are not affected.
- The usual way a list goes is the trash (`lists.deleted_at`): the application deletes the list's `job_matches` and settles its pending `notification_queue` rows, and keeps everything else for a restore.

**Deleting a career page** (staff with `sources.delete`):

- `CASCADE`: `jobs` (and through them `job_events`, `job_matches`, `notification_queue`), `job_events`, `list_career_pages`, `monitor_tasks`, `scrape_logs`, legacy `subscriptions`.
- `SET NULL` through the jobs: `user_jobs.job_id`. Tracker entries keep their snapshot and show as "removed".

**Deleting a job** (closed-job retention, or through its source):

- `CASCADE`: `job_events`, `job_matches`, `notification_queue`.
- `SET NULL`: `user_jobs.job_id`.

To check the delete rules on a live database (the schema check does not):

```sql
SELECT conrelid::regclass AS table_name, conname, confdeltype
FROM pg_constraint
WHERE contype = 'f' AND connamespace = 'public'::regnamespace
ORDER BY 1, 2;
-- confdeltype: c = CASCADE, n = SET NULL, a = NO ACTION, r = RESTRICT, d = SET DEFAULT
```

---

## 4. Retention

Daily housekeeping (`runDailyHousekeeping` in `lib/monitoring/housekeeping.ts`) and a few per-cycle tasks enforce these rules:

| Table | Rule | When | Code |
|---|---|---|---|
| `jobs` | Delete closed jobs whose `closed_at` is older than `monitoring.closed_job_retention_days` (default 90), unless a `user_jobs` row with status other than `dismissed` references them | Daily | `runDailyHousekeeping` |
| `jobs` | Close active jobs whose `deadline_at` has passed, with a `closed` event (not a deletion) | Every cycle | `closeExpiredJobs` |
| `scrape_logs` | Delete rows older than `monitoring.scan_log_retention_days` (default 30) | Daily | `runDailyHousekeeping` |
| `sent_email_logs` | Delete rows older than `email.log_retention_days` (default 90) | Daily | `runDailyHousekeeping` |
| `monitor_tasks` | Delete succeeded, failed and cancelled tasks finished more than 7 days ago | Daily | `pruneFinishedTasks` (`lib/monitoring/queue.ts`) |
| `notification_queue` | Settle unsent rows created more than 14 days ago; delete settled rows whose `sent_at` is more than 90 days old | Daily | `pruneNotificationQueue` (`lib/notifications/processor.ts`) |
| `notifications` | Delete rows older than 60 days, read or not | Daily | `pruneNotifications` (`lib/notifications/inapp.ts`) |
| `refresh_tokens` | Delete rows expired more than 7 days ago or revoked more than 30 days ago | Daily | `runDailyHousekeeping` |
| `email_verifications` | Delete rows whose `expires_at` is more than 7 days ago | Daily | `runDailyHousekeeping` |
| `password_resets` | Delete rows whose `expires_at` is more than 7 days ago | Daily | `runDailyHousekeeping` |

Nothing prunes: `users` (including accounts that never verified), `lists` (including the trash), `list_career_pages`, `list_subscriptions`, `list_collaborators` (including expired and declined invitations), `list_contributions`, `career_pages` (including sources nobody watches), `job_events` and `job_matches` (they go only with their parents), `user_jobs`, `email_approvals`, `feature_flags`, `admin_audit_log`, `reported_issues`, `oauth_accounts`, `worker_heartbeat`, `subscriptions`, `schema_migrations`.

**When "daily" runs.** `runCycle` (`lib/monitoring/scheduler.ts`) calls the housekeeping when more than 24 hours have passed since the last run in the same process. The timestamp lives in process memory, so each new process runs it on its first cycle: with the GitHub Actions workflow (`npm run worker:once` every 3 hours in a fresh process) it runs every 3 hours. Each step is a set-based statement, so running it more often is harmless. If a step throws, the remaining steps are skipped until the next run and the error is logged; the cycle itself continues.

Outside housekeeping, the application also deletes rows as part of user actions: verification rows on successful verification, other reset tokens on a reset, matches on unfollow, trash, company removal and rule changes (then rebuilt), collaborator rows on removal, notifications on request, issues by staff, and the approval row on account deletion.

---

## 5. Migrations

### 5.1 Files

```
drizzle/
  0003_schema_v2.sql                    idempotent "ensure" of the full v2 schema
  0004_v2_data.sql                      data adjustments for v2
  0005_verification_and_directory.sql   sign-up verification columns, featured lists, onboarding back-fill
  legacy/                               0000-0002 and drizzle-kit metadata; never executed
```

`lib/db/schema-version.ts` exports `LATEST_MIGRATION = '0005_verification_and_directory.sql'`.

### 5.2 How migrations run

**Command.** `npm run db:migrate` runs `scripts/migrate.ts`, which loads the same `.env*` files as Next.js and connects to `MIGRATION_DATABASE_URL`, falling back to `DATABASE_URL`. It prints the target as `host:port/database` (never the credentials). `npm run db:migrate -- --dry` (or `--dry-run`) lists what would be applied and changes nothing.

**Runner** (`lib/db/migrate.ts`):

1. Opens one dedicated connection (`max: 1`, `prepare: false`).
2. Creates `schema_migrations` if it does not exist (skipped in a dry run).
3. Lists files directly inside `drizzle/` whose names match `^\d{4}_.+\.sql$`, sorted by name. Subdirectories, `drizzle/legacy` included, are never read.
4. For each file, computes a SHA-256 checksum of its content with CRLF normalised to LF.
5. A file already recorded in `schema_migrations` is skipped. If its checksum differs from the recorded one, a warning is printed (`has changed since it was applied`); the file is not run again and the run does not fail.
6. Each pending file runs in its own transaction: `pg_advisory_xact_lock(874512003)`, a re-check that no other process applied it while this one waited, the whole file sent as one simple-protocol query (so it may hold many statements), then the `schema_migrations` row. Any error rolls back that file and stops the run with exit code 1. Files applied earlier in the same run stay applied.

Two deploys migrating at the same time therefore apply each file once: the second waits on the lock, then finds the row and skips the file.

**Connections.** On Supabase, `DATABASE_URL` can point at the transaction pooler (port 6543) for the application, and `MIGRATION_DATABASE_URL` should point at the direct or session-mode connection (port 5432), as `scripts/migrate.ts` and `.env.example` advise (see [section 7](#7-notes-and-caveats) for a conflicting code comment).

**Production start.** `npm start` runs `scripts/start.js`, which runs `scripts/migrate.ts` first unless `SKIP_MIGRATIONS=true`. If migrations fail, it refuses to start the web server or the worker. Then it starts `next start` and, with `WORKER_MODE=separate` (the default), the worker process.

**Worker guard.** Before its first cycle in a process, the worker checks that `schema_migrations` contains `LATEST_MIGRATION` (`schemaIsCurrent` in `lib/db/schema-version.ts`). Until it does, every cycle is skipped and reports `skipped: "The database is missing migration <name>…"`, so a separately deployed worker never runs against a database the code does not match. The web server does not perform this check.

**Tests.** `npm run test:integration` (and `npm test`) refuses any database whose name does not end in `_test`, drops and recreates its `public` schema, then applies every migration from scratch (`tests/helpers/setup-db.ts`).

### 5.3 `0003_schema_v2.sql`: idempotent "ensure"

Until v2, production was managed with `drizzle-kit push`, so the numbered files no longer described what was deployed. 0003 does not assume any starting state. Every statement creates what is missing and leaves what exists:

1. `CREATE TABLE IF NOT EXISTS` for all 26 tables, with primary keys, defaults and inline unique constraints.
2. `ALTER TABLE … ADD COLUMN IF NOT EXISTS` for every column of every table, with its type, default and NOT NULL, to complete tables that already existed with fewer columns.
3. The 8 named unique constraints, each added in a `DO` block only if no constraint of that name exists.
4. All 43 foreign keys through a session-temporary helper, `pg_temp.jp_ensure_fk(table, column, ref_table, ref_column, on_delete, name)`. For each single-column foreign key already on that column, it keeps the first one whose delete rule matches and drops every other one; if none matched, it adds the key under the given name. This replaced legacy foreign keys that had no delete rule, which made it impossible to delete a user who had ever approved an email, resolved an issue or written an audit entry.
5. `CREATE [UNIQUE] INDEX IF NOT EXISTS` for all 73 indexes, including the partial ones.

It never drops a table or a column and contains no `UPDATE` or `DELETE`. It does drop and re-create foreign-key constraints whose delete rule differs. On an empty database it builds the whole v2 schema. It does not include what 0005 adds (`email_verifications.code_hash`, `pending_password_hash`, `pending_name`, `lists.featured_at`, `idx_list_featured`). The file is generated from `lib/db/schema.ts` and must not be edited.

### 5.4 `0004_v2_data.sql`: data adjustments

Each statement only touches rows that still need the change, so the file is safe to run again. In order:

| Group | Statement | What changes in existing data |
|---|---|---|
| 1 | `UPDATE scrape_logs` (two statements) | Fills the new `outcome` where NULL: `failed` if `success` is false, `suspicious` if flagged, `unchanged` if `error_message` starts with "Content unchanged", otherwise `success`. Then clears "Content unchanged…" from `error_message` on successful rows. |
| 2 | `UPDATE career_pages` (four statements) | Normalises adapter names: `ollama_*` becomes `ai`; `playwright_browser` becomes `browser`; `generic` and `api_detectors` become `generic_html`; with matching `scrape_method`. Sets `scrape_method = 'api'` for Greenhouse, Lever, Ashby, Workday and SmartRecruiters sources. |
| 3 | `UPDATE career_pages` | Recomputes `active_job_count` from active, non-hidden jobs where it differs. |
| 4 | `UPDATE career_pages` (two statements) | Seeds `last_jobs_found` and `last_duration_ms` from the latest successful, changed scan where `last_jobs_found` is NULL; seeds `last_error` and `last_failure_at` from the latest failed scan for sources with failures and no `last_error`. |
| 5 | `UPDATE jobs` | Sets `updated_at = last_seen_at` where `updated_at` was later. |
| 6 | `UPDATE sent_email_logs` | Sets `html_content` to NULL for `otp`, `reset` and `invite` rows: verification codes, reset links and invite tokens had been stored in clear text and shown in the admin panel. The delivery records stay. |
| 7 | `UPDATE lists` | Removes a `\|EXCLUDED:[…` suffix that the old "master admin list" auto-sync kept in the description (NULL if nothing else remains). The list and its companies are unchanged. |
| 8 | `INSERT INTO list_subscriptions` | Gives the owner of every live list a subscription row if missing, with `alerts_enabled = false`, so nobody starts receiving email they were not getting before. |
| 9 | `UPDATE lists` | Recomputes `follower_count` as subscriptions excluding the owner. |
| 10 | `INSERT INTO feature_flags`, then `DELETE FROM feature_flags` | If the old key `email.enforce_frequency_policy` was `true`, sets `notifications.enforce_frequency` to `true`. Then deletes the `email.enforce_frequency_policy` row whatever its value. |
| 11 | `UPDATE notification_queue` | Settles pending alerts of suspended users (`sent_at = now()`, `last_error = 'Settled during v2 migration: recipient blocked'`); they will never be sent. |

The file's header says no statement deletes a user-facing record. The only `DELETE` removes the obsolete feature-flag row. Group 6 permanently discards the stored bodies of `otp`, `reset` and `invite` emails (other templates keep theirs), and group 11 permanently cancels queued alerts for suspended users.

### 5.5 `0005_verification_and_directory.sql`

| Group | Statement | What changes in existing data |
|---|---|---|
| 1 | `ALTER TABLE email_verifications ADD COLUMN IF NOT EXISTS` (3) | Adds `code_hash`, `pending_password_hash`, `pending_name` for the ticket-plus-code flow. |
| 1 | `DELETE FROM email_verifications WHERE used_at IS NULL` | Deletes every unused verification row. Codes issued before used an unsalted SHA-256 the new flow cannot check. Because current code never sets `used_at`, this removes every pending sign-up at deploy time: those people must register again (or sign in, if their password was stored on the account by the old flow) to get a new code. |
| 2 | `ALTER TABLE lists ADD COLUMN IF NOT EXISTS featured_at`, `CREATE INDEX IF NOT EXISTS idx_list_featured` | Staff can feature public lists. |
| 3 | `UPDATE users SET onboarding_completed_at = created_at` | For every verified account without it, so only accounts created from then on see the onboarding steps. |

### 5.5b `0006_v1_frequency_defaults.sql`

Added after comparing an upgraded copy of the v1 development database with a freshly built v2 database: `list_subscriptions.digest_frequency` was the only column whose default differed (`'instant'` instead of `'inherit'`), and every existing subscription held `'instant'`.

| Statement | What changes in existing data |
|---|---|
| `ALTER TABLE list_subscriptions ALTER COLUMN digest_frequency SET DEFAULT 'inherit'` | New subscriptions created without an explicit frequency use the account's schedule. |
| `UPDATE list_subscriptions SET digest_frequency = 'inherit' WHERE digest_frequency IN ('instant', '')` | v1's own notes call `'instant'` dead data the processor never read; v2 reads it as "send immediately". Without this, every user would have switched from their digest schedule to one email per match. v2 stores an explicit "as soon as a job is found" choice as `'realtime'`, which is not touched. |
| `UPDATE users SET last_digest_sent_at = …` from sent `digest` emails, where it is NULL | The schedule continues from each user's real last digest instead of treating everyone as never delivered. |

After 0006 the upgraded copy and a fresh v2 database have identical columns, types, nullability and defaults.

### 5.6 Why 0000-0002 live in `drizzle/legacy`

`drizzle/legacy/` holds `0000_worried_speedball.sql` (15 tables), `0001_worker_heartbeat.sql`, `0002_digest_schedule.sql` and drizzle-kit's `meta/` journal and snapshot. They are kept for history only:

- The production database was later managed with `drizzle-kit push`, so they no longer match any real database.
- They cannot build a working schema: `0002` alters `list_subscriptions` and reads `sent_email_logs`, which none of them create.
- 0003 reconciles any database, empty or not, so nothing needs them.

The runner reads only files directly in `drizzle/`, so files in `legacy/` are never executed. The numbering continues at 0003 so the history reads in order.

### 5.7 Adding a migration

1. Change `lib/db/schema.ts`.
2. Add `drizzle/NNNN_short_description.sql` with the next number (`0007_…` at the time of writing). Execution order is file-name order; the name must match `^\d{4}_.+\.sql$`.
3. Write the SQL by hand. Prefer statements that are safe to re-run, as 0004 and 0005 do: `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, guarded `DO` blocks, `UPDATE … WHERE <still needs it>`. Start the file with a comment that states what it changes and any data it rewrites or deletes.
4. Remember that the whole file runs in one transaction. Statements that cannot run inside a transaction block fail, for example `CREATE INDEX CONCURRENTLY` and `VACUUM`. `ALTER TABLE` takes locks that block reads and writes on that table until the transaction commits, so keep data rewrites on large tables short or batch them across migrations.
5. Update `LATEST_MIGRATION` in `lib/db/schema-version.ts` to the new file name, in the same commit. `tests/unit/config.test.ts` fails if it does not equal the last file in `drizzle/`, and workers skip every cycle until the database contains that migration.
6. Never edit a migration that has been applied anywhere: the runner will not run it again and only prints a checksum warning. Add a new file instead.
7. Do not use `drizzle-kit push` against a shared database: it bypasses `schema_migrations`. Do not commit `drizzle-kit generate` output as is (see [section 7](#7-notes-and-caveats)).
8. Test it: `npm run test:integration` against a `*_test` database applies every migration to an empty schema, and running `npm run db:migrate` and `npm run db:check` against a restored copy of production checks it on real data.

### 5.8 Verifying

- `npm run db:migrate -- --dry` prints `Database is up to date.` when nothing is pending.
- `npm run db:check` (`scripts/check-schema.ts`) compares `information_schema` with `lib/db/schema.ts` and exits with code 1 on:
  - a missing table or column;
  - a column whose type family differs (`uuid`, `text`, `boolean`, `integer`, `jsonb`, `timestamp with time zone`, `ARRAY`);
  - a column that is NOT NULL in `schema.ts` but nullable in the database;
  - a missing index named in `schema.ts`.

  Extra tables (other than `schema_migrations`) and extra columns are printed as notes and do not fail. It does not check foreign keys or their delete rules (use the query in [section 3](#3-what-deletes-what)), unique constraints declared with `.unique()` (only named indexes), defaults, partial-index predicates, array element types, or columns that are NOT NULL in the database but nullable in `schema.ts`. It connects with `DATABASE_URL` only.
- In SQL: `SELECT name, applied_at, execution_ms FROM schema_migrations ORDER BY name;`
- In the application: Admin > System (`GET /api/admin/system`) lists applied migrations. A worker on an outdated schema logs `[worker] The database is missing migration …`, and `/api/cron/tick` returns that text in `skipped`.

---

## 6. Backup and restore

Migrations have no "down" scripts. The way back from a bad migration is a restore from backup, or a new forward migration. Take a backup immediately before migrating production.

**Before migrating production**

1. See what will run: `npm run db:migrate -- --dry` with `MIGRATION_DATABASE_URL` pointing at production.
2. Take a logical backup with `pg_dump`. Use a `pg_dump` whose major version is the same as or newer than the server's. On Supabase, use the direct or session-mode connection (port 5432), not the transaction pooler. JobPingly uses only the `public` schema; restricting the dump to it leaves out the schemas Supabase manages itself (`auth`, `storage` and others).

   ```sh
   pg_dump "postgresql://USER:PASSWORD@HOST:5432/DB" \
     --format=custom --no-owner --no-privileges \
     --schema=public \
     --file=jobpingly-before-0006.dump
   ```

   Keep the password out of shell history and process lists by using a `~/.pgpass` file or the `PGPASSWORD` environment variable instead of embedding it in the URL.
3. Check that the archive is readable: `pg_restore --list jobpingly-before-0006.dump | head`.
4. Optionally rehearse: restore the dump into a scratch database (below), point `MIGRATION_DATABASE_URL` and `DATABASE_URL` at it, then run `npm run db:migrate` and `npm run db:check`.
5. Migrate at a quiet time. `ALTER TABLE` statements lock their tables for the duration of the file's transaction, and requests or worker cycles that touch those tables wait. To stop scans during the window, pause monitoring (Admin > Monitoring, or the `scraper.enabled` setting) or run the service with `WORKER_MODE=off` and no cron.

Supabase may also keep platform backups or point-in-time recovery, depending on the project's plan. Do not rely on them as the only copy before a schema change.

**Restoring**

Into a new, empty database (recommended; switch the application's URLs afterwards):

```sh
psql "postgresql://USER:PASSWORD@HOST:5432/postgres" -c "CREATE DATABASE jobpingly_restore"
pg_restore --dbname="postgresql://USER:PASSWORD@HOST:5432/jobpingly_restore" \
  --no-owner --no-privileges jobpingly-before-0006.dump
```

Over the existing database (destructive: `--clean` drops every object in the dump before recreating it; stop the web server and the worker first):

```sh
pg_restore --dbname="postgresql://USER:PASSWORD@HOST:5432/DB" \
  --clean --if-exists --no-owner --no-privileges jobpingly-before-0006.dump
```

The dump includes `schema_migrations`, so after a restore the runner knows exactly which migrations the restored data has. Then run `npm run db:migrate` (it applies whatever the restored state lacks) and `npm run db:check`. Deploy code whose `LATEST_MIGRATION` matches the restored database, or the worker will skip its cycles.

---

## 7. Notes and caveats

Things in the code or SQL that are surprising or inconsistent. Each item describes what the code actually does.

1. *(Resolved after this review.)* The runner's comment now matches the scripts: the transaction-scoped lock stays correct behind a pooler, but migrations should use a direct or session connection (port 5432) through `MIGRATION_DATABASE_URL`.
2. **Edited migrations are not detected as errors.** A checksum mismatch on an applied file only prints a warning and the run succeeds (`lib/db/migrate.ts:85-87`).
3. **`db:check` is partial.** It checks tables, columns, type families, NOT NULL in one direction and named indexes, but not foreign keys, delete rules, `.unique()` constraints, defaults or partial-index predicates, and it uses `DATABASE_URL` rather than `MIGRATION_DATABASE_URL` (`scripts/check-schema.ts:30`).
4. **0003 is idempotent but can still fail on a drifted database.** `ADD COLUMN IF NOT EXISTS … NOT NULL` without a default fails if the table has rows and lacks the column (for example `admin_audit_log.action`, `drizzle/0003_schema_v2.sql:475`); adding a foreign key fails if orphan rows exist; adding a unique constraint fails on duplicates. It also does not correct a column that exists with a different type. Because the file runs in one transaction, a failure leaves the database unchanged; fix the data and run it again.
5. **0003 can drop constraints and keeps old names.** `jp_ensure_fk` drops every other single-column foreign key on a column it manages (`drizzle/0003_schema_v2.sql:43-48`), although the header says the migration "never drops" anything (it means tables and columns). An existing key with the right delete rule is kept under its old name, for example legacy 0002's `notification_queue_list_id_fkey`, so constraint names can differ between environments.
6. *(Resolved after this review by `0006_v1_frequency_defaults.sql`.)* 0002's data fixes were not carried forward, and the v1 development copy confirmed the problem: every watchlist subscription still held `'instant'`, so after the upgrade every user would have switched from their digest schedule to one email per match. 0006 changes the column default to `inherit`, rewrites `'instant'`/empty values to `inherit` and seeds `users.last_digest_sent_at` from sent digests, as 0002 intended.
7. **0005 empties pending sign-ups once.** `DELETE FROM email_verifications WHERE used_at IS NULL` (`drizzle/0005_verification_and_directory.sql:13`) removes every row at upgrade time, because current code deletes rows on success instead of setting `used_at` (`lib/auth/verification.ts:140-142`). The migration runs once, so this only affects v1 sign-ups in progress during the deploy; those people sign in with their password and receive a new code.
8. **0004's header undersells its effects.** "None of them deletes a user-facing record" is true, but group 6 discards the stored bodies of sign-in, reset and invitation emails and group 11 permanently settles (cancels) queued alerts of suspended users (`drizzle/0004_v2_data.sql:78-81,124-127`).
9. **Documented values that are never used.** `users.notification_settings` lists `closedJobs` and `productUpdates` (`lib/db/schema.ts:63`), which nothing reads. `notification_queue.event_type` documents `updated` and `closed`, but only `new` is written (`lib/monitoring/matching.ts:163`). `scrape_logs.outcome = 'skipped'` and `sent_email_logs.status = 'skipped'` are never written.
10. **Write-only or unused data.** `oauth_accounts` is written on every Google sign-in and never read (`lib/auth/accounts.ts:325-328`). `lists.parent_list_id` and `is_canonical` are set on copies and never read. `list_contributions.ats_type` is never set. The legacy `subscriptions` table is neither read nor written. `scrape_logs.task_id` has no foreign key. `idx_refresh_tokens_hash` duplicates the unique index on `refresh_tokens.token_hash`.
11. **Some tables grow without bound.** `admin_audit_log`, trashed `lists`, unverified `users`, unwatched `career_pages`, expired or declined `list_collaborators` rows and `worker_heartbeat` rows of retired worker ids are never pruned (`removeWorkerRecord`, `lib/monitoring/scheduler.ts:362`, has no caller).
12. **Several audit actions are declared but never written**: `auth.login_blocked`, `source.bulk`, `list.bulk`, `email.logs_prune`, `email.frequency_policy` (`lib/audit.ts:16,37,49,66,68`).
13. **"Daily" housekeeping is per process.** The 24-hour timer lives in memory (`lib/monitoring/scheduler.ts:249-251`), so every new process runs housekeeping on its first cycle; with `worker:once` every 3 hours it runs every 3 hours.
14. *(Resolved after this review.)* Deleting an account (by its owner or an admin) now settles followers' pending alerts for the lists that disappear with it (`cancelAlertsForOwnedLists` in `lib/users/service.ts`), instead of leaving them queued with `list_id` set to NULL. Covered by an integration test.
15. **`drizzle-kit generate` would write into `drizzle/`.** `drizzle.config.ts` sets `out: './drizzle'`, while the only drizzle-kit journal is in `drizzle/legacy/meta`. Generating would likely treat the schema as new and write a full, non-idempotent `CREATE TABLE` file (and a `meta/` folder) next to the real migrations. Write migrations by hand.
