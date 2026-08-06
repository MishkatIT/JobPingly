# Career Page Monitor --- Complete System Architecture

**Architecture version:** V1 / MVP\
**Hosting:** Render\
**Database:** Supabase PostgreSQL\
**Authentication:** Custom JWT\
**Primary stack:** Next.js, TypeScript, Drizzle ORM, Cheerio, Resend

------------------------------------------------------------------------

## 1. Product Overview

Career Page Monitor is a SaaS application that lets users follow company
career pages instead of manually checking them every day.

A user can:

-   Create an account and log in.
-   Create one or more **job watch lists**.
-   Add company career-page URLs to a list.
-   Make a list **private** or **public**.
-   Browse public lists created by other users.
-   Let the system periodically check the saved career pages.
-   Detect newly posted and removed jobs.
-   Filter alerts using job-related keywords.
-   Receive a daily email digest when matching jobs appear.
-   View historical job activity from the dashboard.

The main product advantage is not only job alerts. Because job history
is stored over time, the platform can later provide hiring intelligence
such as hiring frequency, hiring velocity, job lifetime, and company
hiring patterns.

------------------------------------------------------------------------

## 2. Core V1 Scope

Build the following first:

1.  Email/password registration and login.
2.  Google OAuth login.
3.  Custom JWT authentication.
4.  User dashboard.
5.  Create, edit, delete, and view job watch lists.
6.  Public/private visibility for each list.
7.  Public-list discovery section.
8.  Add a career-page URL directly into a selected list.
9.  URL normalization and deduplication.
10. Greenhouse adapter.
11. Lever adapter.
12. Generic static HTML scraping with Cheerio.
13. JSON-LD / structured-data extraction where available.
14. Job fingerprinting.
15. New/removed job detection.
16. Positive keyword filters.
17. Job history.
18. Daily email digest.
19. Scraper health/error status.
20. Admin dashboard.
21. Feature flags.
22. Admin audit logs.
23. Render background-worker scheduling.
24. Render deployment.

### Deferred from V1

-   Full Playwright/browser scraping.
-   Advanced AI matching.
-   Application tracker.
-   Advanced hiring analytics.
-   Instant email alerts.
-   Full job-description extraction for every site.
-   Complex semantic search.
-   WhatsApp/Telegram notifications.
-   Company recommendation engine.

------------------------------------------------------------------------

## 3. Final Technology Stack

  -----------------------------------------------------------------------
  Layer                 Technology            Purpose
  --------------------- --------------------- ---------------------------
  Frontend              Next.js App Router    UI, dashboard, public lists

  Backend               Next.js Route         REST/API endpoints
                        Handlers              

  Language              TypeScript            Frontend and backend

  Hosting               Render                Main Next.js application

  Database              Supabase PostgreSQL   Persistent application data

  ORM                   Drizzle ORM           Type-safe database access

  Authentication        Custom JWT            User/admin authentication

  Password hashing      bcryptjs              Password security

  JWT library           jose                  JWT signing and
                                              verification

  OAuth                 Google OAuth          Google sign-in

  Scraping              Cheerio               Static HTML parsing

  ATS integrations      Greenhouse / Lever    Reliable structured job
                        adapters              extraction

  Scheduler             Render Background Worker        Periodic scraper and digest
                                              jobs

  Email                 Resend                Verification/reset/digest
                                              emails

  Queue                 PostgreSQL / pg-boss  Background job coordination
                        approach              

  Testing               Vitest                Unit/integration testing

  Optional later        Playwright            JavaScript-rendered career
                                              pages

  Optional later        Upstash Redis         Rate limiting, locks,
                                              caching
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 4. High-Level Architecture

``` text
                         ┌───────────────────────┐
                         │       Visitors        │
                         └───────────┬───────────┘
                                     │
                     ┌───────────────┴───────────────┐
                     │                               │
                     ▼                               ▼
            ┌─────────────────┐             ┌─────────────────┐
            │  Public Lists   │             │ Login/Register  │
            │  Public Jobs    │             │ Google OAuth    │
            └────────┬────────┘             └────────┬────────┘
                     │                               │
                     └───────────────┬───────────────┘
                                     ▼
                         ┌───────────────────────┐
                         │ Next.js App on Render │
                         │ UI + API + Middleware │
                         └───────────┬───────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
            ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
            │ JWT Auth     │ │ Supabase     │ │ Admin Panel  │
            │ Access/Ref.  │ │ PostgreSQL   │ │ + Flags      │
            └──────────────┘ └──────┬───────┘ └──────────────┘
                                    │
                                    ▼
                         ┌───────────────────────┐
                         │ Render Background Worker   │
                         └───────────┬───────────┘
                                     ▼
                         ┌───────────────────────┐
                         │    Scraper Worker     │
                         └───────────┬───────────┘
                                     ▼
             ┌─────────────────────────────────────────────┐
             │ ATS Detection → Extraction → Normalize →   │
             │ Fingerprint → Diff → DB → Notifications    │
             └─────────────────────┬───────────────────────┘
                                   ▼
                         ┌───────────────────────┐
                         │ Notification Queue    │
                         └───────────┬───────────┘
                                     ▼
                              ┌────────────┐
                              │   Resend   │
                              └────────────┘
```

------------------------------------------------------------------------

## 5. User and List Model

