import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  uuid,
  jsonb,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * JobPingly data model.
 *
 * The SQL files in /drizzle are the source of truth for the live database and
 * are applied by `npm run db:migrate`. This file must describe the same shape;
 * `npm run db:check` fails when the two drift apart.
 *
 * Conventions
 * - Every timestamp is `timestamptz`.
 * - Status-like columns are `text` with the allowed values documented beside
 *   them and enforced in the application layer (see lib/constants.ts). Text is
 *   used instead of Postgres enums so a new state never needs a blocking
 *   ALTER TYPE on a live table.
 * - Foreign keys always state their delete behaviour explicitly.
 */

const tz = (name: string) => timestamp(name, { withTimezone: true });

// ---------------------------------------------------------------------------
// Identity & sessions
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  googleId: text('google_id').unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  /** 'user' | 'support' | 'moderator' | 'admin' | 'owner' — see lib/auth/rbac.ts */
  role: text('role').default('user').notNull(),
  isBlocked: boolean('is_blocked').default(false).notNull(),
  blockedReason: text('blocked_reason'),
  blockedAt: tz('blocked_at'),
  /** Master switch for every non-transactional email. */
  emailNotificationsEnabled: boolean('email_notifications_enabled').default(true).notNull(),
  /** 'realtime' | 'every_6_hours' | 'every_12_hours' | 'daily' | 'twice_weekly' | 'weekly' | 'biweekly' | 'monthly' | 'custom_<n>_<unit>' */
  notificationPreference: text('notification_preference').default('daily').notNull(),
  digestHour: integer('digest_hour').default(8).notNull(),
  digestMinute: integer('digest_minute').default(0).notNull(),
  timezone: text('timezone').default('UTC').notNull(),
  /** Last time a digest email was actually dispatched; drives the schedule window. */
  lastDigestSentAt: tz('last_digest_sent_at'),
  frequencyEnforcementExempt: boolean('frequency_enforcement_exempt').default(false).notNull(),
  quotaExempt: boolean('quota_exempt').default(false).notNull(),
  dispatchGroup: integer('dispatch_group').default(1).notNull(),
  socials: jsonb('socials'),
  /** Per-type notification switches: { inApp, sourceFailures, jobChanges, closedJobs, productUpdates } */
  notificationSettings: jsonb('notification_settings').default(sql`'{}'::jsonb`).notNull(),
  /** 'free' | 'pro' | 'team' — see lib/plans.ts. Billing is not wired up; plans only drive limits. */
  plan: text('plan').default('free').notNull(),
  planExpiresAt: tz('plan_expires_at'),
  onboardingCompletedAt: tz('onboarding_completed_at'),
  lastLoginAt: tz('last_login_at'),
  lastActiveAt: tz('last_active_at'),
  passwordChangedAt: tz('password_changed_at'),
  createdAt: tz('created_at').defaultNow().notNull(),
}, (table) => ({
  createdIdx: index('idx_users_created').on(table.createdAt),
  roleIdx: index('idx_users_role').on(table.role),
  lastActiveIdx: index('idx_users_last_active').on(table.lastActiveAt),
}));

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  deviceHint: text('device_hint'),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
  expiresAt: tz('expires_at').notNull(),
  revokedAt: tz('revoked_at'),
  lastUsedAt: tz('last_used_at'),
  createdAt: tz('created_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('idx_refresh_tokens_user').on(table.userId),
  hashIdx: index('idx_refresh_tokens_hash').on(table.tokenHash),
  expiresIdx: index('idx_refresh_tokens_expires').on(table.expiresAt),
}));

export const oauthAccounts = pgTable('oauth_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  providerId: text('provider_id').notNull(),
  email: text('email').notNull(),
  createdAt: tz('created_at').defaultNow().notNull(),
}, (table) => ({
  providerUnique: uniqueIndex('unique_provider_provider_id').on(table.provider, table.providerId),
}));

/**
 * Sign-up verification. A row is created per registration attempt and holds
 * two secrets: a ticket kept by the browser that registered (token_hash) and
 * a 6-digit code sent by email (code_hash). Both are required, and the
 * password chosen at registration is only applied once they are, so someone
 * who registers another person's address cannot set that account's password.
 */
