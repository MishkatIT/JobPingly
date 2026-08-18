import { pgTable, text, timestamp, boolean, integer, uuid, jsonb, index, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// 1. Users table
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  googleId: text('google_id').unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  role: text('role').default('user').notNull(), // 'user' | 'admin' | 'moderator'
  isBlocked: boolean('is_blocked').default(false).notNull(),
  blockedReason: text('blocked_reason'),
  blockedAt: timestamp('blocked_at', { withTimezone: true }),
  emailNotificationsEnabled: boolean('email_notifications_enabled').default(true).notNull(),
  notificationPreference: text('notification_preference').default('daily').notNull(), // 'instant' | 'daily' | 'weekly'
  frequencyEnforcementExempt: boolean('frequency_enforcement_exempt').default(false).notNull(),
  quotaExempt: boolean('quota_exempt').default(false).notNull(),
  dispatchGroup: integer('dispatch_group').default(1).notNull(),
  socials: jsonb('socials'), // { github?: string, linkedin?: string, twitter?: string, website?: string }
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 2. Refresh Tokens table
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  deviceHint: text('device_hint'),
  ipAddress: text('ip_address'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('idx_refresh_tokens_user').on(table.userId),
  hashIdx: index('idx_refresh_tokens_hash').on(table.tokenHash),
}));

// 3. OAuth Accounts table
export const oauthAccounts = pgTable('oauth_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  providerId: text('provider_id').notNull(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  providerUnique: uniqueIndex('unique_provider_provider_id').on(table.provider, table.providerId),
}));

// 4. Email Verifications
export const emailVerifications = pgTable('email_verifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').default(0).notNull(),
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
}, (table) => ({
  userIdIdx: index('idx_email_verifications_user').on(table.userId),
}));

// 5. Password Resets
export const passwordResets = pgTable('password_resets', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 6. Lists
export const lists = pgTable('lists', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  visibility: text('visibility').default('private').notNull(), // 'private' | 'public'
  parentListId: uuid('parent_list_id').references((): AnyPgColumn => lists.id, { onDelete: 'set null' }),
  isCanonical: boolean('is_canonical').default(true).notNull(),
  followerCount: integer('follower_count').default(0).notNull(),
  contributionCount: integer('contribution_count').default(0).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('idx_list_user').on(table.userId),
  visibilityIdx: index('idx_list_visibility').on(table.visibility),
  parentListIdx: index('idx_list_parent').on(table.parentListId),
  deletedAtIdx: index('idx_list_deleted_at').on(table.deletedAt),
}));

// 7. Career Pages
export const careerPages = pgTable('career_pages', {
  id: uuid('id').defaultRandom().primaryKey(),
  url: text('url').notNull().unique(),
  companyName: text('company_name'),
  atsType: text('ats_type').default('unknown'), // 'greenhouse' | 'lever' | 'ashby' | 'generic' | 'unknown'
  scrapeMethod: text('scrape_method').default('html'), // 'api' | 'html' | 'unsupported'
  status: text('status').default('active').notNull(), // 'active' | 'degraded' | 'broken' | 'paused'
  lastScrapedAt: timestamp('last_scraped_at', { withTimezone: true }),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  nextCheckAt: timestamp('next_check_at', { withTimezone: true }).defaultNow(),
  consecutiveFailures: integer('consecutive_failures').default(0).notNull(),
  checkIntervalMinutes: integer('check_interval_minutes').default(180).notNull(),
  lastContentHash: text('last_content_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 8. List Career Pages (Junction table)
export const listCareerPages = pgTable('list_career_pages', {
  id: uuid('id').defaultRandom().primaryKey(),
  listId: uuid('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
  careerPageId: uuid('career_page_id').notNull().references(() => careerPages.id, { onDelete: 'cascade' }),
  isPaused: boolean('is_paused').default(false).notNull(),
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueListPages: uniqueIndex('unique_list_career_page').on(table.listId, table.careerPageId),
  listIdIdx: index('idx_list_pages_list').on(table.listId),
}));

// 8a. List Subscriptions (Following Public Lists with Job Alert Keywords)
export const listSubscriptions = pgTable('list_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  listId: uuid('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
  positiveKeywords: text('positive_keywords').array(),
  negativeKeywords: text('negative_keywords').array(),
  digestFrequency: text('digest_frequency').default('instant').notNull(), // 'instant' | 'daily' | 'weekly'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueUserListSub: uniqueIndex('unique_user_list_sub').on(table.userId, table.listId),
  listSubIdx: index('idx_list_sub_list').on(table.listId),
  userSubIdx: index('idx_list_sub_user').on(table.userId),
}));

// 8b. List Contributions (Community Company Suggestions & Owner Approvals)
export const listContributions = pgTable('list_contributions', {
  id: uuid('id').defaultRandom().primaryKey(),
  listId: uuid('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
  contributorUserId: uuid('contributor_user_id').references(() => users.id, { onDelete: 'set null' }),
  url: text('url').notNull(),
  companyName: text('company_name'),
  atsType: text('ats_type').default('unknown'),
  status: text('status').default('pending').notNull(), // 'pending' | 'approved' | 'rejected'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
}, (table) => ({
  listContribIdx: index('idx_list_contrib_list').on(table.listId),
  statusIdx: index('idx_list_contrib_status').on(table.status),
}));

// 8c. List Collaborators (Multi-Maintainer Permissions)
export const listCollaborators = pgTable('list_collaborators', {
  id: uuid('id').defaultRandom().primaryKey(),
  listId: uuid('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').default('editor').notNull(), // 'editor' | 'moderator'
  status: text('status').default('pending').notNull(), // 'pending' | 'accepted' | 'declined'
  inviteToken: uuid('invite_token').defaultRandom().notNull(),
  invitedBy: uuid('invited_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueUserListCollab: uniqueIndex('unique_user_list_collab').on(table.userId, table.listId),
  collabListIdx: index('idx_list_collab_list').on(table.listId),
  collabUserIdx: index('idx_list_collab_user').on(table.userId),
  collabStatusIdx: index('idx_list_collab_status').on(table.status),
  collabUserStatusIdx: index('idx_list_collab_user_status').on(table.userId, table.status),
  collabTokenIdx: index('idx_list_collab_token').on(table.inviteToken),
}));

// 9. Subscriptions
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  careerPageId: uuid('career_page_id').notNull().references(() => careerPages.id, { onDelete: 'cascade' }),
  positiveKeywords: text('positive_keywords').array(),
  negativeKeywords: text('negative_keywords').array(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueSub: uniqueIndex('unique_user_career_page_sub').on(table.userId, table.careerPageId),
  careerPageIdx: index('idx_subscriptions_career_page').on(table.careerPageId),
}));