The dashboard is list-oriented.

A user does **not** simply save an isolated career URL. Every followed
career page belongs to at least one user-created list.

Example:

``` text
My Lists
├── Bangladesh Software Companies
│   ├── Pathao Careers
│   ├── Brain Station 23 Careers
│   └── Cefalo Careers
│
├── Remote Backend Jobs
│   ├── Company A Careers
│   └── Company B Careers
│
└── Dream Companies
    ├── Google Careers
    └── Microsoft Careers
```

When the user clicks **Add Career Page**, the form should require:

-   Career-page URL
-   Company name, if automatic detection fails
-   Destination list
-   Optional keywords

The user can create a new list directly from this flow.

------------------------------------------------------------------------

## 6. Public Lists

Every list has a visibility option:

``` text
Visibility
○ Private
● Public
```

### Private list

Only the owner can view and manage it.

### Public list

The list can appear in the public-list directory and can be opened
without authentication.

Example public URL:

``` text
/lists/bangladesh-software-companies
```

A public list can show:

-   List name
-   Description
-   Creator display name
-   Number of companies
-   Number of active jobs
-   Last updated time
-   Companies in the list
-   Current job openings
-   Recently detected openings

Visitors must never receive edit permissions.

### Dashboard public-list section

The user dashboard should contain a section such as:

``` text
Discover Public Lists

Bangladesh Software Companies
42 companies · 128 active jobs

Remote Backend Companies
31 companies · 84 active jobs

Entry-Level Tech Companies
18 companies · 35 active jobs
```

A logged-in user can browse a public list and later the product can
support actions such as copying/following a public list.

------------------------------------------------------------------------

## 7. Authentication Architecture

Use a two-token authentication model.

### Access token

-   JWT.
-   Short-lived: approximately 15 minutes.
-   Contains user ID, email, role, and token type.
-   Used to authorize protected API calls.

### Refresh token

-   Long-lived: approximately 30 days.
-   Random opaque token.
-   Stored in an `HttpOnly`, `Secure`, `SameSite` cookie.
-   Only its SHA-256 hash is stored in PostgreSQL.
-   Can be revoked per session.
-   Rotated when refreshed.

### Authentication flow

``` text
Login
  │
  ▼
Verify email/password
  │
  ▼
Create 15-minute access JWT
  │
  ├──────────────► Return access token
  │
  ▼
Create random refresh token
  │
  ▼
Store refresh-token hash in DB
  │
  ▼
Set raw refresh token as HttpOnly cookie
```

### Refresh flow

``` text
POST /api/auth/refresh
       │
       ▼
Read HttpOnly refresh cookie
       │
       ▼
Hash token
       │
       ▼
Find active DB session
       │
       ▼
Validate expiry/revocation
       │
       ▼
Rotate refresh token
       │
       ▼
Issue new access JWT
```

### Authentication features

-   Email/password registration.
-   Login.
-   Logout.
-   Refresh-token rotation.
-   Email verification.
-   Forgot password.
-   Reset password.
-   Google OAuth.
-   Multiple active sessions.
-   Session revocation.
-   Admin/user roles.

------------------------------------------------------------------------

## 8. Google OAuth

Google OAuth accounts are linked to normal application users.

Flow:

``` text
User → Sign in with Google
     → Google authorization
     → OAuth callback
     → Verify Google identity
     → Find/create local user
     → Link Google provider
     → Mark email verified
     → Issue application access + refresh tokens
     → Dashboard
```

If an existing password user signs in with the same verified Google
email, the Google account can be linked to the existing account instead
of creating a duplicate user.

------------------------------------------------------------------------

## 9. Core Database Schema

### `users`

``` sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    name TEXT,
    avatar_url TEXT,
    google_id TEXT UNIQUE,
    email_verified BOOLEAN DEFAULT false,
    role TEXT NOT NULL DEFAULT 'user'
        CHECK (role IN ('user', 'admin', 'moderator')),
    email_notifications_enabled BOOLEAN NOT NULL DEFAULT true,
    notification_preference TEXT NOT NULL DEFAULT 'daily'
        CHECK (notification_preference IN ('instant', 'daily', 'weekly')),
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### `refresh_tokens`

``` sql
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    device_hint TEXT,
    ip_address TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### `oauth_accounts`

``` sql
CREATE TABLE oauth_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(provider, provider_id)
);
```

### `email_verifications`

``` sql
CREATE TABLE email_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
);
```

### `password_resets`

``` sql
CREATE TABLE password_resets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
);
```

------------------------------------------------------------------------

## 10. List Database Schema

### `lists`

``` sql
CREATE TABLE lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    visibility TEXT NOT NULL DEFAULT 'private'
        CHECK (visibility IN ('private', 'public')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### `list_career_pages`

``` sql
CREATE TABLE list_career_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    career_page_id UUID NOT NULL REFERENCES career_pages(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(list_id, career_page_id)
);
```

This allows the same globally monitored career page to exist in multiple
user lists without scraping the same company separately for every user.

------------------------------------------------------------------------

## 11. Career Page Schema

``` sql
CREATE TABLE career_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL UNIQUE,
    company_name TEXT,
    ats_type TEXT,
    scrape_method TEXT,
    status TEXT DEFAULT 'active',
    last_scraped_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    next_check_at TIMESTAMPTZ,
    consecutive_failures INT DEFAULT 0,
    check_interval_minutes INT DEFAULT 180,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