export const emailVerifications = pgTable('email_verifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  codeHash: text('code_hash'),
  pendingPasswordHash: text('pending_password_hash'),
  pendingName: text('pending_name'),
  expiresAt: tz('expires_at').notNull(),
  attempts: integer('attempts').default(0).notNull(),
  lastSentAt: tz('last_sent_at').defaultNow().notNull(),
  createdAt: tz('created_at').defaultNow().notNull(),
  usedAt: tz('used_at'),
}, (table) => ({
  userIdIdx: index('idx_email_verifications_user').on(table.userId),
}));

export const passwordResets = pgTable('password_resets', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: tz('expires_at').notNull(),
  usedAt: tz('used_at'),
  createdAt: tz('created_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: index('idx_password_resets_user').on(table.userId),
}));

// ---------------------------------------------------------------------------
// Watchlists
// ---------------------------------------------------------------------------

export const lists = pgTable('lists', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  /** 'private' | 'public' */
  visibility: text('visibility').default('private').notNull(),
  parentListId: uuid('parent_list_id').references((): AnyPgColumn => lists.id, { onDelete: 'set null' }),
  isCanonical: boolean('is_canonical').default(true).notNull(),
  followerCount: integer('follower_count').default(0).notNull(),
  contributionCount: integer('contribution_count').default(0).notNull(),
  tags: text('tags').array().default(sql`'{}'::text[]`).notNull(),
  pinned: boolean('pinned').default(false).notNull(),
  /** Set by staff to feature a public list at the top of the directory. */
  featuredAt: tz('featured_at'),
  deletedAt: tz('deleted_at'),
  createdAt: tz('created_at').defaultNow().notNull(),
  updatedAt: tz('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('idx_list_user').on(table.userId),
  visibilityIdx: index('idx_list_visibility').on(table.visibility),
  parentListIdx: index('idx_list_parent').on(table.parentListId),
  deletedAtIdx: index('idx_list_deleted_at').on(table.deletedAt),
  featuredIdx: index('idx_list_featured').on(table.featuredAt).where(sql`featured_at IS NOT NULL`),
}));

/**
 * A monitored career source. This table is the platform-wide company registry:
 * a URL is stored once and shared by every watchlist that tracks it, so the
 * monitoring engine scans each company exactly once regardless of how many
 * users follow it. Per-user preferences live on list_subscriptions.
 */