// 10. Jobs
export const jobs = pgTable('jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  careerPageId: uuid('career_page_id').notNull().references(() => careerPages.id, { onDelete: 'cascade' }),
  fingerprint: text('fingerprint').notNull(),
  externalId: text('external_id'),
  title: text('title').notNull(),
  url: text('url'),
  location: text('location'),
  jobType: text('job_type'),
  department: text('department'),
  status: text('status').default('active').notNull(), // 'active' | 'closed'
  missedScrapes: integer('missed_scrapes').default(0).notNull(),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  rawData: jsonb('raw_data'),
}, (table) => ({
  uniqueJobFingerprint: uniqueIndex('unique_career_page_fingerprint').on(table.careerPageId, table.fingerprint),
  statusIdx: index('idx_jobs_career_page_status').on(table.careerPageId, table.status),
  fingerprintIdx: index('idx_jobs_fingerprint').on(table.fingerprint),
}));

// 11. Scrape Logs
export const scrapeLogs = pgTable('scrape_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  careerPageId: uuid('career_page_id').notNull().references(() => careerPages.id, { onDelete: 'cascade' }),
  scrapedAt: timestamp('scraped_at', { withTimezone: true }).defaultNow().notNull(),
  success: boolean('success').notNull(),
  suspicious: boolean('suspicious').default(false).notNull(),
  jobsFound: integer('jobs_found').default(0),
  jobsAdded: integer('jobs_added').default(0),
  jobsRemoved: integer('jobs_removed').default(0),
  durationMs: integer('duration_ms'),
  errorMessage: text('error_message'),
  scraperVersion: text('scraper_version').default('1.0.0'),
}, (table) => ({
  pageTimeIdx: index('idx_scrape_logs_page_time').on(table.careerPageId, table.scrapedAt),
}));

// 12. Notification Queue
export const notificationQueue = pgTable('notification_queue', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(), // 'new' | 'closed'
  keywordMatched: text('keyword_matched').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  digestDate: text('digest_date'), // e.g. YYYY-MM-DD
}, (table) => ({
  uniqueNotification: uniqueIndex('unique_user_job_event').on(table.userId, table.jobId, table.eventType),
  pendingIdx: index('idx_notification_queue_pending').on(table.userId, table.sentAt),
}));

// 13. Feature Flags
export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid('updated_by').references(() => users.id),
});

// 14. Admin Audit Log
export const adminAuditLog = pgTable('admin_audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  adminId: uuid('admin_id').references(() => users.id),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 15. Email Approvals Table
export const emailApprovals = pgTable('email_approvals', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  status: text('status').default('pending').notNull(), // 'pending' | 'approved' | 'unapproved'
  requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  approvedBy: uuid('approved_by').references(() => users.id),
});

// 16. Reported Issues & Feedback Table
export const reportedIssues = pgTable('reported_issues', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  reporterEmail: text('reporter_email').notNull(),
  reporterName: text('reporter_name'),
  category: text('category').default('general').notNull(), // 'broken_url' | 'scraper_bug' | 'ui_bug' | 'feature_request' | 'general'
  subject: text('subject').notNull(),
  description: text('description').notNull(),
  targetUrl: text('target_url'),
  status: text('status').default('open').notNull(), // 'open' | 'in_progress' | 'resolved' | 'closed'
  priority: text('priority').default('medium').notNull(), // 'low' | 'medium' | 'high' | 'critical'
  adminNotes: text('admin_notes'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  statusIdx: index('idx_reported_issues_status').on(table.status),
  categoryIdx: index('idx_reported_issues_category').on(table.category),
}));

// 17. Sent Email Logs Table (Audit History of all outbound Brevo emails)
export const sentEmailLogs = pgTable('sent_email_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  recipientEmail: text('recipient_email').notNull(),
  senderEmail: text('sender_email'),
  subject: text('subject').notNull(),
  templateType: text('template_type').default('general').notNull(), // 'otp' | 'digest' | 'invite' | 'reset' | 'broadcast' | 'test'
  status: text('status').default('sent').notNull(), // 'sent' | 'failed'
  errorMessage: text('error_message'),
  htmlContent: text('html_content'),
  senderId: uuid('sender_id').references(() => users.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  recipientIdx: index('idx_sent_email_recipient').on(table.recipientEmail),
  templateIdx: index('idx_sent_email_template').on(table.templateType),
  createdIdx: index('idx_sent_email_created').on(table.createdAt),
}));