Possible `ats_type` values:

``` text
greenhouse
lever
ashby
workday
bamboohr
icims
oracle
generic
unknown
```

Possible `scrape_method` values:

``` text
api
html
unsupported
```

------------------------------------------------------------------------

## 12. Subscription and Keyword Schema

A subscription represents a user's monitoring preferences for a career
page.

``` sql
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    career_page_id UUID NOT NULL REFERENCES career_pages(id) ON DELETE CASCADE,
    positive_keywords TEXT[],
    negative_keywords TEXT[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, career_page_id)
);
```

For V1, expose positive keywords in the UI. Negative keywords can remain
available in the schema for later use.

------------------------------------------------------------------------

## 13. Jobs Schema

Never permanently delete a previously detected job.

``` sql
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    career_page_id UUID REFERENCES career_pages(id),
    fingerprint TEXT NOT NULL,
    external_id TEXT,
    title TEXT NOT NULL,
    url TEXT,
    location TEXT,
    job_type TEXT,
    department TEXT,
    status TEXT DEFAULT 'active',
    missed_scrapes INT DEFAULT 0,
    first_seen_at TIMESTAMPTZ DEFAULT now(),
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    closed_at TIMESTAMPTZ,
    raw_data JSONB,
    UNIQUE(career_page_id, fingerprint)
);
```

------------------------------------------------------------------------

## 14. Scrape Logs

``` sql
CREATE TABLE scrape_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    career_page_id UUID REFERENCES career_pages(id),
    scraped_at TIMESTAMPTZ DEFAULT now(),
    success BOOLEAN NOT NULL,
    suspicious BOOLEAN DEFAULT false,
    jobs_found INT,
    jobs_added INT,
    jobs_removed INT,
    duration_ms INT,
    error_message TEXT,
    scraper_version TEXT
);
```

------------------------------------------------------------------------

## 15. Notification Queue

``` sql
CREATE TABLE notification_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    keyword_matched TEXT[],
    created_at TIMESTAMPTZ DEFAULT now(),
    sent_at TIMESTAMPTZ,
    digest_date DATE,
    UNIQUE(user_id, job_id, event_type)
);
```

The unique constraint prevents duplicate notifications for the same
user/job/event combination.

------------------------------------------------------------------------

## 16. Recommended Indexes

``` sql
CREATE INDEX idx_jobs_career_page_status
ON jobs(career_page_id, status);

CREATE INDEX idx_jobs_fingerprint
ON jobs(fingerprint);

CREATE INDEX idx_subscriptions_career_page
ON subscriptions(career_page_id);

CREATE INDEX idx_list_user
ON lists(user_id);

CREATE INDEX idx_list_visibility
ON lists(visibility);

CREATE INDEX idx_list_pages_list
ON list_career_pages(list_id);

CREATE INDEX idx_notification_queue_pending
ON notification_queue(user_id, sent_at)
WHERE sent_at IS NULL;

CREATE INDEX idx_scrape_logs_page_time
ON scrape_logs(career_page_id, scraped_at DESC);

CREATE INDEX idx_refresh_tokens_user
ON refresh_tokens(user_id);

CREATE INDEX idx_refresh_tokens_hash
ON refresh_tokens(token_hash);
```

------------------------------------------------------------------------

## 17. Add Career Page Flow

``` text
User clicks "Add Career Page"
        │
        ▼
Enter career-page URL
        │
        ▼
Select existing list
or create new list
        │
        ▼
Validate URL
        │
        ▼
SSRF protection
        │
        ▼
Normalize URL
        │
        ▼
Follow safe redirect
        │
        ▼
Check if career page already exists globally
        │
   ┌────┴────┐
   │         │
  YES        NO
   │         │
   │         ▼
   │    Detect ATS
   │         │
   │         ▼
   │    Create career_pages row
   │
   ▼
Add page to selected list
        │
        ▼
Create/update user subscription
        │
        ▼
Queue initial scrape
        │
        ▼
Show status in dashboard
```

------------------------------------------------------------------------

## 18. URL Normalization

Before storing a career URL:

-   Allow only `http://` and `https://`.
-   Lowercase the hostname.
-   Remove tracking parameters such as UTM parameters.
-   Normalize trailing slashes.
-   Follow safe redirects.
-   Detect if the user supplied an individual job URL instead of a
    career index.
-   Store the canonical career-page URL where possible.
-   Deduplicate globally.

Example:

``` text
https://company.com/careers/?utm_source=linkedin
```

becomes:

``` text
https://company.com/careers
```

------------------------------------------------------------------------

## 19. SSRF Protection

Because users submit arbitrary URLs and the backend fetches them, SSRF
protection is mandatory.

Block:

-   `localhost`
-   `127.0.0.0/8`
-   `10.0.0.0/8`
-   `172.16.0.0/12`
-   `192.168.0.0/16`
-   `169.254.0.0/16`
-   IPv6 loopback/private/link-local ranges
-   Cloud metadata endpoints
-   Non-HTTP protocols

Also revalidate the destination after redirects.

------------------------------------------------------------------------

## 20. Scraper Pipeline