export const careerPages = pgTable('career_pages', {
  id: uuid('id').defaultRandom().primaryKey(),
  url: text('url').notNull().unique(),
  companyName: text('company_name'),
  websiteUrl: text('website_url'),
  logoUrl: text('logo_url'),
  industry: text('industry'),
  hqLocation: text('hq_location'),
  /** Adapter that produced the most recent successful scan (see lib/monitoring/adapters). */
  atsType: text('ats_type').default('unknown'),
  /** Admin-forced adapter id; null means auto-detect. */
  adapterOverride: text('adapter_override'),
  /** 'api' | 'html' | 'ai' | 'browser' | 'unsupported' */
  scrapeMethod: text('scrape_method').default('html'),
  /** 'active' | 'degraded' | 'broken' | 'paused' */
  status: text('status').default('active').notNull(),
  pausedReason: text('paused_reason'),
  priority: integer('priority').default(0).notNull(),
  lastScrapedAt: tz('last_scraped_at'),
  lastSuccessAt: tz('last_success_at'),
  lastFailureAt: tz('last_failure_at'),
  nextCheckAt: tz('next_check_at').defaultNow(),
  consecutiveFailures: integer('consecutive_failures').default(0).notNull(),
  checkIntervalMinutes: integer('check_interval_minutes').default(180).notNull(),
  lastContentHash: text('last_content_hash'),
  lastError: text('last_error'),
  /** Error taxonomy from lib/monitoring/errors.ts, e.g. 'timeout', 'http_4xx', 'blocked'. */
  lastErrorClass: text('last_error_class'),
  lastHttpStatus: integer('last_http_status'),
  lastDurationMs: integer('last_duration_ms'),
  lastJobsFound: integer('last_jobs_found'),
  /** Denormalised count of open, visible jobs; maintained by the pipeline. */
  activeJobCount: integer('active_job_count').default(0).notNull(),
  robotsAllowed: boolean('robots_allowed'),
  robotsCheckedAt: tz('robots_checked_at'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: tz('created_at').defaultNow().notNull(),
  updatedAt: tz('updated_at').defaultNow().notNull(),
}, (table) => ({
  dueIdx: index('idx_career_pages_due').on(table.status, table.nextCheckAt),
  companyIdx: index('idx_career_pages_company').on(table.companyName),
}));

export const listCareerPages = pgTable('list_career_pages', {
  id: uuid('id').defaultRandom().primaryKey(),
  listId: uuid('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
  careerPageId: uuid('career_page_id').notNull().references(() => careerPages.id, { onDelete: 'cascade' }),
  isPaused: boolean('is_paused').default(false).notNull(),
  category: text('category'),
  notes: text('notes'),
  addedBy: uuid('added_by').references(() => users.id, { onDelete: 'set null' }),
  addedAt: tz('added_at').defaultNow().notNull(),
}, (table) => ({
  uniqueListPages: uniqueIndex('unique_list_career_page').on(table.listId, table.careerPageId),
  listIdIdx: index('idx_list_pages_list').on(table.listId),
  pageIdx: index('idx_list_pages_page').on(table.careerPageId),
}));

/**
 * A user's alert settings for one watchlist. Owners get a row for their own
 * lists and followers get one when they follow a public list.
 */
export const listSubscriptions = pgTable('list_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  listId: uuid('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
  positiveKeywords: text('positive_keywords').array(),
  negativeKeywords: text('negative_keywords').array(),
  /** Advanced rule set (see lib/matching/rules.ts). Null means "keywords only". */
  matchRules: jsonb('match_rules'),
  alertsEnabled: boolean('alerts_enabled').default(true).notNull(),
  /** 'inherit' (account preference) or any supported frequency value. */
  digestFrequency: text('digest_frequency').default('inherit').notNull(),
  createdAt: tz('created_at').defaultNow().notNull(),
}, (table) => ({
  uniqueUserListSub: uniqueIndex('unique_user_list_sub').on(table.userId, table.listId),
  listSubIdx: index('idx_list_sub_list').on(table.listId),
  userSubIdx: index('idx_list_sub_user').on(table.userId),
}));

export const listContributions = pgTable('list_contributions', {
  id: uuid('id').defaultRandom().primaryKey(),
  listId: uuid('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
  contributorUserId: uuid('contributor_user_id').references(() => users.id, { onDelete: 'set null' }),
  url: text('url').notNull(),
  companyName: text('company_name'),
  atsType: text('ats_type').default('unknown'),
  /** 'pending' | 'approved' | 'rejected' */
  status: text('status').default('pending').notNull(),
  createdAt: tz('created_at').defaultNow().notNull(),
  reviewedAt: tz('reviewed_at'),
}, (table) => ({
  listContribIdx: index('idx_list_contrib_list').on(table.listId),
  statusIdx: index('idx_list_contrib_status').on(table.status),
}));

export const listCollaborators = pgTable('list_collaborators', {
  id: uuid('id').defaultRandom().primaryKey(),
  listId: uuid('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** 'editor' | 'moderator' */
  role: text('role').default('editor').notNull(),
  /** 'pending' | 'accepted' | 'declined' */
  status: text('status').default('pending').notNull(),
  inviteToken: uuid('invite_token').defaultRandom().notNull(),
  invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: tz('created_at').defaultNow().notNull(),
  updatedAt: tz('updated_at').defaultNow().notNull(),
}, (table) => ({
  uniqueUserListCollab: uniqueIndex('unique_user_list_collab').on(table.userId, table.listId),
  collabListIdx: index('idx_list_collab_list').on(table.listId),
  collabUserIdx: index('idx_list_collab_user').on(table.userId),
  collabStatusIdx: index('idx_list_collab_status').on(table.status),
  collabUserStatusIdx: index('idx_list_collab_user_status').on(table.userId, table.status),
  collabTokenIdx: index('idx_list_collab_token').on(table.inviteToken),
}));

/**
 * Legacy per-page subscription table. Superseded by list_subscriptions; kept
 * so existing rows are preserved. No code path reads it any more.
 */
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  careerPageId: uuid('career_page_id').notNull().references(() => careerPages.id, { onDelete: 'cascade' }),
  positiveKeywords: text('positive_keywords').array(),
  negativeKeywords: text('negative_keywords').array(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: tz('created_at').defaultNow().notNull(),
}, (table) => ({
  uniqueSub: uniqueIndex('unique_user_career_page_sub').on(table.userId, table.careerPageId),
  careerPageIdx: index('idx_subscriptions_career_page').on(table.careerPageId),
}));

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export const jobs = pgTable('jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  careerPageId: uuid('career_page_id').notNull().references(() => careerPages.id, { onDelete: 'cascade' }),
  /** Primary identity key: 'ext:…' | 'url:…' | 'tl:…' (see lib/monitoring/fingerprint.ts). */
  fingerprint: text('fingerprint').notNull(),
  externalId: text('external_id'),
  /** Secondary identity keys used to re-match a job when its primary key changes. */
  urlKey: text('url_key'),
  dedupeKey: text('dedupe_key'),
  title: text('title').notNull(),
  url: text('url'),
  location: text('location'),
  /** Employment type exactly as the source reported it. */
  jobType: text('job_type'),
  department: text('department'),
  /** Normalised facets, derived by lib/monitoring/classify.ts. */
  workplaceType: text('workplace_type'), // 'remote' | 'hybrid' | 'onsite'
  employmentType: text('employment_type'), // 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary'
  seniority: text('seniority'), // 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'executive'
  salaryText: text('salary_text'),
  salaryMin: integer('salary_min'),
  salaryMax: integer('salary_max'),
  salaryCurrency: text('salary_currency'),
  description: text('description'),
  /** Hash of the attributes users care about; a change produces an 'updated' event. */
  contentHash: text('content_hash'),
  postedAt: tz('posted_at'),
  deadlineAt: tz('deadline_at'),
  /** 'active' | 'closed' */
  status: text('status').default('active').notNull(),
  missedScrapes: integer('missed_scrapes').default(0).notNull(),
  firstSeenAt: tz('first_seen_at').defaultNow().notNull(),
  lastSeenAt: tz('last_seen_at').defaultNow().notNull(),
  closedAt: tz('closed_at'),
  reopenedAt: tz('reopened_at'),
  /** Set when an admin removes a spam or invalid posting. Hidden jobs are never shown or re-notified. */
  hiddenAt: tz('hidden_at'),
  hiddenReason: text('hidden_reason'),
  hiddenBy: uuid('hidden_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: tz('updated_at').defaultNow().notNull(),
  rawData: jsonb('raw_data'),
}, (table) => ({
  uniqueJobFingerprint: uniqueIndex('unique_career_page_fingerprint').on(table.careerPageId, table.fingerprint),
  statusIdx: index('idx_jobs_career_page_status').on(table.careerPageId, table.status),
  fingerprintIdx: index('idx_jobs_fingerprint').on(table.fingerprint),
  feedIdx: index('idx_jobs_feed').on(table.status, table.firstSeenAt),
  pageFeedIdx: index('idx_jobs_page_first_seen').on(table.careerPageId, table.firstSeenAt),
  dedupeIdx: index('idx_jobs_dedupe').on(table.careerPageId, table.dedupeKey),
  urlKeyIdx: index('idx_jobs_url_key').on(table.careerPageId, table.urlKey),
  closedIdx: index('idx_jobs_closed_at').on(table.closedAt),
}));

/** Append-only history of what happened to a job. */
export const jobEvents = pgTable('job_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  careerPageId: uuid('career_page_id').notNull().references(() => careerPages.id, { onDelete: 'cascade' }),
  /** 'discovered' | 'updated' | 'closed' | 'reopened' | 'hidden' | 'restored' */
  type: text('type').notNull(),
  /** For 'updated': { field: { from, to } }. */
  changes: jsonb('changes'),
  createdAt: tz('created_at').defaultNow().notNull(),
}, (table) => ({
  jobIdx: index('idx_job_events_job').on(table.jobId, table.createdAt),
  pageIdx: index('idx_job_events_page').on(table.careerPageId, table.createdAt),
  typeIdx: index('idx_job_events_type').on(table.type, table.createdAt),
}));

/** A job that satisfied one user's rules on one watchlist, with the reason recorded. */
export const jobMatches = pgTable('job_matches', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  listId: uuid('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
  matchedTerms: text('matched_terms').array().default(sql`'{}'::text[]`).notNull(),
  /** Human-readable explanation fragments, e.g. [{ field: 'title', term: 'react' }]. */
  reasons: jsonb('reasons'),
  createdAt: tz('created_at').defaultNow().notNull(),
}, (table) => ({
  uniqueMatch: uniqueIndex('unique_job_match').on(table.userId, table.jobId, table.listId),
  userIdx: index('idx_job_matches_user').on(table.userId, table.createdAt),
  jobIdx: index('idx_job_matches_job').on(table.jobId),
  listIdx: index('idx_job_matches_list').on(table.listId),
}));

/**
 * A user's personal relationship with a job: saved, dismissed, or tracked
 * through an application. The snapshot keeps the entry meaningful after the
 * job (or its company) is removed from the platform.
 */
export const userJobs = pgTable('user_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  /** 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected' | 'withdrawn' | 'dismissed' */
  status: text('status').default('saved').notNull(),
  notes: text('notes'),
  appliedAt: tz('applied_at'),
  reminderAt: tz('reminder_at'),
  reminderSentAt: tz('reminder_sent_at'),
  snapshot: jsonb('snapshot').notNull(),
  createdAt: tz('created_at').defaultNow().notNull(),
  updatedAt: tz('updated_at').defaultNow().notNull(),
}, (table) => ({
  uniqueUserJob: uniqueIndex('unique_user_job').on(table.userId, table.jobId),
  userStatusIdx: index('idx_user_jobs_user_status').on(table.userId, table.status),
  reminderIdx: index('idx_user_jobs_reminder').on(table.reminderAt),
}));

