/**
 * Allowed values for every status-like text column. Import these instead of
 * typing string literals so a typo is a compile error.
 */

export const SOURCE_STATUSES = ['active', 'degraded', 'broken', 'paused'] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const JOB_STATUSES = ['active', 'closed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const WORKPLACE_TYPES = ['remote', 'hybrid', 'onsite'] as const;
export type WorkplaceType = (typeof WORKPLACE_TYPES)[number];

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'temporary'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const SENIORITY_LEVELS = ['intern', 'junior', 'mid', 'senior', 'lead', 'executive'] as const;
export type Seniority = (typeof SENIORITY_LEVELS)[number];

export const JOB_EVENT_TYPES = ['discovered', 'updated', 'closed', 'reopened', 'hidden', 'restored'] as const;
export type JobEventType = (typeof JOB_EVENT_TYPES)[number];

/** A user's personal state for a job. 'dismissed' hides it from their feed. */
export const USER_JOB_STATUSES = [
  'saved',
  'applied',
  'interviewing',
  'offer',
  'rejected',
  'withdrawn',
  'dismissed',
] as const;
export type UserJobStatus = (typeof USER_JOB_STATUSES)[number];

/** Statuses that appear on the application tracker board, in column order. */
export const TRACKER_STATUSES = ['saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn'] as const;

export const TASK_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_TRIGGERS = ['schedule', 'manual', 'retry', 'onboarding'] as const;
export type TaskTrigger = (typeof TASK_TRIGGERS)[number];

export const SCAN_OUTCOMES = ['success', 'unchanged', 'suspicious', 'failed', 'skipped'] as const;
export type ScanOutcome = (typeof SCAN_OUTCOMES)[number];

export const LIST_VISIBILITIES = ['private', 'public'] as const;
export type ListVisibility = (typeof LIST_VISIBILITIES)[number];

export const NOTIFICATION_TYPES = [
  'job_match',
  'job_updated',
  'source_failed',
  'source_recovered',
  'list_invite',
  'contribution',
  'reminder',
  'system',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const ISSUE_CATEGORIES = ['broken_url', 'scraper_bug', 'ui_bug', 'feature_request', 'general'] as const;
export const ISSUE_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export const ISSUE_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

export const EMAIL_TEMPLATE_TYPES = [
  'otp',
  'digest',
  'invite',
  'reset',
  'welcome',
  'broadcast',
  'test',
  'reminder',
  'general',
] as const;
export type EmailTemplateType = (typeof EMAIL_TEMPLATE_TYPES)[number];

export const WORKPLACE_LABELS: Record<WorkplaceType, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
};

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
  temporary: 'Temporary',
};

export const SENIORITY_LABELS: Record<Seniority, string> = {
  intern: 'Intern',
  junior: 'Junior',
  mid: 'Mid-level',
  senior: 'Senior',
  lead: 'Lead / Staff',
  executive: 'Executive',
};

export const USER_JOB_STATUS_LABELS: Record<UserJobStatus, string> = {
  saved: 'Saved',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  dismissed: 'Dismissed',
};

export const SOURCE_STATUS_LABELS: Record<SourceStatus, string> = {
  active: 'Healthy',
  degraded: 'Degraded',
  broken: 'Failing',
  paused: 'Paused',
};