``` text
Career URL
    │
    ▼
URL Normalizer
    │
    ▼
robots.txt Check
    │
    ▼
HTTP Fetcher
    │
    ▼
ATS Detector
    │
    ├── Greenhouse → Greenhouse adapter
    ├── Lever      → Lever adapter
    ├── Ashby      → adapter later
    ├── Generic    → Cheerio extractor
    └── JS-only    → unsupported in V1
    │
    ▼
Job Normalizer
    │
    ▼
Fingerprinter
    │
    ▼
Differ
    │
    ▼
Safety / Anti-Spike Check
    │
    ▼
Database Writer
    │
    ▼
Notification Event Creator
```

Each stage should be independently testable.

------------------------------------------------------------------------

## 21. ATS Adapter Pattern

``` ts
interface ATSAdapter {
    name: string;
    detect(url: string, html: string): boolean;
    extractJobs(url: string, html: string): Promise<NormalizedJob[]>;
}
```

Recommended initial adapters:

1.  Greenhouse
2.  Lever
3.  Generic HTML

Add other ATS systems later without rewriting the scraper pipeline.

------------------------------------------------------------------------

## 22. Static vs JavaScript-Rendered Pages

Decision flow:

``` text
Fetch page
   │
   ▼
Does HTML contain usable job listings?
   │
 YES ─────► Cheerio
   │
  NO
   ▼
Known ATS?
   │
 YES ─────► ATS adapter/API
   │
  NO
   ▼
Embedded JSON / JSON-LD?
   │
 YES ─────► Parse structured data
   │
  NO
   ▼
Mark as JS-rendered / unsupported for V1
```

Playwright should be a separate worker in a later version because
browser automation is much heavier than normal HTTP scraping.

------------------------------------------------------------------------

## 23. Normalized Job Shape

All adapters should return the same internal structure.

``` ts
type NormalizedJob = {
    externalId?: string;
    title: string;
    url?: string;
    location?: string;
    jobType?: string;
    department?: string;
    rawData?: unknown;
};
```

The rest of the application should not need to know whether a job came
from Greenhouse, Lever, or generic HTML.

------------------------------------------------------------------------

## 24. Job Fingerprinting

Fingerprint priority:

1.  ATS external job ID.
2.  Normalized job URL.
3.  Normalized title + location.
4.  Title only as a last resort.

Do **not** use the complete job description as the primary fingerprint
because descriptions can change without the job being a new opening.

Example:

``` text
ext:123456
```

or:

``` text
url:0af93ab8212d44ef
```

------------------------------------------------------------------------

## 25. New / Removed Job Detection

After a successful scrape:

``` text
scraped = fingerprints found now
stored  = fingerprints currently active

NEW       = scraped - stored
REMOVED   = stored - scraped
UNCHANGED = scraped ∩ stored
```

### New

-   Insert/update job.
-   Set active.
-   Set `first_seen_at`.
-   Create notification events.

### Unchanged

-   Update `last_seen_at`.
-   Reset `missed_scrapes`.

### Missing

Do not close immediately.

Increment `missed_scrapes`.

After 2--3 consecutive successful scrapes where the job remains absent:

-   Mark job `closed`.
-   Set `closed_at`.

This avoids false closures caused by temporary site failures.

------------------------------------------------------------------------

## 26. Anti-Spike Protection

If a scrape suddenly reports that more than approximately 80% of
previously active jobs disappeared, treat the scrape as suspicious.

Possible reasons:

-   Career page HTML changed.
-   Bot protection page returned.
-   Cloudflare challenge.
-   Extractor broke.
-   Partial response.
-   Pagination failed.

In this case:

-   Log the scrape as suspicious.
-   Do not mass-close jobs.
-   Keep previous active state.
-   Surface a warning to administrators.

------------------------------------------------------------------------

## 27. Background Worker and Site Checking

Career-page checking is initiated by the application infrastructure itself

Run a dedicated background worker on Render alongside the Next.js web service. PostgreSQL is the source of truth for scheduling.

```text
Render
├── Web Service
│   ├── Next.js frontend
│   ├── API routes
│   ├── JWT authentication
│   └── Admin dashboard
│
└── Background Worker
    ├── Scheduler loop
    ├── Career-page checker
    ├── ATS adapters
    ├── Generic extractor
    ├── Job differ
    └── Notification processor
          │
          ▼
   Supabase PostgreSQL
```

### Due-page scheduling

Each career page stores `last_scraped_at`, `next_check_at`, status, failure count, and its effective checking interval. The worker periodically asks PostgreSQL for due pages:

```sql
SELECT *
FROM career_pages
WHERE status = 'active'
  AND next_check_at <= now()
ORDER BY next_check_at
LIMIT 20;
```

The actual batch size and concurrency come from admin configuration rather than being hard-coded.

```text
Worker loop
    ↓
Read scraper.enabled
    ↓
Find due career pages
    ↓
Claim/lock a safe batch
    ↓
Check sites within configured concurrency
    ↓
Extract + normalize jobs
    ↓
Diff against stored jobs
    ↓
Write jobs + scrape logs + notification events
    ↓
Set last_scraped_at
    ↓
Calculate next_check_at
```

Use database locking/claiming so two worker instances cannot scrape the same page simultaneously. PostgreSQL `FOR UPDATE SKIP LOCKED`, a lease column, or a PostgreSQL-backed queue can be used.