// ---------------------------------------------------------------------------
// Monitoring engine
// ---------------------------------------------------------------------------

/**
 * Postgres-backed work queue for scans. Workers claim rows with
 * FOR UPDATE SKIP LOCKED, so any number of workers (the in-process loop, a
 * cron-triggered tick, a manual run) can drain it concurrently without
 * scanning the same source twice. The partial unique index guarantees at most
 * one queued-or-running task per source.
 */
export const monitorTasks = pgTable('monitor_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  careerPageId: uuid('career_page_id').notNull().references(() => careerPages.id, { onDelete: 'cascade' }),
  /** 'schedule' | 'manual' | 'retry' | 'onboarding' */
  trigger: text('trigger').default('schedule').notNull(),
  priority: integer('priority').default(0).notNull(),
  /** 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' */
  status: text('status').default('queued').notNull(),
  force: boolean('force').default(false).notNull(),
  attempts: integer('attempts').default(0).notNull(),
  maxAttempts: integer('max_attempts').default(2).notNull(),
  runAfter: tz('run_after').defaultNow().notNull(),
  enqueuedAt: tz('enqueued_at').defaultNow().notNull(),
  startedAt: tz('started_at'),
  finishedAt: tz('finished_at'),
  lockedBy: text('locked_by'),
  leaseExpiresAt: tz('lease_expires_at'),
  error: text('error'),
  errorClass: text('error_class'),
  result: jsonb('result'),
  requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  claimIdx: index('idx_monitor_tasks_claim').on(table.status, table.runAfter, table.priority),
  pageIdx: index('idx_monitor_tasks_page').on(table.careerPageId, table.enqueuedAt),
  finishedIdx: index('idx_monitor_tasks_finished').on(table.finishedAt),
  oneActivePerPage: uniqueIndex('unique_active_task_per_page')
    .on(table.careerPageId)
    .where(sql`status IN ('queued', 'running')`),
}));

