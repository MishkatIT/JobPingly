# JobPingly HTTP API

Reference for every HTTP endpoint under `app/api/**/route.ts`: 84 route files, 114 method handlers. It describes what the code does; file paths point at the implementation. If this document and the code disagree, the code is right and this document needs fixing.

The API is built for the JobPingly web client: same origin, cookie session, JSON. There are no API keys or bearer tokens for user endpoints. The only endpoints meant for other machines are listed in [1.13 Machine endpoints](#113-machine-endpoints).

Contents

1. [Conventions](#1-conventions)
2. [Auth](#2-auth)
3. [Me and account](#3-me-and-account)
4. [Notifications](#4-notifications)
5. [Watchlists](#5-watchlists)
6. [Companies](#6-companies)
7. [Jobs](#7-jobs)
8. [Tracker](#8-tracker)
9. [Public directory](#9-public-directory)
10. [Operational endpoints](#10-operational-endpoints)
11. [Admin](#11-admin)
12. [Notes and caveats](#12-notes-and-caveats)

---

## 1. Conventions

### 1.1 Request pipeline

Every `/api/*` request passes through two layers:

1. **`proxy.ts`** (the Next.js 16 request proxy, matcher `/api/:path*`): the cross-site write check ([1.9](#19-cross-site-request-check)) and a coarse per-IP rate limit ([1.8](#18-rate-limiting)).
2. **`route()`** in `lib/api/route.ts`, which wraps almost every handler and runs, in this order:
   1. route rate limits counted per IP;
   2. session lookup (skipped for `auth: 'public'`); `401` when a session is required and missing;
   3. permission check; `403` when the role lacks it;
   4. route rate limits counted per user;
   5. maintenance-mode gate for writes ([1.12](#112-maintenance-mode-and-platform-switches));
   6. validation of path params, query string and JSON body ([1.4](#14-input-validation));
   7. the handler, then the response envelope, the session-cookie refresh ([1.6](#16-authentication)) and the default `Cache-Control: no-store` ([1.11](#111-caching-and-response-headers)).

Authentication runs before validation, so a request that is both unauthenticated and malformed gets `401`, not `400`.

Six route files do not use `route()` and build their own responses: `/api/health`, `/api/banner`, `/api/avatar/{id}`, `/api/unsubscribe`, `/api/cron/tick` and `/api/webhooks/brevo`. They are described individually in [section 10](#10-operational-endpoints).

### 1.2 Response envelope

Success (HTTP 200, or 201 for creations):

```json
{ "data": { "id": "…" }, "meta": { "page": 1 } }
```

`meta` appears only on paginated lists and on a few endpoints that add fields to it (noted per endpoint). `route()` turns a handler that returns nothing into `204 No Content`; no current handler does that.

Failure:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Some fields are invalid.",
    "details": [{ "field": "email", "message": "Enter a valid email address." }]
  }
}
```

`message` is English text meant for display. `details` is present only for some codes. Branch on `code` and the HTTP status, never on `message`.

Responses that do not use the envelope: file downloads (CSV and the JSON account export), `/api/health` (a bare object), `/api/avatar/{id}` (image bytes or a redirect), `GET /api/unsubscribe` (a redirect), and the empty-bodied `401`/`404` responses of `/api/webhooks/brevo` and the `404` of `/api/cron/tick`.

### 1.3 Error codes

| HTTP | `code` | Raised when |
|---|---|---|
| 400 | `bad_request` | The body is not valid JSON; Postgres cannot parse a value (SQLSTATE 22P02, 22003, 22007, for example a malformed UUID); a NOT NULL or CHECK violation (23502, 23514); a few explicit checks (for example an unconfirmed bulk delete). |
| 400 | `validation_error` | A zod schema or a service check failed. `details` is an array of `{ field, message }` (at most 20). `field` is the dotted path, or `(root)`. |
| 400 | `invalid_code`, `too_many_attempts`, `code_expired` | `POST /api/auth/verify`. |
| 400 | `invalid_token` | `POST /api/auth/reset-password`, `POST /api/unsubscribe`. |
| 401 | `unauthorized` | No valid session where one is required; wrong cron secret. |
| 401 | `invalid_credentials` | Wrong email or password. |
| 401 | `google_failed` | The Google credential could not be verified, or Google sign-in is not configured. |
| 403 | `forbidden` | The role or watchlist role lacks the permission; sign-ups or suggestions are switched off. |
| 403 | `limit_reached` | A plan limit was reached (watchlists, companies per watchlist, tracker size). `details.limit` is set for the first two. |
| 403 | `account_suspended` | Sign-in, verification or password reset for a suspended account. |
| 403 | `cross_site_request` | Rejected by the origin check in `proxy.ts`. |
| 404 | `not_found` | `"<Thing> was not found."` Also returned for private resources the caller may not see, so their existence is not revealed. |
| 409 | `conflict` | A unique violation (23505), a foreign-key violation (23503), or a state conflict (already reviewed, not in the trash, and so on). |
| 410 | `gone` | Expired watchlist invitation. |
| 413 | `payload_too_large` | The body is larger than the route allows ([1.10](#110-body-size-limits)). |
| 422 | `unprocessable` | The email provider rejected an admin test email. |
| 429 | `rate_limited` | A rate limit was hit ([1.8](#18-rate-limiting)). |
| 500 | `internal_error` | Unexpected error. `details.requestId` (12 hex characters) matches the server log line `[api] <METHOD> <path> failed (request <id>)`. |
| 503 | `unavailable` | Maintenance mode (the message is the configured maintenance message), sign-in switched off, public directory switched off, or a Postgres statement timeout (57014). |

### 1.4 Input validation

- Bodies are JSON, read as text whatever the `Content-Type`. An empty or whitespace-only body counts as `{}`. A body is only read on routes that declare a body schema.
- Schemas are zod 4 objects: unknown keys are dropped silently. Fields described as "trimmed" are trimmed before the length check.
- Query values are strings. A repeated key becomes an array, which fails scalar fields. Boolean flags accept `true`, `false`, `1`, `0`. Search strings (`q`, `actor`) are trimmed, at most 200 characters, and an empty value counts as absent.
- Path ids (`{id}`, `{companyId}`, `{memberId}`, `{suggestionId}`) must be UUIDs, otherwise `400 validation_error` (routes using the shared `idParams` say "That id is not valid."). Public list slugs are 1-120 characters.
- Services clean free text further (`cleanText` in `lib/security/html.ts`: control and invisible characters removed, whitespace collapsed, value truncated to the field limit), so a stored name can be shorter than what was sent.
- Careers-page URLs must pass `checkUrlSyntax` (`lib/security/ssrf.ts`): http or https, port empty/80/443/8080/8443, no `user:password@`, no `localhost`, `.local`, `.internal` or similar hosts, no private or reserved IP literals, and a dotted host name. Adding a company also resolves DNS and rejects hosts that resolve to a private address. Stored URLs are canonical: https, lower-case host, no fragment, no `utm_*` or other tracking parameters, no trailing slash.

Notation in this document: `field?` is optional; `| null` means null is accepted; lengths are in characters; ranges such as `1-80` are inclusive.

### 1.5 Pagination

Paginated endpoints accept `pageQuery` (`lib/api/route.ts`):

| Param | Type | Default | Range |
|---|---|---|---|
| `page` | integer | 1 | 1-100000 |
| `pageSize` | integer | 25 | 1-100 (public directory: 1-48, default 24) |

They return an array in `data` and:

```json
"meta": { "page": 2, "pageSize": 25, "total": 312, "totalPages": 13 }
```

`totalPages` is `max(1, ceil(total / pageSize))`. Some endpoints add keys to `meta`. Paging is offset-based and not snapshotted between requests.

Paginated: `GET /api/notifications`, `/api/jobs`, `/api/public/lists`, `/api/public/lists/{slug}/jobs`, and the admin lists of users, sources, jobs, watchlists, tasks, email logs, approvals, audit entries and issues. Other collection endpoints return a plain array with a server-side cap, noted per endpoint.

### 1.6 Authentication

Implementation: `lib/auth/session.ts`, `lib/auth/respond.ts`.

- **Cookie `jp_session`**: an opaque 256-bit random token, 64 lower-case hex characters. Attributes: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production, `Expires` set to the session expiry. Only the SHA-256 hash is stored (`refresh_tokens.token_hash`). A cookie that is not 64 hex characters is ignored without a database read.
- **Getting a session**: `POST /api/auth/verify`, `/api/auth/login`, `/api/auth/google` and `/api/auth/reset-password` set the cookie. `POST /api/auth/logout` revokes it. There is no token endpoint for non-browser clients.
- **Validity**: not revoked, not expired, and the user is email-verified and not suspended. Suspension and password changes revoke sessions. Role and plan changes apply on the next request.
- **Lifetime**: 30 days, sliding. Activity is written at most every 5 minutes per session; when less than 15 days remain, expiry moves to 30 days from now. `route()` re-sends the cookie with the current expiry at most every 6 hours per session, and only when the response does not already set a cookie.
- **Cache**: lookups are cached in process memory for 15 seconds. Revocation clears the cache in the process that performed it; another instance can keep accepting a revoked session for up to 15 seconds.
- **Legacy cookies**: the pre-v2 cookie `refresh_token` is still accepted as a session token. Any response that sets `jp_session` also expires `refresh_token` (on `/` and on `/api/auth`) and `access_token`.
- **Bootstrap owner**: the account whose email equals `ADMIN_BOOTSTRAP_EMAIL` is promoted to `owner` when its session is loaded.
- **Effective plan**: the session user's plan reads as `free` once `users.plan_expires_at` has passed (not applied everywhere; see [section 12](#12-notes-and-caveats)).

Auth labels used in the tables below:

| Label | `route()` setting | Meaning |
|---|---|---|
| none | `auth: 'public'` | The session is not looked up. |
| optional | `auth: 'optional'` | The session is used if present; anonymous callers are allowed. |
| signed in | default | `401 unauthorized` without a valid session. |
| `permission.name` | `permission` | Signed in, and the role grants the permission; otherwise `403 forbidden`. |

### 1.7 Roles and permissions

Implementation: `lib/auth/rbac.ts`. Roles are `user`, `support`, `moderator`, `admin`, `owner`. An unknown stored role is treated as `user`. "Staff" means any role with `admin.access`.

| Permission | Meaning | support | moderator | admin | owner |
|---|---|---|---|---|---|
| `admin.access` | Open the admin panel | yes | yes | yes | yes |
| `overview.read` | Platform metrics | yes | yes | yes | yes |
| `users.read` | View accounts | yes | yes | yes | yes |
| `users.manage` | Verify, suspend, reactivate | yes | yes | yes | yes |
| `users.delete` | Delete accounts | - | - | yes | yes |
| `users.roles` | Change roles | - | - | - | yes |
| `users.plans` | Change plans and exemptions | - | - | yes | yes |
| `sources.read` | View sources and scan history | yes | yes | yes | yes |
| `sources.manage` | Add, edit, pause, rescan sources | - | yes | yes | yes |
| `sources.delete` | Delete sources and their jobs | - | - | yes | yes |
| `jobs.read` | View jobs | yes | yes | yes | yes |
| `jobs.manage` | Hide and restore jobs | - | yes | yes | yes |
| `lists.read` | View all watchlists | yes | yes | yes | yes |
| `lists.manage` | Edit, trash, restore any watchlist | - | yes | yes | yes |
| `lists.delete` | Permanently delete watchlists | - | - | yes | yes |
| `workers.read` | Worker and queue health | yes | yes | yes | yes |
| `workers.manage` | Run, retry, cancel tasks; pause monitoring | - | yes | yes | yes |
| `emails.read` | Email logs | yes | yes | yes | yes |
| `emails.manage` | Approvals, cohorts, queue | - | - | yes | yes |
| `emails.send` | Test and broadcast emails | - | - | yes | yes |
| `issues.read` | Reported issues | yes | yes | yes | yes |
| `issues.manage` | Triage issues | yes | yes | yes | yes |
| `settings.read` | View settings | - | yes | yes | yes |
| `settings.manage` | Change ordinary settings | - | - | yes | yes |
| `settings.sensitive` | Sign-up/sign-in switches, maintenance mode, email kill-switch | - | - | - | yes |
| `audit.read` | Audit log | - | yes | yes | yes |
| `data.export` | Export platform data | - | - | yes | yes |

The `user` role has no permissions. Further rules enforced in services:

- Acting on another account (suspend, reactivate, plan, exemptions, revoke sessions, delete) requires a strictly higher role rank (`user` < `support` < `moderator` < `admin` < `owner`) and is never allowed on yourself (`canActOnUser`).
- Only owners change roles; nobody changes their own role; the last owner cannot be demoted (`canAssignRole`, `lib/admin/users.ts`).

**Watchlist roles** (`lib/lists/access.ts`). Every watchlist endpoint resolves the caller's role on the list. A deleted list, or a private list the caller is neither owner nor accepted collaborator of, returns `404 not_found` ("Watchlist was not found.").

| Capability | owner | moderator | editor | viewer |
|---|---|---|---|---|
| Read the list, its companies, its CSV export | yes | yes | yes | public lists only (also anonymous) |
| Add, remove, pause, edit companies | yes | yes | yes | - |
| Edit name, description, tags | yes | yes | - | - |
| Change visibility, pin | yes | - | - | - |
| Invite and remove members | yes | - | - | - |
| See the member list | yes (with emails) | yes | yes | - |
| Review suggestions | yes | yes | - | - |
| Trash the list | yes | - | - | - |
| Suggest a company | - | - | - | public lists, when enabled |

Moderator and editor are `list_collaborators` with status `accepted`. Viewer is anyone else looking at a public list. Any member can leave a list.

### 1.8 Rate limiting

Implementation: `lib/security/rateLimit.ts`, `proxy.ts`, `lib/api/route.ts`.

- **Algorithm**: fixed windows. Counters live in process memory. Limits marked *distributed* are counted in Upstash Redis when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set, and fall back to memory if Redis does not answer within 1.5 s.
- **Global limit** (`proxy.ts`, memory only): per client IP per 60 seconds, 600 GET/HEAD requests and 120 other requests. `OPTIONS` and `/api/health` are not counted.
- **Route limits** (`rateLimit` option of `route()`): `by: 'ip'` (the default) is counted before the session lookup with key `<name>:ip:<ip>`; `by: 'user'` is counted after authentication with key `<name>:user:<userId>` (the IP for anonymous callers). The tables below show them as "N per window per IP/user".
- **Service limits**: some limits live in services (per email address, per company, per inviter). They are listed with the endpoint.
- **Response**: `429 rate_limited` with a `Retry-After` header and `details.retryAfterSeconds`. The proxy's 429 has the header but no `details`. `POST /api/unsubscribe` sends neither.
- **Client IP**: the header named by `CLIENT_IP_HEADER` if set, then `CF-Connecting-IP`, then the `X-Forwarded-For` entry `TRUSTED_PROXY_HOPS` (default 1) positions from the right, then `X-Real-IP`, then `0.0.0.0`.

### 1.9 Cross-site request check

`proxy.ts` protects the cookie session against cross-site request forgery. For every method other than GET, HEAD and OPTIONS on `/api/*`, except paths that start with `/api/cron/`, `/api/webhooks/` or `/api/unsubscribe`:

1. If an `Origin` header is present, its host (with port, lower-cased) must equal the request's `X-Forwarded-Host` (first value) or `Host`, or the host of the first configured of `NEXT_PUBLIC_APP_URL`, `APP_URL`, `RENDER_EXTERNAL_URL`. An unparseable origin (including `null`) is rejected.
2. Otherwise, if `Sec-Fetch-Site` is present, it must be `same-origin` or `none`.
3. Otherwise (neither header, as with curl or server-to-server calls) the request is allowed. Such clients cannot carry a victim's cookies.

A rejected request gets `403` with `{ "error": { "code": "cross_site_request", "message": "This request did not originate from JobPingly." } }`. There is no CSRF token. No CORS headers are sent anywhere, so other origins cannot read API responses.

### 1.10 Body size limits

- Default 100 KB (102,400 bytes) per JSON body. Both the `Content-Length` header and the actual UTF-8 length are checked; either one over the limit gives `413 payload_too_large`.
- `PATCH /api/me` allows 450 KB (avatar data URLs). `POST /api/lists/{id}/companies/import` allows 250 KB.
- Handlers outside `route()` have no cap. `POST /api/webhooks/brevo` reads the whole body (and processes at most 100 events). `/api/unsubscribe` and `/api/cron/tick` do not read a body.

### 1.11 Caching and response headers

- `route()` sets `Cache-Control: no-store` on every response, success or error, unless the handler set one. No handler sets one, so every `route()` response, including CSV and JSON downloads, is `no-store`.
- `GET /api/banner`: `public, max-age=60, stale-while-revalidate=300`.
- `GET /api/avatar/{id}`: an uploaded image is served with `public, max-age=604800, immutable` (its URL carries a `?v=<hash>` that changes with the image); an external avatar is a `302` with `public, max-age=3600`; 404s carry no cache header.
- `/api/health`, `/api/cron/tick` and successful `/api/unsubscribe` responses: `no-store`. `/api/webhooks/brevo`: no cache header.
- `next.config.mjs` adds security headers to every path, the API included: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin-allow-popups`, and in production `Strict-Transport-Security: max-age=63072000; includeSubDomains`. `X-Powered-By` is disabled.
- No handler supports ETags or conditional requests.

### 1.12 Maintenance mode and platform switches

Settings live in the `feature_flags` table and are defined in `lib/settings/registry.ts` (cached for 30 seconds per process). These change API behaviour:

| Setting | Default | Effect |
|---|---|---|
| `platform.maintenance_mode` | false | Writes (not GET/HEAD/OPTIONS) through `route()` by non-staff get `503 unavailable` with `platform.maintenance_message`. Exempt: `POST /api/auth/login`, `/api/auth/google`, `/api/auth/logout`, `PUT /api/admin/settings`, and every staff request. Handlers outside `route()` (unsubscribe, webhooks, cron) are not gated. Registration, verification and password reset are blocked. |
| `auth.signup_enabled` | true | When off, `POST /api/auth/register` and Google sign-in of a new address return `403 forbidden`. |
| `auth.login_enabled` | true | When off, password and Google sign-in by non-staff return `503 unavailable`. |
| `public_lists.enabled` | true | When off, `/api/public/lists`, `/api/public/lists/{slug}` and `/api/public/lists/{slug}/jobs` return `503 unavailable`. |
| `public_lists.allow_suggestions` | true | When off, `POST /api/lists/{id}/suggestions` returns `403`. |
| `email.auto_approve_enabled` | false | When off, a new address needs staff approval before it receives alert emails (shown as `approval` in preference responses). |
| `limits.max_lists_per_user` | 10 | Free-plan watchlist limit; -1 means unlimited. |
| `limits.max_urls_per_list` | 25 | Free-plan companies per watchlist; -1 means unlimited. |
| `limits.max_keywords_per_sub` | 20 | Free-plan terms per alert rule group. |

Paid plans have fixed limits in `lib/plans.ts`: `pro` 50 lists, 250 companies per list, 100 terms; `team` 200, 1000, 200. Staff and quota-exempt accounts have unlimited lists and companies and 500 terms. Billing is not connected; staff assign plans.

### 1.13 Machine endpoints

| Endpoint | Caller | Authorisation | Purpose |
|---|---|---|---|
| `POST` or `GET /api/cron/tick` | An external scheduler | `Authorization: Bearer <CRON_SECRET>`; returns 404 while `CRON_SECRET` is unset or shorter than 16 characters | Runs one bounded worker cycle. |
| `POST /api/webhooks/brevo` | Brevo | `?token=<BREVO_WEBHOOK_SECRET>`; returns 404 while the secret is unset | Delivery events (delivered, bounces, complaints). |
| `POST /api/unsubscribe` | Mailbox providers (RFC 8058 one-click) and the `/unsubscribe` page | Signed single-purpose token in `?token=` | Turns alert email off (or back on). |
| `GET`, `HEAD /api/health` | Uptime monitors, the hosting platform | None | Database and worker liveness. Never rate limited. |

The first three are exempt from the cross-site check. Details are in [section 10](#10-operational-endpoints).

---

## 2. Auth

Implementation: `app/api/auth/*`, `lib/auth/accounts.ts`, `lib/auth/verification.ts`, `lib/auth/google.ts`.

| Method | Path | Auth | Purpose | Rate limit |
|---|---|---|---|---|
| POST | `/api/auth/register` | none | Start a sign-up; emails a 6-digit code | 10 per 15 min per IP (distributed); service: 5 per hour per address |
| POST | `/api/auth/verify` | none | Finish a sign-up with ticket and code; starts a session | 30 per 15 min per IP (distributed) |
| POST | `/api/auth/resend` | none | Send a new code for a ticket | 10 per 15 min per IP (distributed); 60 s cooldown per ticket |
| POST | `/api/auth/login` | none | Password sign-in | 30 per 15 min per IP and 10 per 15 min per address (both distributed) |
| POST | `/api/auth/google` | none | Google sign-in or sign-up | 30 per 15 min per IP (memory only) |
| POST | `/api/auth/logout` | none | Revoke the current session and clear cookies | - |
| POST | `/api/auth/forgot-password` | none | Request a password-reset link | 10 per 15 min per IP (distributed); service: 3 per hour per address, silent |
| POST | `/api/auth/reset-password` | none | Set a new password with the emailed token; starts a session | 15 per 15 min per IP (distributed) |

Password policy (`lib/auth/password.ts`), applied by register, reset-password and `POST /api/me/password`: at least 8 characters, at most 72 UTF-8 bytes, not on the built-in list of common passwords, not a single repeated character, and not equal to the email address or (when 4 or more characters) its local part. Passwords are hashed with bcrypt, cost 10.

`next` (accepted by verify, login and google) is honoured only if it is a same-site path: it must start with `/`, not with `//` or `/\`, and must not point at an auth page. Users who have not finished onboarding and have no list subscription are sent to `/onboarding` (with `?next=` when given); otherwise to `next` or `/dashboard`.

#### `POST /api/auth/register`

- **Body**: `name` string, trimmed, 1-80; `email` email, max 254; `password` string 1-200 (then the policy above); `timezone?` string max 64 (IANA name; invalid values become `UTC`).
- **Response**: `{ ticket, email }`. `ticket` is 64 hex characters; the browser keeps it for `/verify` and `/resend`. The code is valid for 10 minutes.
- **Enumeration**: an address that already has a verified or suspended account gets the same response with a random ticket and no code. The verified owner receives an "account exists" email instead (at most one per hour).
- **Side effects**: creates the `users` row at once (`email_verified = false`). The bcrypt hash of the chosen password and the name wait on the `email_verifications` row until the code is entered.
- **Errors**: `403 forbidden` when sign-ups are off; `400 validation_error` for the password policy; `429` for the per-address limit or a 60-second resend cooldown on an existing unverified account.

#### `POST /api/auth/verify`

- **Body**: `ticket` 64 lower-case hex; `code` exactly 6 digits (trimmed); `next?` max 500.
- **Response**: `{ redirectTo }` and the session cookie.
- **Side effects**: marks the email verified, applies the pending password and name, deletes every verification row of the user, records the address in `email_approvals` (approved at once when auto-approval is on or for the bootstrap address) and sends the welcome email once if approved.
- **Errors**: `400 invalid_code` (the message states the attempts left), `400 too_many_attempts` (5 attempts per code), `400 code_expired` (expired code or unknown ticket), `403 account_suspended`.

#### `POST /api/auth/resend`

- **Body**: `ticket` 64 hex.
- **Response**: `{ sent: boolean, retryAfterSeconds: number }`. During the 60-second cooldown `sent` is false and `retryAfterSeconds` is the wait. An unknown ticket answers `{ sent: true, retryAfterSeconds: 0 }`.
- **Side effects**: a new code for the same ticket; attempts reset to 0 and the 10-minute expiry restarts.

#### `POST /api/auth/login`

- **Body**: `email` email, max 254; `password` 1-200; `next?` max 500.
- **Response**, verified account: `{ status: "signed_in", redirectTo }` and the session cookie.
- **Response**, account never verified whose pending (or stored) password matches: `{ status: "verification_required", ticket, email }`, no cookie; a new code is emailed and the client continues with `/verify`.
- **Errors**: `401 invalid_credentials` (unknown address, wrong password, Google-only account; a dummy bcrypt comparison keeps timing similar), `403 account_suspended`, `503 unavailable` when sign-in is off for non-staff, `429` (per IP, or per address with its own message).
- Allowed during maintenance mode. Staff sign-ins are audited as `auth.admin_login`.

#### `POST /api/auth/google`

- **Body**: `credential` string 20-5000, a Google Identity Services ID token. It is verified against Google's published keys, issuer, audience (`GOOGLE_CLIENT_ID` or `NEXT_PUBLIC_GOOGLE_CLIENT_ID`) and expiry, and Google must report the email as verified. `next?` max 500.
- **Response**: `{ status: "signed_in", created: boolean, redirectTo }` and the session cookie.
- **Account matching**: by Google id, then by email. An existing unverified account becomes verified and any password on it is discarded (it was set by whoever registered the address). A new account is created only when sign-ups are on.
- **Errors**: `401 google_failed`, `403 account_suspended`, `403 forbidden` (sign-ups off, new address), `503 unavailable` (sign-in off, non-staff).
- Allowed during maintenance mode. Staff sign-ins are audited.

#### `POST /api/auth/logout`

- No body; works without a valid session. Revokes the session whose token is in the cookie, if any, and clears `jp_session` and the legacy cookies.
- **Response**: `{ signedOut: true }`. Allowed during maintenance mode.

#### `POST /api/auth/forgot-password`

- **Body**: `email` email, max 254.
- **Response**: always `{ sent: true }`. The work runs after the response (`after()`), so neither the answer nor its timing reveals whether the address has an account.
- **Side effects**: for an existing, unsuspended account within the per-address limit, a link to `/reset-password?token=<64 hex>` is emailed. It is valid for 60 minutes.

#### `POST /api/auth/reset-password`

- **Body**: `token` string max 128 (must be 64 hex to be valid); `password` 1-200 (policy applies).
- **Response**: `{ redirectTo }` and a new session cookie.
- **Side effects**: sets the password and marks the email verified (the link proves ownership), marks the token used and deletes the user's other reset tokens and verification rows, revokes every existing session, emails a "password changed" notice, and records the address in `email_approvals`.
- **Errors**: `400 invalid_token` (unknown, used or expired), `403 account_suspended`, `400 validation_error`.

---

## 3. Me and account

Implementation: `app/api/me/*`, `app/api/invitations/[id]`, `lib/users/service.ts`, `lib/lists/members.ts`.

| Method | Path | Auth | Purpose | Rate limit |
|---|---|---|---|---|
| GET | `/api/me` | signed in | Current user, profile, limits, usage, unread count | - |
| PATCH | `/api/me` | signed in | Update name, avatar, social links, time zone | - |
| DELETE | `/api/me` | signed in | Permanently delete the account | 5 per hour per user |
| POST | `/api/me/password` | signed in | Change or set the password; signs out other sessions | 10 per 15 min per user |
| GET | `/api/me/sessions` | signed in | Active sessions | - |
| DELETE | `/api/me/sessions` | signed in | Sign out every other session | - |
| DELETE | `/api/me/sessions/{id}` | signed in | Revoke one session | - |
| GET | `/api/me/preferences` | signed in | Email and notification preferences, delivery schedule | - |
| PUT | `/api/me/preferences` | signed in | Update them | - |
| GET | `/api/me/export` | signed in | Download all account data as JSON | 10 per hour per user |
| POST | `/api/me/onboarding` | signed in | Mark onboarding complete | - |
| GET | `/api/me/overview` | signed in | Dashboard summary | - |
| GET | `/api/me/invitations` | signed in | Pending watchlist invitations | - |
| POST | `/api/invitations/{id}` | signed in | Accept or decline an invitation | - |

#### `GET /api/me`

- **Response**: `{ user, profile, unreadNotifications }`.
  - `user`: `{ id, email, name, avatarUrl, role, plan, timezone, hasPassword, hasGoogle, onboarded, permissions[], createdAt }`. `plan` is the effective plan (`free` after expiry).
  - `profile`: `{ id, email, name, avatarUrl, socials, timezone, role, plan: { id, label }, quotaExempt, hasPassword, hasGoogle, onboardingCompletedAt, createdAt, limits: { lists, companiesPerList, keywordsPerAlert }, usage: { lists } }`. A limit of `null` means unlimited. `profile.plan` is the stored plan.
- Uploaded avatars appear as `/api/avatar/<id>?v=<hash>`, never as inline data.

#### `PATCH /api/me`

- **Body** (all optional, max 450 KB): `name` max 80 (empty after cleaning gives 400); `avatarUrl` max 400,000 `| null`: either a base64 `data:` URL of a PNG, JPEG, WebP or GIF image of at most 256 KB decoded, or an `https:` URL of at most 1,024 characters; `null` or `""` removes it; SVG is rejected; `socials` object of strings, each max 300: only `website`, `linkedin`, `github`, `twitter` are kept, normalised to http(s) URLs of at most 200 characters, invalid links dropped; `timezone` max 64, IANA name (invalid gives 400).
- **Response**: the `profile` object, as in `GET /api/me`.

#### `DELETE /api/me`

- **Body**: `password?` max 200, required when the account has a password; `email?` max 254, required for Google-only accounts and must equal the account email.
- **Response**: `{ deleted: true }`; cookies cleared.
- **Rules**: `403` for the `owner` role. The deletion is audited (`user.delete`, `self: true`), the address's `email_approvals` row is deleted, then the user row (dependent rows cascade; see `docs/DATABASE.md`).

#### `POST /api/me/password`

- **Body**: `currentPassword?` max 200, required when the account already has a password; `newPassword` 1-200 (policy applies).
- **Response**: `{ changed: true }`. Every other session is revoked (the current one is kept) and a notice is emailed.
- **Errors**: `400 validation_error` on `currentPassword` or `newPassword`.

#### `GET /api/me/sessions`

- **Response**: up to 50 active sessions, most recently used first: `{ id, device, ipAddress, createdAt, lastUsedAt, expiresAt, current }`. `device` is a description such as "Chrome on Windows"; `ipAddress` is masked (`a.b.c.x`, or the first three IPv6 groups followed by `:…`).

#### `DELETE /api/me/sessions`

- **Response**: `{ revoked: number }`, the count of other sessions signed out.

#### `DELETE /api/me/sessions/{id}`

- **Response**: `{ revoked: true }`; `404` if the session is not yours or already revoked. Revoking the current session's own id signs this browser out.

#### `GET /api/me/preferences`

- **Response**: `{ emailEnabled, frequency, digestHour, digestMinute, timezone, settings: { inApp, jobChanges, sourceFailures }, approval, platformEmailEnabled, enforced, schedule: { description, nextAt, dueNow, lastSentAt } }`.
  - `approval` is `pending`, `approved` or `unapproved`, and always `approved` when auto-approval is on.
  - `enforced` is `{ frequency, description }` while staff enforce one frequency for everyone (and the account is not exempt), otherwise `null`.
  - `platformEmailEnabled` mirrors the `notifications.enabled` setting.

#### `PUT /api/me/preferences`

- **Body** (all optional): `emailEnabled` boolean; `frequency` max 40, one of `realtime`, `every_6_hours`, `every_12_hours`, `daily`, `twice_weekly`, `weekly`, `biweekly`, `monthly`, `custom_<n>_<hours|days|weeks>` with n 1-365 (`instant` is accepted as `realtime`; anything else gives 400); `digestHour` integer 0-23; `digestMinute` integer 0-59; `timezone` max 64; `settings` `{ inApp?, jobChanges?, sourceFailures? }` booleans, merged into the stored switches.
- **Response**: the same object as `GET`.

#### `GET /api/me/export`

- **Response**: a JSON file, not enveloped, `Content-Disposition: attachment; filename="jobpingly-export-YYYY-MM-DD.json"`: `{ exportedAt, profile, notificationPreferences, watchlists (owned, with companies), alerts (subscriptions with rules), tracker, notifications (latest 500) }`.

#### `POST /api/me/onboarding`

- **Response**: `{ completed: true }`. Sets `onboarding_completed_at` the first time only.

#### `GET /api/me/overview`

- **Response**: `{ counts, recentMatches, issues, reminders, notifications }`.
  - `counts`: `{ watchlists, companies, openJobs, newThisWeek, matchingThisWeek, saved, applied, interviewing, companiesWithIssues, pendingFirstScan, lastScanAt, nextScanAt, unread }`.
  - `recentMatches`: up to 8 open matching jobs not dismissed: `{ id, title, location, workplaceType, firstSeenAt, terms, companyName }`.
  - `issues`: up to 5 companies with monitoring problems: `{ id, url, name, companyName, status, lastErrorClass, lastSuccessAt, health, healthLabel, issue }`.
  - `reminders`: up to 5 unsent tracker reminders: `{ id, reminderAt, status, title, companyName }`.
  - `notifications`: `{ emailEnabled, approval, schedule, nextAt, dueNow, platformEmailEnabled }`.

#### `GET /api/me/invitations`

- **Response**: array of pending invitations younger than 14 days on live lists: `{ id, token, role, createdAt, listId, listName, inviterName }`.

#### `POST /api/invitations/{id}`

- **Body**: `action` `"accept"` or `"decline"`.
- **Response**: `{ status, listId }`. An invitation that was already answered returns its current status unchanged.
- **Errors**: `404` if the invitation is not addressed to you; `410 gone` after 14 days.

---

## 4. Notifications

Implementation: `app/api/notifications/*`, `lib/notifications/inapp.ts`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/notifications` | signed in | In-app notifications, newest first (paginated) |
| POST | `/api/notifications` | signed in | Mark notifications read |
| DELETE | `/api/notifications/{id}` | signed in | Delete one notification |

#### `GET /api/notifications`

- **Query**: `page`, `pageSize`; `unread?` boolean.
- **Response**: items `{ id, type, title, body, link, data, readAt, createdAt }`. `type` is one of `job_match`, `job_updated`, `source_failed`, `source_recovered`, `list_invite`, `contribution`, `reminder`, `system`. `link` is a site-relative path.
- **Meta**: the standard fields plus `unread` (count of unread notifications). With `unread=true`, `total` is the unread count.

#### `POST /api/notifications`

- **Body**: either `{ "all": true }` or `{ "ids": [uuid, …] }` with 1-200 ids.
- **Response**: `{ updated }`, the number that changed from unread to read.

#### `DELETE /api/notifications/{id}`

- **Response**: `{ deleted: true }`; `404` if the notification is not yours.

Notifications older than 60 days are deleted by the daily housekeeping, read or not.

---

## 5. Watchlists

Implementation: `app/api/lists/*`, `lib/lists/service.ts`, `lib/lists/members.ts`, `lib/lists/access.ts`, `lib/companies/service.ts`. Roles are described in [1.7](#17-roles-and-permissions).

| Method | Path | Auth | Purpose | Rate limit |
|---|---|---|---|---|
| GET | `/api/lists` | signed in | Lists you own, help maintain, or follow | - |
| POST | `/api/lists` | signed in | Create a list | 30 per hour per user |
| GET | `/api/lists/{id}` | optional | List detail, your access, your alert settings | - |
| PATCH | `/api/lists/{id}` | signed in; owner or moderator (some fields owner only) | Update details | - |
| DELETE | `/api/lists/{id}` | signed in; owner | Move to the trash | - |
| POST | `/api/lists/{id}/duplicate` | signed in; any role | Copy into a new private list | 20 per hour per user |
| POST | `/api/lists/{id}/follow` | signed in; any role except owner | Follow | 60 per hour per user |
| DELETE | `/api/lists/{id}/follow` | signed in | Unfollow | - |
| GET | `/api/lists/{id}/companies` | optional | Companies with monitoring health | - |
| POST | `/api/lists/{id}/companies` | signed in; editor or above | Add a company | 120 per hour per user |
| POST | `/api/lists/{id}/companies/import` | signed in; editor or above | Add many companies from text | 10 per hour per user |
| PATCH | `/api/lists/{id}/companies/{companyId}` | signed in; editor or above | Pause, categorise, annotate, or replace the URL | - |
| DELETE | `/api/lists/{id}/companies/{companyId}` | signed in; editor or above | Remove a company | - |
| PUT | `/api/lists/{id}/alerts` | signed in | Your alert settings for this list | - |
| POST | `/api/lists/{id}/alerts/preview` | signed in | Dry-run alert rules against open jobs | 120 per 10 min per user |
| GET | `/api/lists/{id}/export` | optional | Companies as CSV | - |
| GET | `/api/lists/{id}/members` | signed in; member | Collaborators | - |
| POST | `/api/lists/{id}/members` | signed in; owner | Invite by email | service: 20 per day per inviter (distributed) |
| DELETE | `/api/lists/{id}/members/{memberId}` | signed in; owner, or the member themself | Remove a member or leave | - |
| GET | `/api/lists/{id}/suggestions` | signed in; owner or moderator | Pending suggestions | - |
| POST | `/api/lists/{id}/suggestions` | signed in; viewer of a public list | Suggest a company | service: 15 per day per user (distributed) |
| POST | `/api/lists/{id}/suggestions/{suggestionId}` | signed in; owner or moderator | Approve or reject a suggestion | - |

#### `GET /api/lists`

- **Response**: array, pinned first then most recently updated: `{ id, name, slug, description, visibility, tags, pinned, followers, relation, owner: { id, name }, companies, openJobs, newThisWeek, issues, alerts, updatedAt }`.
  - `relation` is `owner`, `moderator`, `editor` or `follower`. Followed lists are included only while public.
  - `alerts` is `{ enabled, frequency, summary }`, or `null` when you have no subscription row.

#### `POST /api/lists`

- **Body**: `name` trimmed, 1-80; `description?` max 300 `| null`; `visibility` `private` (default) or `public`; `tags?` array of at most 8 strings, each max 30 (stored lower-cased and de-duplicated).
- **Response**: `201 { id, slug, name }`. The slug is the slugified name plus a random 6-hex suffix.
- **Errors**: `403 limit_reached` with `details.limit` when you own as many live lists as your plan allows.
- Also creates your own subscription row for the list (alerts on, frequency `inherit`).

#### `GET /api/lists/{id}`

- Anonymous callers can read public lists.
- **Response**: `{ list, access, subscription, stats, limits }`.
  - `list`: `{ id, name, slug, description, visibility, tags, pinned, followers, featured, createdAt, updatedAt, owner: { id, name } }`.
  - `access`: `{ role, isFollowing, canEditCompanies, canEditDetails, canChangeVisibility, canManageMembers, canReviewSuggestions, canDelete }`.
  - `subscription`: `{ alertsEnabled, digestFrequency, rules, summary }`, or `null`.
  - `stats`: `{ companies, openJobs, newThisWeek, issues, pendingSuggestions }` (`pendingSuggestions` is 0 unless you can review them).
  - `limits`: `{ companiesPerList }` for the owner's plan; `null` means unlimited.

#### `PATCH /api/lists/{id}`

- **Body** (all optional): `name` max 80; `description` max 300 `| null`; `visibility`; `tags` (as for create); `pinned` boolean.
- `name`, `description` and `tags` need owner or moderator. `visibility` and `pinned` need the owner. Otherwise `403`.
- **Response**: the same object as `GET /api/lists/{id}`.

#### `DELETE /api/lists/{id}`

- **Response**: `{ deleted: true }`. Owner only.
- Soft delete: sets `deleted_at`, deletes all matches recorded for the list and settles its pending email alerts without sending them. Staff can restore it.

#### `POST /api/lists/{id}/duplicate`

- **Body**: `name?` trimmed, max 80 (default `"<name> (copy)"`).
- **Response**: `201 { id, slug, name }`.
- Creates a private list (counts against your list limit), copies the companies with their categories (notes are not copied) up to your companies-per-list limit, sets `parent_list_id`, copies your own alert rules from the source list if you had any, and computes matches.

#### `POST /api/lists/{id}/follow`

- **Response**: `{ following: true, followers }`. `409` for the owner.
- Creates your subscription row (alerts on, frequency `inherit`) and records matches for jobs that are already open. Those existing jobs are never emailed.

#### `DELETE /api/lists/{id}/follow`

- **Response**: `{ following: false, followers }`.
- Works even after the list became private or was trashed. `404` only if the list row does not exist; `409` for the owner. Deletes your matches for the list and settles your pending alerts for it.

#### `GET /api/lists/{id}/companies`

- **Response**: array sorted by name: `{ id, url, companyName, name, logoUrl, websiteUrl, adapter, status, pausedReason, lastSuccessAt, lastScrapedAt, nextCheckAt, consecutiveFailures, lastErrorClass, openJobs, newThisWeek, isPaused, category, notes, addedAt, health, healthLabel, issue }`.
  - `id` is the career page (company) id, shared across lists.
  - `health` is `pending` (never scanned successfully, no error yet), `active`, `degraded`, `broken` or `paused`. `issue` is `{ label, hint }` or `null`.

#### `POST /api/lists/{id}/companies`

- **Body**: `url` trimmed, 1-2048 (URL rules in [1.4](#14-input-validation), DNS checked); `companyName?` max 120 `| null`; `category?` max 60 `| null`; `notes?` max 500 `| null`.
- **Response**: `201 { id, url, name, adapter, status, scanQueued }`.
- The company registry is shared: an existing source with the same canonical URL is reused. A scan is queued when the source is not paused and has never succeeded or last succeeded more than 24 hours ago. Jobs that are already open are matched for the list's subscribers without sending email.
- **Errors**: `403` (role), `403 limit_reached` (companies per list, by the owner's plan), `409 conflict` (already on the list), `400 validation_error` (URL).

#### `POST /api/lists/{id}/companies/import`

- **Body** (max 250 KB): `text` string 1-200,000. One entry per line. Lines starting with `#` and a header row whose first cell is `url`, `career page` or `careers url` are skipped. Each line is split on commas; the first cell that looks like a URL or a domain is the URL, the next other cells are the company name and the category.
- **Response**: `{ added: [{ id, name, url }], skipped: [{ url, reason }] }`.
- Each entry is processed like a single add; duplicate URLs in the text (case-insensitive) are ignored; once `limit_reached` occurs, all remaining entries are reported as skipped.
- **Errors**: `400` when no URL is found or there are more than 200 entries.

#### `PATCH /api/lists/{id}/companies/{companyId}`

- `companyId` is the career page id.
- **Body** (all optional): `isPaused` boolean (excludes the company from this list's feed, matching, alerts and open-job counts; other lists are unaffected); `category` max 60 `| null`; `notes` max 500 `| null`; `url` trimmed, 1-2048: replaces the company's source within this list only (other lists keep the old one).
- **Response**: `{ id }`, the career page id now linked. It differs from `companyId` after a URL change.
- **Errors**: `404` (not on the list), `409` (the new source is already on the list).

#### `DELETE /api/lists/{id}/companies/{companyId}`

- **Response**: `{ removed: true }`; `404` if the company is not on the list.
- Deletes this list's matches for that company's jobs and settles pending alerts for them.

#### `PUT /api/lists/{id}/alerts`

- **Body**: `alertsEnabled?` boolean; `digestFrequency?` max 40, `inherit` or a frequency accepted by `PUT /api/me/preferences`; `rules?` a rules object (below).
- A viewer of a public list must follow it first (`409`). Members and the owner always have or get a row.
- **Rules** (`lib/matching/rules.ts`), each key optional with the default shown:
  - `include`: array of at most 5 groups, each an array of at most N terms (term trimmed, 1-60). A job matches when every group has at least one term present. Empty means every job.
  - `exclude`: at most N terms; any of them in the title rejects the job.
  - `fields`: 1-4 of `title`, `department`, `location`, `description` (default the first three).
  - `wholeWord`: boolean, default true.
  - `workplace` (`remote`, `hybrid`, `onsite`), `employment` (`full_time`, `part_time`, `contract`, `internship`, `temporary`), `seniority` (`intern`, `junior`, `mid`, `senior`, `lead`, `executive`): filters, default empty.
  - `locations`: at most N terms.
  - `includeUnknown`: boolean, default true; jobs that do not state a facet pass that facet's filter.
  - N is your plan's terms-per-alert limit ([1.12](#112-maintenance-mode-and-platform-switches)).
- **Response**: `{ alertsEnabled, digestFrequency, rules, summary, matchingOpenJobs }`. `matchingOpenJobs` (matches recomputed against open jobs) is `null` unless the rules changed or the subscription row was created.

#### `POST /api/lists/{id}/alerts/preview`

- **Body**: `rules`, same schema with N = 500 whatever the plan.
- **Response**: `{ total, matching, sample, summary }`. `sample` is up to 8 `{ id, title, company, location, reasons }`. Evaluates up to 20,000 open jobs of the list's unpaused companies. Nothing is saved.

#### `GET /api/lists/{id}/export`

- **Response**: CSV with columns `URL, Company, Category, Open jobs, Status`, filename `<slug of the list name>-companies.csv`. The format is accepted by the import endpoint. Cells that start with `=`, `+`, `-`, `@`, tab or carriage return are prefixed with `'`.

#### `GET /api/lists/{id}/members`

- **Response**: collaborators that have not declined: `{ id, userId, role, status, createdAt, name, email }`. `email` is set only for the owner; other members see `null`.
- **Errors**: `403` for viewers.

#### `POST /api/lists/{id}/members`

- **Body**: `email` email, max 254; `role` `editor` (default) or `moderator`.
- **Response**: always `{ sent: true }`, whether or not the address has an account.
- Owner only. Inviting your own address gives `400`. For a verified, unsuspended account: creates or refreshes a pending invitation (a declined or pending one gets a new invite token; an accepted member only changes role), emails a link to `/invite/<token>` and adds an in-app notification. Invitations expire after 14 days.

#### `DELETE /api/lists/{id}/members/{memberId}`

- `memberId` is the collaborator row id (from the members list).
- **Response**: `{ removed: true, leftList: boolean }`. The owner can remove anyone; any member can remove themself. `404` if not found.

#### `GET /api/lists/{id}/suggestions`

- **Response**: pending suggestions, oldest first: `{ id, url, companyName, status, createdAt, contributor }` (`contributor` is the suggester's name).

#### `POST /api/lists/{id}/suggestions`

- **Body**: `url` trimmed, 1-2048 (syntax check only; DNS is checked when it is approved); `companyName?` max 120 `| null`.
- **Response**: `{ submitted: true }`, also when an identical suggestion is already pending.
- **Errors**: `404` unless the list is public; `403` when suggestions are off; `409` if you can already edit the list; `429` after 15 suggestions in a day.
- Notifies the owner in-app.

#### `POST /api/lists/{id}/suggestions/{suggestionId}`

- **Body**: `action` `"approve"` or `"reject"`.
- **Response**: `{ status: "approved" | "rejected" }`.
- Approving adds the company like a normal add (if it is already on the list that is not an error) and increments the list's `contribution_count`. `409` if the suggestion was already reviewed.

---

## 6. Companies

A company is a monitored careers source (`career_pages`), shared by every list that includes it. Users never edit a source directly. Implementation: `app/api/companies/*`, `lib/companies/service.ts`.

| Method | Path | Auth | Purpose | Rate limit |
|---|---|---|---|---|
| GET | `/api/companies` | signed in | Companies on your lists, with health | - |
| POST | `/api/companies/preview` | signed in | Read a careers URL without saving anything | 20 per 10 min per user and 40 per 10 min per IP |
| GET | `/api/companies/{id}` | optional | Company profile, stats, recent scans | - |
| POST | `/api/companies/{id}/rescan` | signed in; owner or collaborator of a list containing it | Queue a scan now | 30 per hour per user; service: 1 per 10 min per company (memory only) |

#### `GET /api/companies`

- **Query**: `q?` (company name or URL, case-insensitive); `health` one of `all` (default), `issues` (degraded, broken or paused), `active`, `degraded`, `broken`, `paused`, `pending`; `list?` UUID.
- **Response**: array, at most 2,000, sorted by name: `{ id, url, companyName, name, logoUrl, adapter, status, pausedReason, lastSuccessAt, nextCheckAt, lastErrorClass, openJobs, newThisWeek, lists: [{ id, name, canEdit }], health, healthLabel, issue }`.
- Scope: companies that are unpaused on at least one list you own, collaborate on, or follow (public).

#### `POST /api/companies/preview`

- **Body**: `url` trimmed, 1-2048 (URL rules, DNS checked).
- **Response**, always 200: success `{ ok: true, url, adapter, adapterLabel, kind, companyName, jobCount, partial, sample }` where `sample` is up to 6 `{ title, location }`; failure `{ ok: false, url, errorClass, label, hint, message }`.
- At most 20 HTTP requests and 2 pages; `robots.txt` honoured; AI extraction off.

#### `GET /api/companies/{id}`

- Visible when the company is on one of your lists, or on any live public list (anonymous callers: public lists only). Otherwise `404`.
- **Response**: `{ company, stats, scans, lists }`.
  - `company`: `{ id, name, url, websiteUrl, logoUrl, industry, location, adapter, adapterLabel, lastSuccessAt, lastScrapedAt, nextCheckAt, health, healthLabel, issue }`.
  - `stats`: `{ openJobs, newThisWeek, closedThisMonth, firstSeen }`.
  - `scans`: the last 10 scans `{ scrapedAt, outcome, jobsFound, jobsAdded, jobsRemoved, errorClass, errorLabel }`.
  - `lists`: your lists containing it, `{ id, name, canEdit }` (empty for anonymous callers).

#### `POST /api/companies/{id}/rescan`

- **Response**: `{ queued: true, alreadyQueued: boolean }`.
- A source that was paused automatically after repeated failures is put back into rotation (status `degraded`). The task is a forced manual scan at priority 100.
- **Errors**: `404` unless the company is on a live list you own or collaborate on (accepted); `429` if it was rescanned in the last 10 minutes.

---

## 7. Jobs

Implementation: `app/api/jobs/*`, `lib/jobs/queries.ts`, `lib/jobs/tracker.ts`. You see the jobs of every company that is unpaused on a list you own, collaborate on, or follow (public). Jobs hidden by staff are never shown.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/jobs` | signed in | Job feed (paginated) |
| GET | `/api/jobs/{id}` | signed in | Job detail, history, why it matched, your tracking |
| PUT | `/api/jobs/{id}` | signed in | Save, dismiss or track the job |

#### `GET /api/jobs`

- **Query**: `page`, `pageSize`; `view` (default `matching`); `q?` (title, company, location, department); `list?` UUID; `company?` UUID; `workplace?`, `employment?`, `seniority?` comma-separated values (unknown values are ignored); `posted?` integer 1-365 (days, by posting date or else first-seen date); `sort` `newest` (default, by first seen), `posted`, `company`, `title`; `counts?` `0` or `1`.
- **Views**:

  | `view` | Jobs |
  |---|---|
  | `matching` | Open jobs with a recorded match for you, not dismissed |
  | `new` | Open jobs first seen in the last 7 days, not dismissed |
  | `all` | Open jobs, not dismissed |
  | `closed` | Jobs closed in the last 30 days |
  | `dismissed` | Jobs you dismissed |

- **Response**: items `{ id, title, url, location, department, workplaceType, employmentType, seniority, salaryText, postedAt, deadlineAt, firstSeenAt, status, closedAt, company: { id, name, url, logoUrl }, userStatus, matched, matchedTerms }`.
- **Meta**: the standard fields, plus `counts: { matching, new, all, closed, dismissed }` when `counts=1` (scoped to `list` if given).

#### `GET /api/jobs/{id}`

- `404` unless the job's company is in your scope or you have a tracker entry for the job. Hidden jobs are `404`.
- **Response**: `{ job, company, history, matches, tracking }`.
  - `job`: `{ id, title, url, location, department, jobType, workplaceType, employmentType, seniority, salaryText, salaryMin, salaryMax, salaryCurrency, description, postedAt, deadlineAt, firstSeenAt, lastSeenAt, status, closedAt, reopenedAt }`.
  - `company`: `{ id, name, url, websiteUrl, logoUrl, industry, location, openJobs }`.
  - `history`: the last 30 events `{ type, changes, createdAt }`; `type` is `discovered`, `updated`, `closed`, `reopened`, `hidden` or `restored`.
  - `matches`: `{ listId, listName, terms, explanation }` for each of your lists that matched it.
  - `tracking`: `{ status, notes, appliedAt, reminderAt, updatedAt }` or `null`.

#### `PUT /api/jobs/{id}`

- **Body**: `status?` one of `saved`, `applied`, `interviewing`, `offer`, `rejected`, `withdrawn`, `dismissed`, or `null` (removes your entry, which also un-dismisses the job); `notes?` max 5000 `| null`; `appliedAt?` max 40 `| null` (a date string); `reminderAt?` max 40 `| null`.
- **Response**: `{ tracking: { id, status, notes, appliedAt, reminderAt } | null }`.
- Creates or updates your tracker entry with a snapshot of the title, company, URL and location. The default status is `saved`. Moving to `applied` sets `appliedAt` to now unless given or already set. Setting `reminderAt` re-arms the reminder.
- **Errors**: `404` (job not visible), `400` for a date that cannot be parsed.

---

## 8. Tracker

Implementation: `app/api/tracker/*`, `lib/jobs/tracker.ts`. Entries are rows of `user_jobs`; they can point at a JobPingly job or be added by hand.

| Method | Path | Auth | Purpose | Rate limit |
|---|---|---|---|---|
| GET | `/api/tracker` | signed in | Your tracker entries (dismissed excluded) | - |
| POST | `/api/tracker` | signed in | Add a job found elsewhere | 120 per hour per user |
| PATCH | `/api/tracker/{id}` | signed in | Update an entry | - |
| DELETE | `/api/tracker/{id}` | signed in | Delete an entry | - |
| GET | `/api/tracker/export` | signed in | CSV download | 20 per hour per user |

#### `GET /api/tracker`

- **Response**: up to 2,000 entries, most recently updated first: `{ id, jobId, status, notes, appliedAt, reminderAt, createdAt, updatedAt, title, companyName, url, location, external, postingStatus }`.
  - `postingStatus`: `active` or `closed` (the job's own status), `removed` (the job no longer exists on JobPingly; the snapshot is shown), or `external` (added by hand).

#### `POST /api/tracker`

- **Body**: `title` trimmed, 1-200; `companyName` trimmed, 1-120; `url?` max 2000 `| null` (kept only if http or https); `location?` max 120 `| null`; `status?` one of `saved` (default), `applied`, `interviewing`, `offer`, `rejected`, `withdrawn`; `notes?` max 5000 `| null`.
- **Response**: `201` with the stored row `{ id, userId, jobId: null, status, notes, appliedAt, reminderAt, reminderSentAt, snapshot, createdAt, updatedAt }`.
- **Errors**: `403 limit_reached` when you already have 2,000 entries (all statuses counted).

#### `PATCH /api/tracker/{id}`

- `id` is the tracker entry id.
- **Body** (all optional): `status` any of the seven statuses (not `null`); `notes` max 5000 `| null`; `appliedAt`, `reminderAt` max 40 `| null`; `title` max 200, `companyName` max 120, `url` max 2000 `| null` (these three change only hand-added entries).
- **Response**: the stored row. `404` if the entry is not yours.

#### `DELETE /api/tracker/{id}`

- **Response**: `{ deleted: true }`; `404` if not yours.

#### `GET /api/tracker/export`

- **Response**: CSV with columns `Title, Company, Status, Applied, Reminder, Location, Link, Posting, Notes, Updated`, filename `jobpingly-applications-YYYY-MM-DD.csv`. Formula-like cells are escaped as for the list export.

---

## 9. Public directory

Implementation: `app/api/public/*`, `lib/public/directory.ts`, `lib/jobs/queries.ts`.

| Method | Path | Auth | Purpose | Rate limit |
|---|---|---|---|---|
| GET | `/api/public/lists` | none | Directory of public watchlists (paginated) | 120 per min per IP |
| GET | `/api/public/lists/{slug}` | optional | One public list with its companies | - |
| GET | `/api/public/lists/{slug}/jobs` | none | Open jobs at a public list's companies (paginated) | 120 per min per IP |
| GET | `/api/public/users/{id}` | none | A curator's public profile | - |

The three `/api/public/lists` endpoints return `503 unavailable` when `public_lists.enabled` is off. `/api/public/users/{id}` does not check that setting.

#### `GET /api/public/lists`

- **Query**: `page`; `pageSize` 1-48 (default 24); `q?` (list name, description, or a company name on the list); `tag?` max 30 (exact tag); `sort` `popular` (default: followers, then open jobs, then recently updated), `newest`, `companies`, `jobs`.
- Only live public lists that have at least one company and whose owner is not suspended. Featured lists come first.
- **Response**: items `{ id, name, slug, description, tags, followers, featured, companies, openJobs, topCompanies, owner: { id, name, avatarUrl }, updatedAt }`; `topCompanies` is up to 4 company names.

#### `GET /api/public/lists/{slug}`

- `404` if the list is not public, is deleted, or its owner is suspended.
- **Response**: `{ list: { id, name, slug, description, tags, followers, featured, createdAt, updatedAt }, owner: { id, name, avatarUrl }, viewer: { role, isFollowing, canEdit }, companies: [{ id, name, url, logoUrl, openJobs, category, healthLabel, health }], openJobs }`.

#### `GET /api/public/lists/{slug}/jobs`

- **Query**: `page`, `pageSize` (max 100); `q?` (title, company, location).
- **Response**: items `{ id, title, url, location, workplaceType, employmentType, firstSeenAt, postedAt, company: { id, name } }`, newest first, from the list's unpaused companies.

#### `GET /api/public/users/{id}`

- `404` unless the user is not suspended and owns at least one live public list with companies.
- **Response**: `{ user: { id, name, socials, createdAt, avatarUrl }, lists: [{ id, name, slug, description, followers, companies }] }`.

---

## 10. Operational endpoints

| Method | Path | Auth | Purpose | Rate limit |
|---|---|---|---|---|
| GET, HEAD | `/api/health` | none | Liveness and readiness | exempt from the global limit |
| GET | `/api/banner` | none | Current site announcement | - |
| GET | `/api/avatar/{id}` | none | Uploaded profile picture | - |
| POST | `/api/issues` | optional | Report a problem or send feedback | 5 per 15 min per IP (distributed) |
| POST | `/api/unsubscribe` | signed token | One-click unsubscribe, or resubscribe | 30 per 10 min per IP (memory) |
| GET | `/api/unsubscribe` | none | Redirect to the confirmation page | - |
| POST, GET | `/api/cron/tick` | `CRON_SECRET` | Run one worker cycle | - |
| POST | `/api/webhooks/brevo` | `BREVO_WEBHOOK_SECRET` | Email delivery events | - |

#### `GET /api/health`, `HEAD /api/health`

- Meant for uptime monitors and the hosting platform. Reveals no configuration.
- `GET` returns a bare object (no envelope), `Cache-Control: no-store`:

  ```json
  {
    "status": "ok",
    "checks": {
      "database": { "ok": true, "latencyMs": 3 },
      "worker": { "ok": true, "secondsSinceHeartbeat": 41 }
    },
    "time": "2026-11-16T09:00:00.000Z"
  }
  ```

  | `status` | HTTP | Meaning |
  |---|---|---|
  | `ok` | 200 | Database reachable and at least one worker is alive |
  | `degraded` | 200 | Database reachable, no live worker |
  | `down` | 503 | Database unreachable |

  A long-running worker counts as alive if it reported within 3 poll intervals (at least 5 minutes); a scheduled one-shot worker (`worker:once`, cron) if it ran within the last 4 hours (`lib/monitoring/scheduler.ts`).
- `HEAD` checks only the database: 200 or 503, no body.

#### `GET /api/banner`

- **Response**: `{ data: { enabled: false } }`, or `{ data: { enabled: true, id, tone, message, linkUrl, linkText } }` where `tone` is `info`, `success` or `warning`, `message` is at most 300 characters, `linkUrl` is an http(s) URL or a site-relative path or `null`, and `linkText` is at most 40 characters or `null`. Source: the `banner.config` setting.
- `Cache-Control: public, max-age=60, stale-while-revalidate=300`.

#### `GET /api/avatar/{id}`

- `{id}` is a user id. `404` (empty body) for an invalid id, no avatar, a suspended user, or a stored image that fails validation.
- An uploaded avatar (stored as a data URL) is returned as image bytes with its `Content-Type`, `Cache-Control: public, max-age=604800, immutable`, `Content-Security-Policy: default-src 'none'; sandbox` and `X-Content-Type-Options: nosniff`. An external `https:` avatar is a `302` redirect to that URL.

#### `POST /api/issues`

- **Body**: `category` one of `broken_url`, `scraper_bug`, `ui_bug`, `feature_request`, `general` (default); `subject` trimmed, 3-140; `description` trimmed, 10-5000; `email?` email, max 254 (required when not signed in; a signed-in user's account email is used instead); `name?` max 80; `targetUrl?` max 2000 (kept only if http or https).
- **Response**: `201 { id }`.

#### `POST /api/unsubscribe`

RFC 8058 one-click unsubscribe. Mailbox providers POST to the `List-Unsubscribe` URL of digest and broadcast emails (sent with `List-Unsubscribe-Post: List-Unsubscribe=One-Click`); the `/unsubscribe` page POSTs here when the user confirms.

- **Query**: `token` (required); `action=resubscribe` (optional; used by the page's "changed your mind" button).
- **Token**: `base64url(JSON { uid, act: "unsub" }) + "." + base64url(HMAC-SHA256(APP_SECRET))`, at most 2,048 characters. It carries no expiry. It authorises only this action. See `lib/email/unsubscribe.ts`, `lib/auth/tokens.ts`.
- **Effect**: sets `users.email_notifications_enabled` to false (or true for `resubscribe`). That stops digests, reminder emails and broadcasts; sign-in codes, password resets and invitations are still sent.
- **Responses**: `200 { data: { unsubscribed: true } }` (or `false` after resubscribing), `Cache-Control: no-store`; `400 invalid_token`; `404 not_found` (the account no longer exists); `429 rate_limited` without `Retry-After`.
- Exempt from the cross-site check; not affected by maintenance mode; no session needed.

#### `GET /api/unsubscribe`

- **Response**: `303` redirect to `/unsubscribe?token=…`. It changes nothing, so link scanners that prefetch URLs cannot unsubscribe anyone.

#### `POST /api/cron/tick` (also `GET`)

Lets an external scheduler drive monitoring when no always-on worker runs (for example a free instance that sleeps). The request also wakes the service.

```sh
curl -X POST "https://HOST/api/cron/tick" -H "Authorization: Bearer $CRON_SECRET"
```

- **Auth**: `Authorization: Bearer <CRON_SECRET>`, compared in constant time. While `CRON_SECRET` is unset or shorter than 16 characters the endpoint returns `404` with an empty body. A wrong or missing secret gives `401 { error: { code: "unauthorized", message: "Invalid cron secret." } }`.
- **Work**: one cycle with `mode: "cron"`, worker id `<WORKER_ID>-cron`, a 45-second claiming budget and at most 25 scans (`maxDuration` 60 s): heartbeat, recover expired leases, queue due sources (only while the `scraper.enabled` setting is on), run queued scans, close jobs whose deadline passed, send due reminders, deliver due email alerts, and housekeeping if it has not run in this process in the last 24 hours (`lib/monitoring/scheduler.ts`).
- **Response**: `200 { data: CycleReport }` with `Cache-Control: no-store`. `CycleReport` is `{ workerId, mode, monitoringEnabled, enqueued, recovered, claimed, succeeded, failed, jobsAdded, jobsRemoved, emailsSent, durationMs, error?, skipped?, matchesBackfilled? }`.
  - `skipped` (still 200) means the database is missing the migration named in `LATEST_MIGRATION`; nothing ran.
  - `409` when the cycle reported an `error` and claimed no task, for example "A cycle is already running in this process."
- Exempt from the cross-site check (GET is accepted for schedulers that can only GET).

#### `POST /api/webhooks/brevo`

Configure in Brevo as `https://HOST/api/webhooks/brevo?token=<BREVO_WEBHOOK_SECRET>` with the events delivered, hard bounce, soft bounce, blocked, spam and invalid email.

- **Auth**: the `token` query parameter, compared in constant time. `404` (empty body) while `BREVO_WEBHOOK_SECRET` is unset; `401` (empty body) for a wrong token.
- **Body**: one event object or an array; the first 100 are processed. Fields read: `event`, `message-id` (or `messageId`), `email`.

  | `event` | Stored `delivery_status` |
  |---|---|
  | `delivered` | `delivered` |
  | `hard_bounce`, `hardBounce`, `invalid_email`, `invalidEmail` | `bounced` |
  | `soft_bounce`, `softBounce`, `deferred` | `deferred` |
  | `blocked` | `blocked` |
  | `spam`, `complaint` | `complained` |

- **Effect**: updates `sent_email_logs` rows with that provider message id. For `bounced` or `complained`, also sets `email_notifications_enabled = false` on the user with that email.
- **Response**: `{ data: { applied } }`, the number of log rows updated. `400 bad_request` if the body is not JSON. Events with an unknown type or no message id are skipped.

#### Legacy redirect

`next.config.mjs` redirects `GET /api/collaborators/accept?token=<uuid>` (links in v1 invitation emails) with `307` to `/invite/<uuid>`. There is no route file for it.

---

## 11. Admin

All endpoints under `/api/admin` require a session whose role grants the permission shown ([1.7](#17-roles-and-permissions)); otherwise `401` or `403 forbidden`. Staff are never blocked by maintenance mode. Mutations are written to `admin_audit_log`; the action name is given in parentheses. Implementation: `app/api/admin/*`, `lib/admin/*.ts`.

### 11.1 Overview and system

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/overview` | `overview.read` | Platform metrics |
| GET | `/api/admin/system` | `overview.read` | Service status, database, migrations, runtime |

#### `GET /api/admin/overview`

- **Response**: `{ counts, series, failuresByClass, adapters, queue, workers, email, switches }`.
  - `counts`: user, source, job, scan, list, alert, approval and issue counts (for example `usersTotal`, `sourcesBroken`, `jobsOpen`, `scansFailed24h`, `pendingAlerts`, `openIssues`), plus `dbBytes` (cached for 10 minutes per process) and `scanSuccessRate24h` (`null` without scans).
  - `series`: 30 daily rows `{ day, signups, jobs, scansOk, scansFailed, emailsSent, emailsFailed }`.
  - `failuresByClass`: up to 8 `{ errorClass, count, label }` for the last 24 hours. `adapters`: `{ adapter, count, label }`.
  - `queue` and `workers`: as in `GET /api/admin/monitoring`.
  - `email`: `{ sentToday, failedToday, totalToday, dailyLimit, digestLimit, provider }`.
  - `switches`: `{ monitoring, emailAlerts, maintenance, signups }`.

#### `GET /api/admin/system`

- **Response**: `{ services, database, tables, migrations, runtime, adapters }`.
  - `services`: `{ id, label, status, detail }` for `database`, `email`, `ai`, `redis`, `cron`, `google`; `status` is `ok`, `warning`, `off` or `down`.
  - `database`: `{ bytes, version, connections, maxConnections }`, or `null` if the database is unreachable.
  - `tables`: the 12 largest tables `{ table, rows, bytes }` (row counts are planner estimates).
  - `migrations`: `{ name, appliedAt }` from `schema_migrations`.
  - `runtime`: `{ node, environment, scannerVersion, workerMode, appUrl, uptimeSeconds, memoryMb }`.

### 11.2 Users

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/users` | `users.read` | Search users (paginated) |
| GET | `/api/admin/users/{id}` | `users.read` | User detail |
| POST | `/api/admin/users/{id}` | `users.manage`, plus a per-action permission | Apply an action |
| DELETE | `/api/admin/users/{id}` | `users.delete` | Delete the account |

#### `GET /api/admin/users`

- **Query**: `page`, `pageSize`; `q?` (email or name substring, or an exact user id); `status` `all` (default), `active` (verified and not suspended), `unverified`, `suspended`, `staff`; `role?` one of the roles; `plan?` `free`, `pro`, `team`; `sort` `newest` (default), `oldest`, `active`, `name`.
- **Response**: items `{ id, email, name, avatarUrl, role, plan, emailVerified, isBlocked, blockedReason, quotaExempt, lastActiveAt, createdAt, approval, lists, following, tracked }`.

#### `GET /api/admin/users/{id}`

- **Response**: `{ user, approval, lists, activity, emails, history, devices }`.
  - `user`: profile, role, plan and expiry, verification, suspension, exemptions, `dispatchGroup`, notification preferences, login and activity times, `hasPassword`, `hasGoogle`.
  - `approval`: `{ status, approvedAt }` or `null`.
  - `lists`: up to 100 lists owned or followed (trashed ones included) `{ id, name, visibility, relation, companies, deletedAt }`.
  - `activity`: `{ sessions, tracked, applied, matches, pendingAlerts, unread }`.
  - `emails`: the 15 most recent emails to the address. `history`: the 20 most recent audit entries targeting the user. `devices`: up to 10 active sessions.

#### `POST /api/admin/users/{id}`

- **Body**: an object discriminated by `action`:

  | `action` | Extra fields | Extra permission | Rank check | Effect (audit action) |
  |---|---|---|---|---|
  | `suspend` | `reason` 1-300 | - | yes | Sets `is_blocked`, reason and time; revokes all sessions (`user.suspend`) |
  | `reactivate` | - | - | yes | Clears the suspension (`user.reactivate`) |
  | `verify` | - | - | no | Marks the email verified and records the approval (`user.verify`) |
  | `set_role` | `role` | `users.roles` | owner only, not self | Changes the role; demoting the last owner gives `409` (`user.role_change`) |
  | `set_plan` | `plan` (`free`, `pro`, `team`), `expiresAt?` max 40 `\| null` | `users.plans` | yes | Sets plan and expiry (`user.plan_change`) |
  | `set_exemptions` | `quotaExempt?`, `frequencyEnforcementExempt?` booleans | `users.plans` | yes | Sets the flags (`user.exemption_change`) |
  | `send_reset_link` | - | - | no | Emails a password-reset link, which also completes verification when followed (`user.resend_verification`) |
  | `revoke_sessions` | - | - | yes | Signs the user out everywhere (`user.sessions_revoked`) |
  | `approve_email` | - | `emails.manage` | no | Approves the address for alert emails; sends the welcome email on first approval (`email.approve`) |
  | `revoke_email` | - | `emails.manage` | no | Sets the approval to `unapproved` (`email.revoke`) |

  "Rank check" means the actor's role must rank strictly above the target's and the target must not be the actor; otherwise `403`.
- **Response**: the user detail object, as in `GET`.

#### `DELETE /api/admin/users/{id}`

- **Response**: `{ deleted: true }`. Rank check applies. Audited (`user.delete`) before the address's approval row and the user row are deleted.

### 11.3 Sources

| Method | Path | Auth | Purpose | Rate limit |
|---|---|---|---|---|
| GET | `/api/admin/sources` | `sources.read` | Search sources (paginated) | - |
| POST | `/api/admin/sources` | `sources.manage` | Register a source | - |
| GET | `/api/admin/sources/{id}` | `sources.read` | Source detail, scan history, tasks | - |
| PATCH | `/api/admin/sources/{id}` | `sources.manage` | Edit, pause or resume | - |
| DELETE | `/api/admin/sources/{id}` | `sources.delete` | Delete the source and all its jobs | - |
| POST | `/api/admin/sources/{id}/scan` | `sources.manage` | Queue a high-priority scan | - |
| POST | `/api/admin/sources/test` | `sources.manage` | Dry-run extraction for a URL | 30 per 10 min per user |
| POST | `/api/admin/sources/bulk` | `sources.manage` (`sources.delete` for delete) | Bulk scan, pause, resume, delete | - |

#### `GET /api/admin/sources`

- **Query**: `page`, `pageSize`; `q?` (company name or URL); `status` `all` (default), `active` (healthy and has succeeded), `degraded`, `broken`, `paused`, `pending` (never succeeded, not paused), `unwatched` (on no live list); `adapter?` max 40; `sort` `name` (default), `newest`, `failures`, `jobs`, `last_success`, `next_check`.
- **Response**: items `{ id, url, companyName, name, adapter, adapterLabel, adapterOverride, status, pausedReason, priority, lastSuccessAt, lastFailureAt, nextCheckAt, consecutiveFailures, lastErrorClass, errorLabel, lastError, lastDurationMs, openJobs, lists, followers, activeTask, createdAt }`.
- **Meta**: the standard fields plus `counts` (one count per status filter) and `adapters` (`[{ id, label, kind }]`).

#### `POST /api/admin/sources`

- **Body**: `url` trimmed, 1-2048 (URL rules, DNS checked); `companyName?` max 120 `| null`; `scanNow` boolean, default true.
- **Response**: `201 { id, url }`. If the canonical URL is already registered, the existing source is returned (still 201). With `scanNow`, a manual scan is queued (`source.create`).

#### `GET /api/admin/sources/{id}`

- **Response**: `{ source, lists, scans, tasks, jobStats, adapters }`.
  - `source`: every `career_pages` column plus `name`, `adapterLabel`, `error` (`{ label, hint }` or `null`) and `createdByEmail`.
  - `lists`: up to 200 live lists that include it `{ id, name, visibility, ownerEmail, isPaused }`.
  - `scans`: the last 50 `scrape_logs` rows plus `errorLabel`. `tasks`: the last 20 `monitor_tasks` rows.
  - `jobStats`: `{ open, closed, hidden, new7d }`. `adapters`: as in the list's meta.

#### `PATCH /api/admin/sources/{id}`

- **Body** (all optional): `companyName` max 120 `| null`; `url` max 2048 (syntax check only; another source with that URL gives `409` with `details.sourceId`; a new URL clears the content hash, failure count and last error and schedules a check now); `websiteUrl`, `logoUrl` max 2048 `| null` (http or https); `industry` max 80 `| null`; `hqLocation` max 120 `| null`; `checkIntervalMinutes` integer 15-10080 (used only when the global scan interval is off); `priority` integer -10 to 100; `adapterOverride` max 40 `| null` (an adapter id; also clears the content hash); `paused` boolean; `pausedReason` max 200.
- Pausing sets status `paused` (reason default "Paused by an administrator"). Resuming sets status `active`, resets the failure count and schedules a check now.
- **Response**: the source detail (as `GET`, without `adapters`). Audit: `source.update` or `source.adapter_override`, and `source.pause` or `source.resume`.

#### `DELETE /api/admin/sources/{id}`

- **Response**: `{ deleted: true }`; `404` if it does not exist. Hard delete: jobs, events, matches, queued alerts, tasks and scan logs go with it; tracker entries keep their snapshot (`source.delete`).

#### `POST /api/admin/sources/{id}/scan`

- **Body**: `force` boolean, default true (ignore the "nothing changed" shortcuts).
- **Response**: `{ queued, alreadyQueued }`. A source paused automatically is put back into rotation first (`source.scan`).

#### `POST /api/admin/sources/test`

- **Body**: `url` trimmed, 1-2048; `adapter?` max 40 `| null` (force an adapter; unknown ids give 400).
- **Response**: success `{ ok: true, url, adapter, adapterLabel, kind, detection, httpStatus, robotsAllowed, partial, requests, durationMs, jobCount, sample }` with up to 15 sample jobs `{ title, location, url, workplaceType, employmentType, identity }`; failure `{ ok: false, url, errorClass, label, hint, message, httpStatus, requests, durationMs }`.
- At most 40 HTTP requests and 3 pages; follows the AI-extraction and robots.txt settings. Nothing is stored.

#### `POST /api/admin/sources/bulk`

- **Body**: `ids` 1-500 UUIDs; `action` `scan`, `force_scan`, `pause`, `resume` or `delete`; `reason?` max 200 (for pause); `confirm?` boolean (must be `true` for delete).
- **Response**: `scan`/`force_scan` `{ queued, alreadyQueued }`; `pause`/`resume` `{ updated }`; `delete` `{ deleted }`.
- **Errors**: `403` for delete without `sources.delete`; `400 bad_request` for delete without `confirm: true`.

### 11.4 Jobs

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/jobs` | `jobs.read` | Search jobs (paginated) |
| GET | `/api/admin/jobs/{id}` | `jobs.read` | Job detail with events and counts |
| POST | `/api/admin/jobs/bulk` | `jobs.manage` | Hide or restore jobs |

#### `GET /api/admin/jobs`

- **Query**: `page`, `pageSize`; `q?` (title, company, URL); `status` `active` (default; open and visible), `closed`, `hidden`, `all`; `source?` UUID; `duplicates?` boolean (open, visible jobs that share source and `dedupe_key` with another open job, grouped together).
- **Response**: items `{ id, title, url, location, status, hiddenAt, hiddenReason, firstSeenAt, lastSeenAt, closedAt, fingerprint, dedupeKey, identity, sourceId, company, matches, trackers }`; `identity` is `ext`, `url` or `tl`.
- **Meta**: the standard fields plus `source` (`{ id, name }` when filtered by `source`, else `null`).

#### `GET /api/admin/jobs/{id}`

- **Response**: `{ job, source: { id, name, url, adapter }, events, counts: { matches, trackers, pendingAlerts, sentAlerts } }`. `job` is the full `jobs` row; `events` the last 50 `job_events` rows.

#### `POST /api/admin/jobs/bulk`

- **Body**: `ids` 1-500 UUIDs; `action` `hide` or `restore`; `reason?` max 300 (required, non-empty after cleaning, for `hide`).
- **Response**: `{ updated }`.
- Hiding stamps `hidden_at`, `hidden_reason`, `hidden_by`, writes a `hidden` event, settles pending email alerts for those jobs and recounts open jobs (`job.hide` for one, `job.bulk` for several). Restoring clears the stamp and writes a `restored` event (`job.restore`). A hidden job stays hidden even when later scans see it again.

### 11.5 Watchlists

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/lists` | `lists.read` | Search all watchlists (paginated) |
| POST | `/api/admin/lists/{id}` | `lists.manage` | Feature, unfeature, make private, trash, restore |
| DELETE | `/api/admin/lists/{id}` | `lists.delete` | Delete permanently (must be in the trash) |

#### `GET /api/admin/lists`

- **Query**: `page`, `pageSize`; `q?` (list name, owner email, slug); `state` `active` (default), `trash`, `featured`, `public`.
- **Response**: items `{ id, name, slug, visibility, featuredAt, deletedAt, createdAt, updatedAt, ownerId, ownerEmail, ownerName, companies, followers }`.

#### `POST /api/admin/lists/{id}`

- **Body**: `action` `feature`, `unfeature`, `make_private`, `trash` or `restore`.
- **Response**: `{ id, action }`.
- `feature` needs a public, live list (`409` otherwise). `make_private` also unfeatures. `trash` soft-deletes, unfeatures, deletes the list's matches and settles its pending alerts. `restore` undeletes and recomputes matches for every subscriber. Audit: `list.update`, `list.trash` or `list.restore`.

#### `DELETE /api/admin/lists/{id}`

- **Response**: `{ deleted: true }`. `409` unless the list is in the trash. Permanent; the list's company links, subscriptions, collaborators, suggestions and matches are deleted with it, while the shared company sources stay (`list.delete`).

### 11.6 Monitoring and tasks

| Method | Path | Auth | Purpose | Rate limit |
|---|---|---|---|---|
| GET | `/api/admin/monitoring` | `workers.read` | Queue, workers, upcoming scans, failures, throughput | - |
| POST | `/api/admin/monitoring` | `workers.manage` | Run a cycle, pause or resume monitoring, cancel queued tasks, recover leases | 20 per 5 min per user |
| GET | `/api/admin/tasks` | `workers.read` | Scan tasks (paginated) | - |
| POST | `/api/admin/tasks/{id}` | `workers.manage` | Retry or cancel one task | - |

#### `GET /api/admin/monitoring`

- **Response**: `{ monitoringEnabled, intervalMinutes, workerMode, queue, workers, upcoming, failures, throughput }`.
  - `intervalMinutes`: the global scan interval, or `null` when per-source intervals are used.
  - `queue`: `{ queued, running, dueNow, succeeded24h, failed24h, cancelled24h, oldestQueuedSeconds, avgWaitSeconds24h, avgDurationSeconds24h, p95DurationSeconds24h }`.
  - `workers`: `{ id, alive, mode, heartbeatAt, secondsSinceHeartbeat, startedAt, lastError, lastCycle }` per worker id that ever reported.
  - `upcoming`: the next 15 sources due. `failures`: failed scans in the last 24 hours by error class `{ errorClass, count, sources, label, hint }`. `throughput`: 24 hourly `{ hour, succeeded, failed }`.

#### `POST /api/admin/monitoring`

- **Body**: `action` one of:
  - `run_cycle`: runs a cycle inside the request (worker id `<WORKER_ID>-manual`, 40-second budget, at most 10 scans, `maxDuration` 60 s). Response `{ report }` (a `CycleReport`, see `/api/cron/tick`). Audit `task.run_cycle`.
  - `pause`, `resume`: writes the `scraper.enabled` setting. Response `{ monitoringEnabled }`. Audit `monitoring.pause`/`monitoring.resume`. While paused no scheduled scans are queued, but tasks already in the queue (and manual scans requested later) still run.
  - `cancel_queued`: cancels every queued task. Response `{ cancelled }`. Audit `task.cancel`.
  - `recover`: returns tasks with expired leases to the queue (or fails those out of attempts). Response `{ recovered: { requeued, failed } }`. Audit `task.recover`.

#### `GET /api/admin/tasks`

- **Query**: `page`, `pageSize`; `status` `all` (default), `queued`, `running`, `succeeded`, `failed`, `cancelled`; `source?` UUID.
- **Response**: items, most recent activity first: `{ id, status, trigger, priority, force, attempts, enqueuedAt, runAfter, startedAt, finishedAt, lockedBy, error, errorClass, result, sourceId, sourceUrl, companyName, company, requestedBy }` (`requestedBy` is an email).

#### `POST /api/admin/tasks/{id}`

- **Body**: `action` `retry` or `cancel`.
- **Response**: `cancel` gives `{ cancelled: true }` (`409` unless the task is queued; a running scan cannot be cancelled). `retry` gives `{ queued, alreadyQueued }` (`409` unless the task failed or was cancelled); it queues a new forced task for the source and resumes an automatically paused source. Audit `task.cancel`/`task.retry`.

### 11.7 Email

| Method | Path | Auth | Purpose | Rate limit |
|---|---|---|---|---|
| GET | `/api/admin/emails` | `emails.read` | Sending statistics, policy, cohorts | - |
| GET | `/api/admin/emails/logs` | `emails.read` | Delivery log (paginated) | - |
| GET | `/api/admin/emails/logs/{id}` | `emails.read` | Stored HTML of one email | - |
| GET | `/api/admin/emails/approvals` | `emails.read` | Recipient approvals (paginated) | - |
| POST | `/api/admin/emails/approvals` | `emails.manage` | Approve or revoke addresses | - |
| GET | `/api/admin/emails/queue` | `emails.read` | Dry run of the alert processor | - |
| POST | `/api/admin/emails/queue` | `emails.manage` | Process, flush or clear the alert queue | 10 per 5 min per user |
| POST | `/api/admin/emails/test` | `emails.send` | Send a test email | 10 per 10 min per user |
| POST | `/api/admin/emails/cohorts` | `emails.manage` | Re-spread recipients over staggering groups | - |
| POST | `/api/admin/emails/broadcast` | `emails.send` | Preview or send an announcement | 60 per hour per user (every call); service: 5 real sends per hour (distributed) |

#### `GET /api/admin/emails`

- **Response**: `{ provider, sender, webhookConfigured, today, policy, series, byTemplate, delivery, pending, cohorts }`.
  - `provider` is `brevo` or `console`. `today`: `{ sentToday, failedToday, totalToday, dailyLimit, digestLimit, remaining }` (the day starts at 00:00 UTC).
  - `policy`: the delivery policy (`lib/notifications/policy.ts`). `series`: 14 daily `{ day, sent, failed }`. `byTemplate` and `delivery`: 30-day breakdowns.
  - `pending`: `{ alerts, recipients, approvals }`. `cohorts`: `{ cycleDays, todayCohort, distribution: [{ group, users }] }`.

#### `GET /api/admin/emails/logs`

- **Query**: `page`, `pageSize`; `q?` (recipient or subject); `template?` one of `otp`, `digest`, `invite`, `reset`, `welcome`, `broadcast`, `test`, `reminder`, `general`; `status?` `sent`, `failed`, `skipped`.
- **Response**: items `{ id, recipientEmail, subject, templateType, status, deliveryStatus, attempts, errorMessage, createdAt, hasBody, provider }`.

#### `GET /api/admin/emails/logs/{id}`

- **Response**: `{ html }`. `404` when no body was stored or the template is `otp`, `reset` or `invite` (their bodies carry secrets and are never returned). Bodies are stored only while the `email.store_bodies` setting is on.

#### `GET /api/admin/emails/approvals`

- **Query**: `page`, `pageSize`; `q?` (email); `status` `pending` (default), `approved`, `unapproved`, `all`.
- **Response**: items `{ id, email, status, requestedAt, approvedAt, userId, name, lastActiveAt }`. **Meta** adds `counts` per status.

#### `POST /api/admin/emails/approvals`

- **Body**: `{ action: "approve" | "revoke", emails: [email, …] }` with 1-500 addresses, or `{ action: "approve_all_pending" }` (the first 500 pending).
- **Response**: `{ updated }`. Addresses approved for the first time that belong to an account get the welcome email. Audit `email.approve` or `email.revoke`.

#### `GET /api/admin/emails/queue`

- Runs the alert processor in dry-run mode; nothing is sent or changed. `maxDuration` 60 s.
- **Response**: `{ wouldSend, wouldDeliverItems, recipientsWithPending, deferred, deferredByReason, errors, pendingByUser }`. `deferred` is up to 100 `{ userId, email, reason }`; `pendingByUser` the 50 recipients with the oldest pending items `{ userId, email, items, oldest }`.

#### `POST /api/admin/emails/queue`

- **Body**: `action` `process` (a normal run), `flush` (send now, ignoring schedule, daily quota and staggering; account checks still apply) or `clear` (settle every pending alert without sending).
- **Response**: `process`/`flush` give `{ usersConsidered, emailsSent, itemsDelivered, itemsSettledWithoutSending, deferred, errors }`; `clear` gives `{ discarded }`. Audit `queue.flush` or `queue.clear` (`process` is not audited).

#### `POST /api/admin/emails/test`

- **Body**: `to` email, max 254; `note?` max 300 `| null`.
- **Response**: `{ sent: true, simulated: boolean }` (`simulated` is true with the console provider). `422 unprocessable` with the provider's error when sending fails. Audit `email.test`.

#### `POST /api/admin/emails/cohorts`

- **Body**: `cycleDays` integer 1-30.
- **Response**: `{ cycleDays, users, distribution }`. Reassigns `users.dispatch_group` round-robin (1 to `cycleDays`, in sign-up order) for every user with email alerts on, and stores `email.cohort_cycle_days`. Audit `email.cohort_change`.

#### `POST /api/admin/emails/broadcast`

- **Body**: `subject` trimmed, 1-140; `message` trimmed, 1-10,000 (plain text); `audience` `all` (default), `active30` (active in the last 30 days), `alerts_on` (has an alert-enabled subscription on a live list); `dryRun` boolean, default false.
- **Recipients**: verified, unsuspended accounts with email alerts on whose approval is not `unapproved`, filtered by audience.
- **Response**: dry run `{ recipients, wouldSend, remainingToday, preview: { subject, html } }`; send `{ recipients, sent, failed, skipped }`. One call sends at most `min(500, daily limit - safety buffer - sent today)`; the rest are reported as `skipped`. Each email carries the recipient's own unsubscribe link and one-click headers. `maxDuration` 300 s. Audit `email.broadcast` (real sends only).

### 11.8 Settings

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/settings` | `settings.read` | Every setting with its definition and value |
| PUT | `/api/admin/settings` | `settings.read` at the route; the setting's own permission in the service | Change one setting |

#### `GET /api/admin/settings`

- **Response**: `{ categories: [{ id, label, description }], settings: [...] }`. Each setting is its registry definition (`key, type, default, label, description, category, permission?, min?, max?, maxLength?, options?, unit?, managedElsewhere?`) plus `value`, `editable` (whether your role may change it), `updatedAt` and `updatedBy` (an email, or "deleted user").

#### `PUT /api/admin/settings`

- **Body**: `key` max 80, a key from `lib/settings/registry.ts` (unknown keys give 400); `value` of any JSON type, validated against the definition: booleans must be booleans; numbers (numeric strings accepted) must respect `min`/`max`; strings are trimmed and must respect `maxLength`; `json` settings must be an object of at most 8,000 characters when serialised.
- **Permission per key**: `settings.sensitive` for `auth.signup_enabled`, `auth.login_enabled`, `platform.maintenance_mode` and `notifications.enabled`; `workers.manage` for `scraper.enabled`; `settings.manage` for every other key. Otherwise `403`.
- **Response**: `{ key, previous, value }`. Audit `settings.update` (`banner.update` for `banner.config`). Allowed during maintenance mode.

### 11.9 Audit log

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/audit` | `audit.read` | Audit entries, newest first (paginated) |
| GET | `/api/admin/audit/export` | `data.export` | Up to 10,000 entries as CSV |

#### `GET /api/admin/audit`

- **Query**: `page`, `pageSize`; `action?` max 60 (exact action name); `actor?` (substring of the actor's email); `targetType?` max 30; `targetId?` max 80; `from?`, `to?` dates (any value JavaScript `Date` parses).
- **Response**: items `{ id, action, actorEmail, actorRole, targetType, targetId, metadata, ipAddress, createdAt, label }`. **Meta** adds `actions`: `[{ value, label }]` for every known action.

#### `GET /api/admin/audit/export`

- **Query**: the same filters, without paging.
- **Response**: CSV with columns `Time (UTC), Action, Description, Actor, Role, Target type, Target id, IP, Details`, filename `jobpingly-audit-YYYY-MM-DD.csv`. The export itself is audited (`data.export`).

### 11.10 Reported issues

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/issues` | `issues.read` | Reported issues (paginated) |
| PATCH | `/api/admin/issues/{id}` | `issues.manage` | Update status, priority, notes |
| DELETE | `/api/admin/issues/{id}` | `issues.manage` | Delete an issue |

#### `GET /api/admin/issues`

- **Query**: `page`, `pageSize`; `q?` (subject, reporter email, description); `status` `open` (default), `in_progress`, `resolved`, `closed`, `all`; `category?`.
- **Response**: items are full `reported_issues` rows. **Meta** adds `counts` per status.

#### `PATCH /api/admin/issues/{id}`

- **Body** (all optional): `status` `open`, `in_progress`, `resolved`, `closed`; `priority` `low`, `medium`, `high`, `critical`; `adminNotes` max 5000 `| null`.
- `resolved` and `closed` stamp `resolved_at` and `resolved_by`; any other status clears them.
- **Response**: the updated row; `404` if it does not exist. Audit `issue.update`.

#### `DELETE /api/admin/issues/{id}`

- **Response**: `{ deleted: true }`; `404` if it does not exist. Audit `issue.delete`.

---

## 12. Notes and caveats

Behaviour that is surprising or inconsistent in the current code. Each item describes what the code does.

1. *(Resolved after this review.)* Public lists are now readable by non-followers only while `public_lists.enabled` is on and the owner is not suspended; people who already follow a list keep access so they can manage or stop their alerts (`resolveAccess` in `lib/lists/access.ts`, `companyDetailForUser` in `lib/companies/service.ts`). Covered by an integration test.
2. *(Resolved after this review.)* Plan expiry is applied everywhere limits are computed: `getLimits` uses `effectivePlan(plan, planExpiresAt)` (`lib/plans.ts`), and the profile, companies-per-list and list-detail limits pass the end date. Covered by unit and integration tests.
3. **Unsubscribe tokens never expire, and the same token resubscribes.** `unsubscribeLinks` signs without an expiry (`lib/email/unsubscribe.ts:29`), and `POST /api/unsubscribe?action=resubscribe` accepts the same token (`app/api/unsubscribe/route.ts:20-23`). Anyone holding an old alert email can toggle that account's alert email. Rotating `APP_SECRET` invalidates every outstanding link.
4. **`limit_reached` uses HTTP 403**, the same status as `forbidden` (`lib/api/errors.ts:33`). Clients must branch on `error.code`.
5. **429 and auth failures are not uniform.** The proxy's 429 has no `details` (`proxy.ts:82-85`); the unsubscribe 429 has neither `details` nor `Retry-After` (`app/api/unsubscribe/route.ts:13`); the webhook's 401/404 and the cron 404 have empty bodies; `/api/health` is not enveloped.
6. **`meta.total` reads 0 past the last page** on endpoints that count with `count(*) OVER()`: the job feed, public list jobs, admin users, admin sources, admin jobs and admin lists (`lib/jobs/queries.ts:108,252`, `lib/admin/users.ts:78`, `lib/admin/sources.ts:90`, `lib/admin/jobs.ts:67`, `lib/admin/lists.ts:47`). Endpoints with a separate count query report the real total.
7. **`PUT /api/admin/settings` only requires `settings.read` at the route** (`app/api/admin/settings/route.ts:11`); the real check is per key in `updateSettingAsAdmin` (`lib/admin/operations.ts:169-171`). As a result a moderator (who has `workers.manage`) can change `scraper.enabled` and nothing else. The route's `allowInMaintenance` is redundant because only staff can pass `settings.read`, and staff are never gated.
8. **`send_reset_link` is the only account action without a rank check** (`lib/admin/users.ts`), on purpose: the link only reaches the account's own address. `verify`, `approve_email` and `revoke_email` now require a higher role than the account holder, like the other actions (resolved after this review; integration test included). The Email > Approvals endpoint approves addresses in bulk without a rank check.
9. **Two limits are memory-only** where the comparable ones are distributed: the Google sign-in IP limit (`app/api/auth/google/route.ts:16`) and the one-rescan-per-10-minutes-per-company limit (`lib/companies/service.ts:409`). With several instances they apply per instance.
10. **`POST /api/admin/emails/broadcast`** counts dry runs and real sends against the same 60-per-hour route limit, despite its name `admin:broadcast-preview` (`app/api/admin/emails/broadcast/route.ts:23`). Real sends have their own 5-per-hour limit on top.
11. **`POST /api/admin/sources` answers 201 for an existing URL.** `ensureSource` upserts on the canonical URL, so registering a known URL returns the existing source, writes a `source.create` audit entry and queues a scan (`lib/companies/service.ts:59-70`, `lib/admin/sources.ts:259-263`).
12. **The webhook body is not size-limited** (`app/api/webhooks/brevo/route.ts:41-49`); only the first 100 events are processed. The global per-IP write limit (120 per minute) still applies.