### Admin-controlled schedule

```text
scraper.enabled = true
scraper.default_interval_minutes = 180
scraper.minimum_interval_minutes = 60
scraper.max_concurrent_pages = 10
```

Changing these settings affects future worker behavior without redeployment.

### Check Now

```text
Pathao Careers
Status: Healthy
Last checked: 23 minutes ago
Next check: in 37 minutes
Interval: 60 minutes

[ Check Now ] [ Pause ] [ Logs ]
```

`Check Now` should enqueue the page or safely set it due immediately. The browser/API request should not perform the scrape itself; the background worker performs the network fetch and extraction.

### Failure scheduling

Failed pages use backoff rather than continuous retries. Repeated 403, 429, timeout, or 5xx responses push `next_check_at` farther into the future according to the configured failure policy.

The worker remains responsible for site checking even when nobody is visiting the application.

------------------------------------------------------------------------

## 28. Notification Architecture

``` text
New job detected
      │
      ▼
Find users subscribed to career page
      │
      ▼
Apply keyword filters
      │
      ▼
Insert notification_queue rows
      │
      ▼
Daily digest worker
      │
      ▼
Group pending notifications by user
      │
      ▼
Render one digest per user
      │
      ▼
Send through Resend
      │
      ▼
Mark queue rows sent
```

Do not send an email if the user has zero matching jobs.

------------------------------------------------------------------------

## 29. Keyword Matching

V1 should use deterministic matching rather than AI.

Search across fields such as:

-   Title
-   Department
-   Location
-   Job type

Normalize punctuation and whitespace so variants such as:

``` text
Node.js
NodeJS
Node JS
```

can be treated consistently.

------------------------------------------------------------------------

## 30. Email Types

The email service should support:

1.  Email verification.
2.  Password reset.
3.  Daily job digest.
4.  Broken-career-page warning.
5.  Optional administrative/test email.

Example digest:

``` text
3 New Jobs Matching Your Preferences

Company A
- Junior Backend Engineer
- Software Engineer Intern

Company B
- Node.js Developer

Manage preferences · Unsubscribe
```

------------------------------------------------------------------------

## 31. Scraper Failure Handling

Suggested failure policy:

    Failure count Action
  --------------- --------------------------
                1 Retry later
                3 Mark degraded
                7 Mark broken and warn
               14 Pause automatic scraping

HTTP handling:

  Status    Behavior
  --------- ----------------------------------------------------
  403       Flag likely bot protection; avoid aggressive retry
  404       Page may have moved; alert user/admin
  429       Back off strongly
  5xx       Treat as temporary
  Timeout   Log failure and retry later

Use a reasonable per-request timeout, for example 15 seconds.

------------------------------------------------------------------------

## 32. Ethical Scraping

The scraper should:

-   Check `robots.txt`.
-   Respect disallowed paths.
-   Respect crawl delays where available.
-   Use a transparent User-Agent.
-   Avoid excessive requests.
-   Deduplicate shared pages.
-   Use `ETag` and `Last-Modified` conditional requests when possible.
-   Never intentionally bypass access controls.
-   Prefer official/public ATS APIs when available.

Scraping rules and legal requirements vary by site and jurisdiction, so
production expansion should include legal review.

------------------------------------------------------------------------

## 33. Dashboard Architecture

### Main user navigation

``` text
Dashboard
My Lists
Discover
Jobs
Notifications
Settings
```

### Dashboard overview

Show:

-   Number of lists.
-   Number of companies followed.
-   Number of active jobs.
-   New jobs today.
-   Recently changed companies.
-   Public-list recommendations.
-   Career-page health warnings.

### My Lists

Each card can show:

``` text
Bangladesh Software Companies
PUBLIC

12 companies
38 active jobs
5 new this week
Updated 14 minutes ago
```

Actions:

-   Open
-   Edit
-   Make public/private
-   Add career page
-   Delete

------------------------------------------------------------------------

## 34. Public Discovery

Public discovery route:

``` text
/discover
```

Filters can eventually include:

-   Country
-   Industry
-   Tech stack
-   Remote
-   Internship
-   Entry level
-   Most followed
-   Recently updated

V1 can begin with:

-   Search by list name.
-   Search by company name.
-   Newest public lists.
-   Popular public lists.

------------------------------------------------------------------------

## 35. Admin Dashboard

Admin navigation:

``` text
/admin
├── Overview
├── Users
├── Career Pages
├── Scraper
├── Notifications
├── Public Lists
├── Settings
├── Feature Flags
└── Audit Log
```

### Overview

Show:

-   Total users.
-   Active users.
-   Total public/private lists.
-   Total monitored career pages.
-   Active jobs.
-   Scrape success rate.
-   Broken/degraded pages.
-   Pending notifications.
-   Email usage.

### Users

Admin can:

-   Search users.
-   View user details.
-   Change role.
-   Ban/unban.
-   View lists.
-   View subscriptions.

### Career Pages

Admin can:

-   Search monitored URLs.
-   View ATS type.
-   View status.
-   View subscriber/list count.
-   Force scrape.
-   Pause scraping.
-   Inspect scrape logs.

### Public Lists

Admin can:

-   View public lists.
-   Unpublish inappropriate lists.
-   Inspect owner.
-   Inspect included companies.