/** One row per scan attempt: the durable scan history for a source. */
export const scrapeLogs = pgTable('scrape_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  careerPageId: uuid('career_page_id').notNull().references(() => careerPages.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id'),
  scrapedAt: tz('scraped_at').defaultNow().notNull(),
  success: boolean('success').notNull(),
  suspicious: boolean('suspicious').default(false).notNull(),
  /** 'success' | 'unchanged' | 'suspicious' | 'failed' | 'skipped' */
  outcome: text('outcome'),
  /** 'schedule' | 'manual' | 'retry' | 'onboarding' */
  trigger: text('trigger'),
  adapter: text('adapter'),
  httpStatus: integer('http_status'),
  errorClass: text('error_class'),
  jobsFound: integer('jobs_found').default(0),
  jobsAdded: integer('jobs_added').default(0),
  jobsRemoved: integer('jobs_removed').default(0),
  jobsUpdated: integer('jobs_updated').default(0),
  jobsReopened: integer('jobs_reopened').default(0),
  durationMs: integer('duration_ms'),
  errorMessage: text('error_message'),
  workerId: text('worker_id'),
  scraperVersion: text('scraper_version').default('1.0.0'),
}, (table) => ({
  pageTimeIdx: index('idx_scrape_logs_page_time').on(table.careerPageId, table.scrapedAt),
  timeIdx: index('idx_scrape_logs_time').on(table.scrapedAt),
}));