### Scraper

Show:

-   Success rate.
-   Average duration.
-   Recent errors.
-   Last execution.
-   Pages due.
-   Manual scrape trigger.

### Notifications

Show:

-   Pending queue.
-   Sent count.
-   Failed emails.
-   Email quota.
-   Test digest action.
-   Global notification switch.

------------------------------------------------------------------------

## 36. Feature Flags

``` sql
CREATE TABLE feature_flags (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT 'true',
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by UUID REFERENCES users(id)
);
```

Example flags:

``` text
auth.login_enabled
auth.signup_enabled
auth.show_login_btn
auth.show_signup_btn
scraper.enabled
notifications.enabled
dashboard.readonly
public_lists.enabled
public_list_creation.enabled
```

Feature flags let the admin disable parts of the product without
redeploying.

------------------------------------------------------------------------

## 37. Admin Audit Log

``` sql
CREATE TABLE admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES users(id),
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

Log actions such as:

``` text
ban_user
unban_user
change_role
trigger_scrape
pause_career_page
toggle_flag
unpublish_list
send_test_email
```

------------------------------------------------------------------------

## 38. Authorization Rules

Authentication and authorization are separate.

### User

Can:

-   Manage own profile.
-   Manage own lists.
-   Change visibility of own lists.
-   Add/remove career pages from own lists.
-   Manage own keywords.
-   View public lists.

Cannot:

-   Edit another user's list.
-   Read another user's private list.
-   Use admin endpoints.

### Public visitor

Can:

-   View public lists.
-   View public jobs exposed by those lists.
-   Visit login/register.

Cannot:

-   Modify anything.

### Admin

Can:

-   Access `/admin`.
-   Manage users.
-   Manage career pages.
-   Manage feature flags.
-   Manage public-list moderation.
-   Inspect logs.
-   Trigger operational actions.

Every sensitive API endpoint must enforce authorization server-side. UI
hiding is not security.

------------------------------------------------------------------------

## 39. Suggested API Routes

``` text
/api/auth/register
/api/auth/login
/api/auth/logout
/api/auth/refresh
/api/auth/verify-email
/api/auth/forgot-password
/api/auth/reset-password
/api/auth/google
/api/auth/google/callback

/api/me

/api/lists
/api/lists/:id
/api/lists/:id/career-pages
/api/lists/:id/visibility

/api/public/lists
/api/public/lists/:slug

/api/career-pages
/api/career-pages/:id
/api/career-pages/:id/jobs

/api/subscriptions
/api/subscriptions/:id

/api/jobs
/api/notifications
/api/me/notification-settings

/api/admin/users
/api/admin/users/:id
/api/admin/career-pages
/api/admin/career-pages/:id/scrape
/api/admin/public-lists
/api/admin/flags
/api/admin/notifications/send-test
/api/admin/settings
/api/admin/settings/:key
/api/admin/audit
```

------------------------------------------------------------------------

## 40. Suggested Folder Structure

``` text
career-monitor/
├── app/
│   ├── (public)/
│   │   ├── page.tsx
│   │   ├── discover/
│   │   └── lists/
│   │       └── [slug]/
│   │
│   ├── (auth)/
│   │   ├── login/
│   │   ├── register/
│   │   ├── forgot-password/
│   │   └── auth/callback/
│   │
│   ├── dashboard/
│   │   ├── page.tsx
│   │   ├── lists/
│   │   │   ├── page.tsx
│   │   │   ├── new/
│   │   │   └── [listId]/
│   │   ├── jobs/
│   │   ├── notifications/
│   │   └── settings/
│   │
│   ├── admin/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── users/
│   │   ├── career-pages/
│   │   ├── scraper/
│   │   ├── notifications/
│   │   ├── public-lists/
│   │   ├── flags/
│   │   └── audit/
│   │
│   └── api/
│       ├── auth/
│       ├── lists/
│       ├── public/
│       ├── career-pages/
│       ├── subscriptions/
│       ├── jobs/
│       ├── notifications/
│       └── admin/
│
├── components/
│   ├── auth/
│   ├── dashboard/
│   ├── lists/
│   ├── jobs/
│   └── admin/
│
├── lib/
│   ├── auth/
│   │   ├── jwt.ts
│   │   ├── password.ts
│   │   ├── guard.ts
│   │   └── session.ts
│   ├── db/
│   │   ├── client.ts
│   │   └── schema.ts
│   ├── email/
│   ├── validation/
│   └── security/
│
├── packages/
│   ├── scraper/
│   │   └── src/
│   │       ├── adapters/
│   │       │   ├── greenhouse.ts
│   │       │   ├── lever.ts
│   │       │   └── generic.ts
│   │       ├── pipeline/
│   │       │   ├── fetcher.ts
│   │       │   ├── extractor.ts
│   │       │   ├── fingerprint.ts
│   │       │   ├── differ.ts
│   │       │   └── writer.ts
│   │       └── utils/
│   │           ├── robots.ts
│   │           └── url.ts
│   │
│   └── notifications/
│       └── src/
│           ├── matcher.ts
│           ├── digest.ts
│           └── sender.ts
│
├── scripts/
│   ├── run-scraper.ts
│   └── run-notifier.ts
│
├── tests/
│   └── fixtures/
│
├── worker/
│   ├── scheduler.ts
│   ├── claim-pages.ts
│   └── processor.ts
│
├── middleware.ts
├── drizzle.config.ts
├── package.json
└── .env.example
```

------------------------------------------------------------------------

## 41. Render Deployment Architecture

Use separate Render services for interactive web traffic and continuous background processing.

```text
Git Repository
      │
      ├─────────────────────────────┐
      ▼                             ▼
Render Web Service          Render Background Worker
├── Next.js UI              ├── Scheduling loop
├── API routes              ├── Due-page claiming
├── JWT auth                ├── Career-page checking
├── Public lists            ├── ATS/HTML extraction
└── Admin dashboard         ├── Job diff/history
                            └── Notification processing
      │                             │
      └──────────────┬──────────────┘
                     ▼
             Supabase PostgreSQL
                     │
             ┌───────┴────────┐
             ▼                ▼
           Resend         Google OAuth
```

The web service handles user-facing requests. The background worker independently performs scheduled career-page checks and notification work.

Do not depend on page visits, API traffic, browser requests, or GitHub Actions to start scheduled checks. PostgreSQL `next_check_at` values determine which sites are due.

The web service may request work — for example an admin pressing **Check Now** — but it only enqueues/marks the page as due. The worker performs the network fetch and extraction.

------------------------------------------------------------------------

## 42. Environment Variables

Example:

``` env
DATABASE_URL=

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=

NEXT_PUBLIC_APP_URL=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

RESEND_API_KEY=
EMAIL_FROM=

WORKER_POLL_INTERVAL_MS=
ADMIN_BOOTSTRAP_EMAIL=
```

Secrets must never be committed to Git.

------------------------------------------------------------------------

## 43. Security Checklist

-   Hash passwords with bcrypt.
-   Never store raw refresh tokens in the database.
-   Use strong JWT secrets.
-   Use short-lived access tokens.
-   Rotate refresh tokens.
-   Revoke refresh sessions on logout.
-   Use HttpOnly/Secure cookies.
-   Validate all request bodies.
-   Rate-limit auth endpoints.
-   Rate-limit URL submissions.
-   Require verified email before expensive scraping actions.
-   Protect against SSRF.
-   Validate redirects.
-   Escape/sanitize public-list content.
-   Enforce ownership server-side.
-   Enforce admin roles server-side.
-   Never trust role values sent by the browser.
-   Add CSRF protection where cookie-authenticated state-changing routes
    require it.
-   Log sensitive admin actions.
-   Avoid exposing scraper internals publicly.

------------------------------------------------------------------------

## 44. Abuse Prevention

Suggested V1 limits:

``` text
Maximum lists per free user: 10
Maximum career pages per user: 20
URL submissions: 5/hour
Minimum scrape interval per career page: 1 hour
Default scrape interval: 3 hours
```

Require email verification before the first scrape is scheduled.

Because career pages are globally deduplicated, 100 users following the
same URL should still result in one scrape cycle for that page.

------------------------------------------------------------------------

## 45. Testing Strategy

### Unit tests

Test:

-   URL normalization.
-   SSRF checks.
-   Fingerprinting.
-   Diff logic.
-   Keyword matching.
-   JWT creation/verification.
-   Refresh-token hashing.
-   List visibility authorization.
-   Admin authorization.

### Adapter fixture tests

Store sample responses:

``` text
tests/fixtures/
├── greenhouse/
├── lever/
└── generic/
```

Do not depend on live company career pages during CI tests.

### Integration tests

Test:

-   Registration → login → refresh → logout.
-   Create list → add URL → subscription.
-   Private list access restrictions.
-   Public list visibility.
-   Scrape fixture → new jobs → notifications.
-   Repeated scrape → no duplicate notifications.
-   Missing job → consecutive misses → close.
-   Suspicious mass removal → no mass closure.
-   Admin-only endpoint protection.

------------------------------------------------------------------------

## 56. Development Roadmap

### Sprint 1 --- Foundation

-   Create Next.js project.
-   Connect Supabase PostgreSQL.
-   Configure Drizzle.
-   Create database schema.
-   Create base UI/layout.
-   Deploy initial app to Render.

### Sprint 2 --- Authentication

-   Registration.
-   Login.
-   JWT utilities.
-   Refresh-token rotation.
-   Logout.
-   Email verification.
-   Forgot/reset password.
-   Google OAuth.
-   Route guards.
-   Role guards.

### Sprint 3 --- Lists

-   Create list.
-   Edit/delete list.
-   Public/private visibility.
-   List detail page.
-   Public-list route.
-   Discover public lists.
-   Add career page into selected list.

### Sprint 4 --- Scraper Core

-   URL normalizer.
-   SSRF guard.
-   robots.txt checker.
-   ATS detection.
-   Greenhouse adapter.
-   Lever adapter.
-   Generic Cheerio adapter.
-   Fingerprinting.
-   Diff algorithm.
-   Scrape logs.
-   Anti-spike protection.

### Sprint 5 --- Scheduling

-   Render worker manual check queue.
-   Database-driven scheduled checking.
-   `next_check_at`.
-   Retry/failure policy.
-   Health statuses.

### Sprint 6 --- Notifications

-   Keyword preferences.
-   Notification queue.
-   Daily digest.
-   Resend integration.
-   Unsubscribe/preferences.

### Sprint 7 --- Admin

-   Admin route guard.
-   Overview.
-   Users.
-   Career pages.
-   Scraper health.
-   Notifications.
-   Public-list moderation.
-   Feature flags.
-   Audit log.

### Sprint 8 --- Hardening and Launch

-   Rate limiting.
-   Security review.
-   Error states.
-   Empty states.
-   Mobile responsiveness.
-   Onboarding.
-   Testing.
-   Production logging.
-   Launch with approximately 10 real users.

------------------------------------------------------------------------

## 57. Important Edge Cases

Handle these deliberately:

1.  Career URL redirects to an ATS.
2.  User submits a single job URL instead of a career index.
3.  Same career page appears in many lists.
4.  Same company has multiple career URLs.
5.  Job title changes while URL stays the same.
6.  Pagination.
7.  Cookie/consent walls.
8.  JavaScript-only pages.
9.  Temporary 403/500 responses.
10. Massive career pages with hundreds of jobs.
11. Seasonal hiring spikes.
12. Company rebrands or changes its career URL.
13. Public list changes from public to private.
14. Public-list slug collision.
15. User deletes a list that shares career pages with other users.
16. User deletes account.
17. Email address belongs to both password and Google auth flows.
18. Refresh-token theft/reuse.
19. Scraper returns a challenge page instead of jobs.
20. One company suddenly appears to remove nearly all jobs.

------------------------------------------------------------------------

## 58. Future Differentiating Features

After V1 has enough historical data, add:

### Hiring velocity

Example:

``` text
Pathao posted 12 engineering jobs this month,
4× its normal hiring rate.
```

### Hiring history

Show:

-   Jobs opened by month.
-   Average job lifetime.
-   Hiring spikes.
-   Department growth.

### Tech-stack detection

Extract technologies such as:

``` text
React
Node.js
Java
Spring Boot
AWS
PostgreSQL
```

### Salary extraction

Detect and normalize salary ranges where listings provide them.

### Global role alerts

Example:

``` text
Notify me whenever any monitored company posts
a Junior Backend Engineer role.
```

### Telegram notifications

Useful as an additional alert channel.

### Public hiring leaderboard

Example:

``` text
Top Hiring Tech Companies in Bangladesh This Month
```

This can become an SEO/discovery surface.

------------------------------------------------------------------------

## 59. V1 Request Lifecycle Example

A complete example:

``` text
1. Mishkat registers.
2. Email is verified.
3. User creates:
   "Bangladesh Software Companies"