export const workerHeartbeat = pgTable('worker_heartbeat', {
  id: text('id').primaryKey(),
  heartbeatAt: tz('heartbeat_at').defaultNow().notNull(),
  cycleStartedAt: tz('cycle_started_at').defaultNow().notNull(),
  lastError: text('last_error'),
  /** Last cycle summary: { claimed, succeeded, failed, emailsSent, durationMs, mode } */
  stats: jsonb('stats'),
  startedAt: tz('started_at'),
});

// ---------------------------------------------------------------------------
// Notifications & email
// ---------------------------------------------------------------------------

/** Pending email alerts. A row is settled by stamping sent_at. */
export const notificationQueue = pgTable('notification_queue', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  listId: uuid('list_id').references(() => lists.id, { onDelete: 'set null' }),
  /** 'new' | 'updated' | 'closed' */
  eventType: text('event_type').notNull(),
  keywordMatched: text('keyword_matched').array(),
  createdAt: tz('created_at').defaultNow().notNull(),
  sentAt: tz('sent_at'),
  digestDate: text('digest_date'),
  attempts: integer('attempts').default(0).notNull(),
  lastAttemptAt: tz('last_attempt_at'),
  lastError: text('last_error'),
}, (table) => ({
  uniqueNotification: uniqueIndex('unique_user_job_event').on(table.userId, table.jobId, table.eventType),
  pendingIdx: index('idx_notification_queue_pending').on(table.userId, table.sentAt),
  listIdx: index('idx_notification_queue_list').on(table.listId),
  unsentIdx: index('idx_notification_queue_unsent').on(table.createdAt).where(sql`sent_at IS NULL`),
}));

/** In-app notification centre. */
export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** 'job_match' | 'job_updated' | 'source_failed' | 'source_recovered' | 'list_invite' | 'contribution' | 'reminder' | 'system' */
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  link: text('link'),
  data: jsonb('data'),
  /** Prevents the same event creating the notification twice. */
  dedupeKey: text('dedupe_key'),
  readAt: tz('read_at'),
  createdAt: tz('created_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: index('idx_notifications_user').on(table.userId, table.createdAt),
  unreadIdx: index('idx_notifications_unread').on(table.userId).where(sql`read_at IS NULL`),
  dedupeIdx: uniqueIndex('unique_notification_dedupe').on(table.userId, table.dedupeKey),
}));