4. User selects PUBLIC.
5. User clicks "Add Career Page".
6. User enters a company career URL.
7. Backend validates and normalizes it.
8. Backend checks whether that page already exists globally.
9. Page is linked to the user's list.
10. Subscription is created.
11. Initial scrape is queued.
12. ATS detector selects Greenhouse/Lever/Generic.
13. Jobs are extracted and normalized.
14. Fingerprints are generated.
15. Jobs are stored.
16. Later scrape finds a new Backend Engineer job.
17. Notification queue entry is created.
18. Dashboard immediately shows the new detected job.
19. Daily digest sends the matching job.
20. Because the list is public, visitors can also see the public list and its exposed active jobs.
```

------------------------------------------------------------------------

## 60. Original Core Architecture Principles

The implementation should follow these rules:

1.  **Scrape once, reuse globally.**
2.  **A user's career page belongs to a list.**
3.  **Lists are private by default.**
4.  **Public visibility never grants edit access.**
5.  **Never delete historical jobs merely because they close.**
6.  **Never close jobs after one missing scrape.**
7.  **Prefer ATS APIs over HTML scraping.**
8.  **Keep browser automation outside V1.**
9.  **Treat user-supplied URLs as untrusted input.**
10. **Keep scraper adapters replaceable.**
11. **Keep auth authorization server-side.**
12. **Batch notifications.**
13. **Store operational logs.**
14. **Make administrative changes auditable.**
15. **Design the MVP so future hiring analytics can use the stored
    history.**

------------------------------------------------------------------------

## 61. Final V1 Architecture Summary

``` text
                    CAREER PAGE MONITOR

Visitors ───────────────► Public Lists / Public Jobs
                                │
Users ─► JWT Auth ─► Dashboard ─┼─► Lists
                                │    ├─ Private
                                │    └─ Public
                                │
                                └─► Add Career URL
                                        │
                                        ▼
                              Global Career Page
                                        │
                                        ▼
                               Render Background Worker
                                        │
                                        ▼
                                  Scraper
                       ┌────────────────┼───────────────┐
                       ▼                ▼               ▼
                  Greenhouse          Lever          Generic
                       └────────────────┼───────────────┘
                                        ▼
                                   Normalize
                                        ▼
                                  Fingerprint
                                        ▼
                                      Diff
                                        ▼
                               Supabase PostgreSQL
                              ┌─────────┴─────────┐
                              ▼                   ▼
                         Dashboard          Notification Queue
                                                  │
                                                  ▼
                                               Resend

Admin ─► Admin Dashboard ─► Users / Scraper / Pages /
                            Public Lists / Flags / Audit
```

This structure keeps the V1 practical while leaving clear extension
points for browser-based scraping, richer notifications, hiring
analytics, public discovery, and larger-scale worker infrastructure.