export const sentEmailLogs = pgTable('sent_email_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  recipientEmail: text('recipient_email').notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  senderEmail: text('sender_email'),
  subject: text('subject').notNull(),
  /** 'otp' | 'digest' | 'invite' | 'reset' | 'welcome' | 'broadcast' | 'test' | 'reminder' | 'general' */
  templateType: text('template_type').default('general').notNull(),
  /** Outcome of the API call: 'sent' | 'failed' | 'skipped' */
  status: text('status').default('sent').notNull(),
  /** Provider-reported state from the delivery webhook: 'delivered' | 'bounced' | 'blocked' | 'complained' | 'deferred' */
  deliveryStatus: text('delivery_status'),
  deliveryUpdatedAt: tz('delivery_updated_at'),
  providerMessageId: text('provider_message_id'),
  attempts: integer('attempts').default(1).notNull(),
  errorMessage: text('error_message'),
  htmlContent: text('html_content'),
  senderId: uuid('sender_id').references(() => users.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata'),
  createdAt: tz('created_at').defaultNow().notNull(),
}, (table) => ({
  recipientIdx: index('idx_sent_email_recipient').on(table.recipientEmail),
  templateIdx: index('idx_sent_email_template').on(table.templateType),
  createdIdx: index('idx_sent_email_created').on(table.createdAt),
  statusIdx: index('idx_sent_email_status').on(table.status, table.createdAt),
  messageIdx: index('idx_sent_email_message').on(table.providerMessageId),
}));

export const emailApprovals = pgTable('email_approvals', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  /** 'pending' | 'approved' | 'unapproved' */
  status: text('status').default('pending').notNull(),
  requestedAt: tz('requested_at').defaultNow().notNull(),
  approvedAt: tz('approved_at'),
  approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
});

// ---------------------------------------------------------------------------
// Platform administration
// ---------------------------------------------------------------------------

/** Key/value platform settings and feature flags (see lib/settings/registry.ts). */
export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description'),
  updatedAt: tz('updated_at').defaultNow().notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
});

/**
 * Append-only record of administrative actions. No API route updates or
 * deletes rows; the actor's email and role are snapshotted so the trail stays
 * readable after the account is removed.
 */
export const adminAuditLog = pgTable('admin_audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  adminId: uuid('admin_id').references(() => users.id, { onDelete: 'set null' }),
  actorEmail: text('actor_email'),
  actorRole: text('actor_role'),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  metadata: jsonb('metadata'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: tz('created_at').defaultNow().notNull(),
}, (table) => ({
  createdIdx: index('idx_audit_created').on(table.createdAt),
  actionIdx: index('idx_audit_action').on(table.action, table.createdAt),
  targetIdx: index('idx_audit_target').on(table.targetType, table.targetId),
  actorIdx: index('idx_audit_actor').on(table.adminId, table.createdAt),
}));

export const reportedIssues = pgTable('reported_issues', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  reporterEmail: text('reporter_email').notNull(),
  reporterName: text('reporter_name'),
  /** 'broken_url' | 'scraper_bug' | 'ui_bug' | 'feature_request' | 'general' */
  category: text('category').default('general').notNull(),
  subject: text('subject').notNull(),
  description: text('description').notNull(),
  targetUrl: text('target_url'),
  /** 'open' | 'in_progress' | 'resolved' | 'closed' */
  status: text('status').default('open').notNull(),
  /** 'low' | 'medium' | 'high' | 'critical' */
  priority: text('priority').default('medium').notNull(),
  adminNotes: text('admin_notes'),
  resolvedAt: tz('resolved_at'),
  resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: tz('created_at').defaultNow().notNull(),
}, (table) => ({
  statusIdx: index('idx_reported_issues_status').on(table.status),
  categoryIdx: index('idx_reported_issues_category').on(table.category),
}));

export type User = typeof users.$inferSelect;
export type List = typeof lists.$inferSelect;
export type CareerPage = typeof careerPages.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type JobEvent = typeof jobEvents.$inferSelect;
export type UserJob = typeof userJobs.$inferSelect;
export type MonitorTask = typeof monitorTasks.$inferSelect;
export type ScrapeLog = typeof scrapeLogs.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
