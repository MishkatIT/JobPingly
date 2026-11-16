-- 0003_schema_v2.sql
--
-- Brings ANY JobPingly database up to the v2 schema, whatever state it is in.
--
-- Until now the production database was managed with `drizzle-kit push`, so
-- the numbered migration files (0000-0002) no longer describe what is actually
-- deployed. Rather than guess, this migration is written to be idempotent:
-- every statement is "create if missing". It never drops a table or a column
-- and never rewrites existing rows.
--
-- It is safe to run repeatedly and safe to run on an empty database.
--
-- Generated from lib/db/schema.ts. Do not edit by hand; add a new numbered
-- migration instead.

-- Ensures table.column has exactly one foreign key with the wanted delete rule.
-- Several legacy foreign keys had no delete rule, which made it impossible to
-- delete a user who had ever approved an email, resolved an issue or written
-- an audit entry.
CREATE OR REPLACE FUNCTION pg_temp.jp_ensure_fk(
  p_table text, p_column text, p_ref_table text, p_ref_column text, p_on_delete text, p_name text
) RETURNS void AS $fn$
DECLARE
  existing record;
  want "char";
  satisfied boolean := false;
BEGIN
  want := CASE upper(p_on_delete)
    WHEN 'CASCADE' THEN 'c' WHEN 'SET NULL' THEN 'n' WHEN 'RESTRICT' THEN 'r' WHEN 'SET DEFAULT' THEN 'd' ELSE 'a'
  END;

  FOR existing IN
    SELECT c.conname, c.confdeltype
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND t.relname = p_table
      AND array_length(c.conkey, 1) = 1
      AND a.attname = p_column
  LOOP
    IF existing.confdeltype = want AND NOT satisfied THEN
      satisfied := true;
    ELSE
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', p_table, existing.conname);
    END IF;
  END LOOP;

  IF NOT satisfied THEN
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(%I) ON DELETE %s',
      p_table, p_name, p_column, p_ref_table, p_ref_column, p_on_delete
    );
  END IF;
END
$fn$ LANGUAGE plpgsql;

-- 1. Tables that do not exist yet
CREATE TABLE IF NOT EXISTS "admin_audit_log" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid,
	"actor_email" text,
	"actor_role" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "career_pages" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"company_name" text,
	"website_url" text,
	"logo_url" text,
	"industry" text,
	"hq_location" text,
	"ats_type" text DEFAULT 'unknown',
	"adapter_override" text,
	"scrape_method" text DEFAULT 'html',
	"status" text DEFAULT 'active' NOT NULL,
	"paused_reason" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"last_scraped_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"next_check_at" timestamp with time zone DEFAULT now(),
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"check_interval_minutes" integer DEFAULT 180 NOT NULL,
	"last_content_hash" text,
	"last_error" text,
	"last_error_class" text,
	"last_http_status" integer,
	"last_duration_ms" integer,
	"last_jobs_found" integer,
	"active_job_count" integer DEFAULT 0 NOT NULL,
	"robots_allowed" boolean,
	"robots_checked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "career_pages_url_unique" UNIQUE("url")
);
CREATE TABLE IF NOT EXISTS "email_approvals" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"user_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	CONSTRAINT "email_approvals_email_unique" UNIQUE("email")
);
CREATE TABLE IF NOT EXISTS "email_verifications" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "email_verifications_token_hash_unique" UNIQUE("token_hash")
);
CREATE TABLE IF NOT EXISTS "feature_flags" (

	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
CREATE TABLE IF NOT EXISTS "job_events" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"career_page_id" uuid NOT NULL,
	"type" text NOT NULL,
	"changes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "job_matches" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"matched_terms" text[] DEFAULT '{}'::text[] NOT NULL,
	"reasons" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "jobs" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"career_page_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"external_id" text,
	"url_key" text,
	"dedupe_key" text,
	"title" text NOT NULL,
	"url" text,
	"location" text,
	"job_type" text,
	"department" text,
	"workplace_type" text,
	"employment_type" text,
	"seniority" text,
	"salary_text" text,
	"salary_min" integer,
	"salary_max" integer,
	"salary_currency" text,
	"description" text,
	"content_hash" text,
	"posted_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"missed_scrapes" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"reopened_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"hidden_reason" text,
	"hidden_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_data" jsonb
);
CREATE TABLE IF NOT EXISTS "list_career_pages" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"career_page_id" uuid NOT NULL,
	"is_paused" boolean DEFAULT false NOT NULL,
	"category" text,
	"notes" text,
	"added_by" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "list_collaborators" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invite_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "list_contributions" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"contributor_user_id" uuid,
	"url" text NOT NULL,
	"company_name" text,
	"ats_type" text DEFAULT 'unknown',
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
CREATE TABLE IF NOT EXISTS "list_subscriptions" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"positive_keywords" text[],
	"negative_keywords" text[],
	"match_rules" jsonb,
	"alerts_enabled" boolean DEFAULT true NOT NULL,
	"digest_frequency" text DEFAULT 'inherit' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "lists" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"parent_list_id" uuid,
	"is_canonical" boolean DEFAULT true NOT NULL,
	"follower_count" integer DEFAULT 0 NOT NULL,
	"contribution_count" integer DEFAULT 0 NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lists_slug_unique" UNIQUE("slug")
);
CREATE TABLE IF NOT EXISTS "monitor_tasks" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"career_page_id" uuid NOT NULL,
	"trigger" text DEFAULT 'schedule' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"force" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 2 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"enqueued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"locked_by" text,
	"lease_expires_at" timestamp with time zone,
	"error" text,
	"error_class" text,
	"result" jsonb,
	"requested_by" uuid
);
CREATE TABLE IF NOT EXISTS "notification_queue" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"list_id" uuid,
	"event_type" text NOT NULL,
	"keyword_matched" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"digest_date" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_error" text
);
CREATE TABLE IF NOT EXISTS "notifications" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"data" jsonb,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "oauth_accounts" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_id" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "password_resets" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_token_hash_unique" UNIQUE("token_hash")
);
CREATE TABLE IF NOT EXISTS "refresh_tokens" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"device_hint" text,
	"user_agent" text,
	"ip_address" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
CREATE TABLE IF NOT EXISTS "reported_issues" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"reporter_email" text NOT NULL,
	"reporter_name" text,
	"category" text DEFAULT 'general' NOT NULL,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"target_url" text,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"admin_notes" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "scrape_logs" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"career_page_id" uuid NOT NULL,
	"task_id" uuid,
	"scraped_at" timestamp with time zone DEFAULT now() NOT NULL,
	"success" boolean NOT NULL,
	"suspicious" boolean DEFAULT false NOT NULL,
	"outcome" text,
	"trigger" text,
	"adapter" text,
	"http_status" integer,
	"error_class" text,
	"jobs_found" integer DEFAULT 0,
	"jobs_added" integer DEFAULT 0,
	"jobs_removed" integer DEFAULT 0,
	"jobs_updated" integer DEFAULT 0,
	"jobs_reopened" integer DEFAULT 0,
	"duration_ms" integer,
	"error_message" text,
	"worker_id" text,
	"scraper_version" text DEFAULT '1.0.0'
);
CREATE TABLE IF NOT EXISTS "sent_email_logs" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_email" text NOT NULL,
	"user_id" uuid,
	"sender_email" text,
	"subject" text NOT NULL,
	"template_type" text DEFAULT 'general' NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"delivery_status" text,
	"delivery_updated_at" timestamp with time zone,
	"provider_message_id" text,
	"attempts" integer DEFAULT 1 NOT NULL,
	"error_message" text,
	"html_content" text,
	"sender_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "subscriptions" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"career_page_id" uuid NOT NULL,
	"positive_keywords" text[],
	"negative_keywords" text[],
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "user_jobs" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid,
	"status" text DEFAULT 'saved' NOT NULL,
	"notes" text,
	"applied_at" timestamp with time zone,
	"reminder_at" timestamp with time zone,
	"reminder_sent_at" timestamp with time zone,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "users" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"name" text,
	"avatar_url" text,
	"google_id" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"blocked_reason" text,
	"blocked_at" timestamp with time zone,
	"email_notifications_enabled" boolean DEFAULT true NOT NULL,
	"notification_preference" text DEFAULT 'daily' NOT NULL,
	"digest_hour" integer DEFAULT 8 NOT NULL,
	"digest_minute" integer DEFAULT 0 NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"last_digest_sent_at" timestamp with time zone,
	"frequency_enforcement_exempt" boolean DEFAULT false NOT NULL,
	"quota_exempt" boolean DEFAULT false NOT NULL,
	"dispatch_group" integer DEFAULT 1 NOT NULL,
	"socials" jsonb,
	"notification_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"plan_expires_at" timestamp with time zone,
	"onboarding_completed_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"last_active_at" timestamp with time zone,
	"password_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
CREATE TABLE IF NOT EXISTS "worker_heartbeat" (

	"id" text PRIMARY KEY NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cycle_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"stats" jsonb,
	"started_at" timestamp with time zone
);

-- 2. Columns added since the table was first created
ALTER TABLE "admin_audit_log" ADD COLUMN IF NOT EXISTS "admin_id" uuid;
ALTER TABLE "admin_audit_log" ADD COLUMN IF NOT EXISTS "actor_email" text;
ALTER TABLE "admin_audit_log" ADD COLUMN IF NOT EXISTS "actor_role" text;
ALTER TABLE "admin_audit_log" ADD COLUMN IF NOT EXISTS "action" text NOT NULL;
ALTER TABLE "admin_audit_log" ADD COLUMN IF NOT EXISTS "target_type" text;
ALTER TABLE "admin_audit_log" ADD COLUMN IF NOT EXISTS "target_id" text;
ALTER TABLE "admin_audit_log" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
ALTER TABLE "admin_audit_log" ADD COLUMN IF NOT EXISTS "ip_address" text;
ALTER TABLE "admin_audit_log" ADD COLUMN IF NOT EXISTS "user_agent" text;
ALTER TABLE "admin_audit_log" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "url" text NOT NULL;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "company_name" text;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "website_url" text;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "logo_url" text;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "industry" text;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "hq_location" text;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "ats_type" text DEFAULT 'unknown';
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "adapter_override" text;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "scrape_method" text DEFAULT 'html';
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "paused_reason" text;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "priority" integer DEFAULT 0 NOT NULL;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "last_scraped_at" timestamp with time zone;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "last_success_at" timestamp with time zone;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "last_failure_at" timestamp with time zone;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "next_check_at" timestamp with time zone DEFAULT now();
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "consecutive_failures" integer DEFAULT 0 NOT NULL;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "check_interval_minutes" integer DEFAULT 180 NOT NULL;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "last_content_hash" text;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "last_error" text;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "last_error_class" text;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "last_http_status" integer;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "last_duration_ms" integer;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "last_jobs_found" integer;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "active_job_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "robots_allowed" boolean;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "robots_checked_at" timestamp with time zone;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "created_by" uuid;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "career_pages" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "email_approvals" ADD COLUMN IF NOT EXISTS "email" text NOT NULL;
ALTER TABLE "email_approvals" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "email_approvals" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'pending' NOT NULL;
ALTER TABLE "email_approvals" ADD COLUMN IF NOT EXISTS "requested_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "email_approvals" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;
ALTER TABLE "email_approvals" ADD COLUMN IF NOT EXISTS "approved_by" uuid;
ALTER TABLE "email_verifications" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE "email_verifications" ADD COLUMN IF NOT EXISTS "token_hash" text NOT NULL;
ALTER TABLE "email_verifications" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone NOT NULL;
ALTER TABLE "email_verifications" ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 0 NOT NULL;
ALTER TABLE "email_verifications" ADD COLUMN IF NOT EXISTS "last_sent_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "email_verifications" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "email_verifications" ADD COLUMN IF NOT EXISTS "used_at" timestamp with time zone;
ALTER TABLE "feature_flags" ADD COLUMN IF NOT EXISTS "value" jsonb NOT NULL;
ALTER TABLE "feature_flags" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "feature_flags" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "feature_flags" ADD COLUMN IF NOT EXISTS "updated_by" uuid;
ALTER TABLE "job_events" ADD COLUMN IF NOT EXISTS "job_id" uuid NOT NULL;
ALTER TABLE "job_events" ADD COLUMN IF NOT EXISTS "career_page_id" uuid NOT NULL;
ALTER TABLE "job_events" ADD COLUMN IF NOT EXISTS "type" text NOT NULL;
ALTER TABLE "job_events" ADD COLUMN IF NOT EXISTS "changes" jsonb;
ALTER TABLE "job_events" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "job_matches" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE "job_matches" ADD COLUMN IF NOT EXISTS "job_id" uuid NOT NULL;
ALTER TABLE "job_matches" ADD COLUMN IF NOT EXISTS "list_id" uuid NOT NULL;
ALTER TABLE "job_matches" ADD COLUMN IF NOT EXISTS "matched_terms" text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE "job_matches" ADD COLUMN IF NOT EXISTS "reasons" jsonb;
ALTER TABLE "job_matches" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "career_page_id" uuid NOT NULL;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "fingerprint" text NOT NULL;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "url_key" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "dedupe_key" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "title" text NOT NULL;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "url" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "location" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "job_type" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "department" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "workplace_type" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "employment_type" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "seniority" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "salary_text" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "salary_min" integer;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "salary_max" integer;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "salary_currency" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "content_hash" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "posted_at" timestamp with time zone;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "deadline_at" timestamp with time zone;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "missed_scrapes" integer DEFAULT 0 NOT NULL;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "reopened_at" timestamp with time zone;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "hidden_at" timestamp with time zone;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "hidden_reason" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "hidden_by" uuid;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "raw_data" jsonb;
ALTER TABLE "list_career_pages" ADD COLUMN IF NOT EXISTS "list_id" uuid NOT NULL;
ALTER TABLE "list_career_pages" ADD COLUMN IF NOT EXISTS "career_page_id" uuid NOT NULL;
ALTER TABLE "list_career_pages" ADD COLUMN IF NOT EXISTS "is_paused" boolean DEFAULT false NOT NULL;
ALTER TABLE "list_career_pages" ADD COLUMN IF NOT EXISTS "category" text;
ALTER TABLE "list_career_pages" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "list_career_pages" ADD COLUMN IF NOT EXISTS "added_by" uuid;
ALTER TABLE "list_career_pages" ADD COLUMN IF NOT EXISTS "added_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "list_id" uuid NOT NULL;
ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'editor' NOT NULL;
ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'pending' NOT NULL;
ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "invite_token" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "invited_by" uuid;
ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "list_contributions" ADD COLUMN IF NOT EXISTS "list_id" uuid NOT NULL;
ALTER TABLE "list_contributions" ADD COLUMN IF NOT EXISTS "contributor_user_id" uuid;
ALTER TABLE "list_contributions" ADD COLUMN IF NOT EXISTS "url" text NOT NULL;
ALTER TABLE "list_contributions" ADD COLUMN IF NOT EXISTS "company_name" text;
ALTER TABLE "list_contributions" ADD COLUMN IF NOT EXISTS "ats_type" text DEFAULT 'unknown';
ALTER TABLE "list_contributions" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'pending' NOT NULL;
ALTER TABLE "list_contributions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "list_contributions" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;
ALTER TABLE "list_subscriptions" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE "list_subscriptions" ADD COLUMN IF NOT EXISTS "list_id" uuid NOT NULL;
ALTER TABLE "list_subscriptions" ADD COLUMN IF NOT EXISTS "positive_keywords" text[];
ALTER TABLE "list_subscriptions" ADD COLUMN IF NOT EXISTS "negative_keywords" text[];
ALTER TABLE "list_subscriptions" ADD COLUMN IF NOT EXISTS "match_rules" jsonb;
ALTER TABLE "list_subscriptions" ADD COLUMN IF NOT EXISTS "alerts_enabled" boolean DEFAULT true NOT NULL;
ALTER TABLE "list_subscriptions" ADD COLUMN IF NOT EXISTS "digest_frequency" text DEFAULT 'inherit' NOT NULL;
ALTER TABLE "list_subscriptions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "name" text NOT NULL;
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "slug" text NOT NULL;
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "visibility" text DEFAULT 'private' NOT NULL;
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "parent_list_id" uuid;
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "is_canonical" boolean DEFAULT true NOT NULL;
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "follower_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "contribution_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "tags" text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "pinned" boolean DEFAULT false NOT NULL;
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "monitor_tasks" ADD COLUMN IF NOT EXISTS "career_page_id" uuid NOT NULL;
ALTER TABLE "monitor_tasks" ADD COLUMN IF NOT EXISTS "trigger" text DEFAULT 'schedule' NOT NULL;
ALTER TABLE "monitor_tasks" ADD COLUMN IF NOT EXISTS "priority" integer DEFAULT 0 NOT NULL;
ALTER TABLE "monitor_tasks" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'queued' NOT NULL;
ALTER TABLE "monitor_tasks" ADD COLUMN IF NOT EXISTS "force" boolean DEFAULT false NOT NULL;
ALTER TABLE "monitor_tasks" ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 0 NOT NULL;
ALTER TABLE "monitor_tasks" ADD COLUMN IF NOT EXISTS "max_attempts" integer DEFAULT 2 NOT NULL;
ALTER TABLE "monitor_tasks" ADD COLUMN IF NOT EXISTS "run_after" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "monitor_tasks" ADD COLUMN IF NOT EXISTS "enqueued_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "monitor_tasks" ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone;
ALTER TABLE "monitor_tasks" ADD COLUMN IF NOT EXISTS "finished_at" timestamp with time zone;
ALTER TABLE "monitor_tasks" ADD COLUMN IF NOT EXISTS "locked_by" text;
ALTER TABLE "monitor_tasks" ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp with time zone;
ALTER TABLE "monitor_tasks" ADD COLUMN IF NOT EXISTS "error" text;
ALTER TABLE "monitor_tasks" ADD COLUMN IF NOT EXISTS "error_class" text;
ALTER TABLE "monitor_tasks" ADD COLUMN IF NOT EXISTS "result" jsonb;
ALTER TABLE "monitor_tasks" ADD COLUMN IF NOT EXISTS "requested_by" uuid;
ALTER TABLE "notification_queue" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE "notification_queue" ADD COLUMN IF NOT EXISTS "job_id" uuid NOT NULL;
ALTER TABLE "notification_queue" ADD COLUMN IF NOT EXISTS "list_id" uuid;
ALTER TABLE "notification_queue" ADD COLUMN IF NOT EXISTS "event_type" text NOT NULL;
ALTER TABLE "notification_queue" ADD COLUMN IF NOT EXISTS "keyword_matched" text[];
ALTER TABLE "notification_queue" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "notification_queue" ADD COLUMN IF NOT EXISTS "sent_at" timestamp with time zone;
ALTER TABLE "notification_queue" ADD COLUMN IF NOT EXISTS "digest_date" text;
ALTER TABLE "notification_queue" ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 0 NOT NULL;
ALTER TABLE "notification_queue" ADD COLUMN IF NOT EXISTS "last_attempt_at" timestamp with time zone;
ALTER TABLE "notification_queue" ADD COLUMN IF NOT EXISTS "last_error" text;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "type" text NOT NULL;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "title" text NOT NULL;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "body" text;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "link" text;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "data" jsonb;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "dedupe_key" text;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "read_at" timestamp with time zone;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "oauth_accounts" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE "oauth_accounts" ADD COLUMN IF NOT EXISTS "provider" text NOT NULL;
ALTER TABLE "oauth_accounts" ADD COLUMN IF NOT EXISTS "provider_id" text NOT NULL;
ALTER TABLE "oauth_accounts" ADD COLUMN IF NOT EXISTS "email" text NOT NULL;
ALTER TABLE "oauth_accounts" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "password_resets" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE "password_resets" ADD COLUMN IF NOT EXISTS "token_hash" text NOT NULL;
ALTER TABLE "password_resets" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone NOT NULL;
ALTER TABLE "password_resets" ADD COLUMN IF NOT EXISTS "used_at" timestamp with time zone;
ALTER TABLE "password_resets" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "token_hash" text NOT NULL;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "device_hint" text;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "user_agent" text;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "ip_address" text;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone NOT NULL;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp with time zone;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "reported_issues" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "reported_issues" ADD COLUMN IF NOT EXISTS "reporter_email" text NOT NULL;
ALTER TABLE "reported_issues" ADD COLUMN IF NOT EXISTS "reporter_name" text;
ALTER TABLE "reported_issues" ADD COLUMN IF NOT EXISTS "category" text DEFAULT 'general' NOT NULL;
ALTER TABLE "reported_issues" ADD COLUMN IF NOT EXISTS "subject" text NOT NULL;
ALTER TABLE "reported_issues" ADD COLUMN IF NOT EXISTS "description" text NOT NULL;
ALTER TABLE "reported_issues" ADD COLUMN IF NOT EXISTS "target_url" text;
ALTER TABLE "reported_issues" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'open' NOT NULL;
ALTER TABLE "reported_issues" ADD COLUMN IF NOT EXISTS "priority" text DEFAULT 'medium' NOT NULL;
ALTER TABLE "reported_issues" ADD COLUMN IF NOT EXISTS "admin_notes" text;
ALTER TABLE "reported_issues" ADD COLUMN IF NOT EXISTS "resolved_at" timestamp with time zone;
ALTER TABLE "reported_issues" ADD COLUMN IF NOT EXISTS "resolved_by" uuid;
ALTER TABLE "reported_issues" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "scrape_logs" ADD COLUMN IF NOT EXISTS "career_page_id" uuid NOT NULL;
ALTER TABLE "scrape_logs" ADD COLUMN IF NOT EXISTS "task_id" uuid;
ALTER TABLE "scrape_logs" ADD COLUMN IF NOT EXISTS "scraped_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "scrape_logs" ADD COLUMN IF NOT EXISTS "success" boolean NOT NULL;
ALTER TABLE "scrape_logs" ADD COLUMN IF NOT EXISTS "suspicious" boolean DEFAULT false NOT NULL;
ALTER TABLE "scrape_logs" ADD COLUMN IF NOT EXISTS "outcome" text;
ALTER TABLE "scrape_logs" ADD COLUMN IF NOT EXISTS "trigger" text;
ALTER TABLE "scrape_logs" ADD COLUMN IF NOT EXISTS "adapter" text;
ALTER TABLE "scrape_logs" ADD COLUMN IF NOT EXISTS "http_status" integer;
ALTER TABLE "scrape_logs" ADD COLUMN IF NOT EXISTS "error_class" text;
ALTER TABLE "scrape_logs" ADD COLUMN IF NOT EXISTS "jobs_found" integer DEFAULT 0;
ALTER TABLE "scrape_logs" ADD COLUMN IF NOT EXISTS "jobs_added" integer DEFAULT 0;
ALTER TABLE "scrape_logs" ADD COLUMN IF NOT EXISTS "jobs_removed" integer DEFAULT 0;
ALTER TABLE "scrape_logs" ADD COLUMN IF NOT EXISTS "jobs_updated" integer DEFAULT 0;
ALTER TABLE "scrape_logs" ADD COLUMN IF NOT EXISTS "jobs_reopened" integer DEFAULT 0;
ALTER TABLE "scrape_logs" ADD COLUMN IF NOT EXISTS "duration_ms" integer;
ALTER TABLE "scrape_logs" ADD COLUMN IF NOT EXISTS "error_message" text;
ALTER TABLE "scrape_logs" ADD COLUMN IF NOT EXISTS "worker_id" text;
ALTER TABLE "scrape_logs" ADD COLUMN IF NOT EXISTS "scraper_version" text DEFAULT '1.0.0';
ALTER TABLE "sent_email_logs" ADD COLUMN IF NOT EXISTS "recipient_email" text NOT NULL;
ALTER TABLE "sent_email_logs" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "sent_email_logs" ADD COLUMN IF NOT EXISTS "sender_email" text;
ALTER TABLE "sent_email_logs" ADD COLUMN IF NOT EXISTS "subject" text NOT NULL;
ALTER TABLE "sent_email_logs" ADD COLUMN IF NOT EXISTS "template_type" text DEFAULT 'general' NOT NULL;
ALTER TABLE "sent_email_logs" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'sent' NOT NULL;
ALTER TABLE "sent_email_logs" ADD COLUMN IF NOT EXISTS "delivery_status" text;
ALTER TABLE "sent_email_logs" ADD COLUMN IF NOT EXISTS "delivery_updated_at" timestamp with time zone;
ALTER TABLE "sent_email_logs" ADD COLUMN IF NOT EXISTS "provider_message_id" text;
ALTER TABLE "sent_email_logs" ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 1 NOT NULL;
ALTER TABLE "sent_email_logs" ADD COLUMN IF NOT EXISTS "error_message" text;
ALTER TABLE "sent_email_logs" ADD COLUMN IF NOT EXISTS "html_content" text;
ALTER TABLE "sent_email_logs" ADD COLUMN IF NOT EXISTS "sender_id" uuid;
ALTER TABLE "sent_email_logs" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
ALTER TABLE "sent_email_logs" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "career_page_id" uuid NOT NULL;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "positive_keywords" text[];
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "negative_keywords" text[];
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "user_jobs" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE "user_jobs" ADD COLUMN IF NOT EXISTS "job_id" uuid;
ALTER TABLE "user_jobs" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'saved' NOT NULL;
ALTER TABLE "user_jobs" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "user_jobs" ADD COLUMN IF NOT EXISTS "applied_at" timestamp with time zone;
ALTER TABLE "user_jobs" ADD COLUMN IF NOT EXISTS "reminder_at" timestamp with time zone;
ALTER TABLE "user_jobs" ADD COLUMN IF NOT EXISTS "reminder_sent_at" timestamp with time zone;
ALTER TABLE "user_jobs" ADD COLUMN IF NOT EXISTS "snapshot" jsonb NOT NULL;
ALTER TABLE "user_jobs" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "user_jobs" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" text NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_id" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean DEFAULT false NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'user' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_blocked" boolean DEFAULT false NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "blocked_reason" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "blocked_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_notifications_enabled" boolean DEFAULT true NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notification_preference" text DEFAULT 'daily' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "digest_hour" integer DEFAULT 8 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "digest_minute" integer DEFAULT 0 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'UTC' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_digest_sent_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "frequency_enforcement_exempt" boolean DEFAULT false NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "quota_exempt" boolean DEFAULT false NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dispatch_group" integer DEFAULT 1 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "socials" jsonb;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notification_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "plan" text DEFAULT 'free' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "plan_expires_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_active_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_changed_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "worker_heartbeat" ADD COLUMN IF NOT EXISTS "heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "worker_heartbeat" ADD COLUMN IF NOT EXISTS "cycle_started_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "worker_heartbeat" ADD COLUMN IF NOT EXISTS "last_error" text;
ALTER TABLE "worker_heartbeat" ADD COLUMN IF NOT EXISTS "stats" jsonb;
ALTER TABLE "worker_heartbeat" ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone;

-- 3. Unique constraints
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'career_pages_url_unique') THEN
    ALTER TABLE "career_pages" ADD CONSTRAINT "career_pages_url_unique" UNIQUE("url");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_approvals_email_unique') THEN
    ALTER TABLE "email_approvals" ADD CONSTRAINT "email_approvals_email_unique" UNIQUE("email");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_verifications_token_hash_unique') THEN
    ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_token_hash_unique" UNIQUE("token_hash");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lists_slug_unique') THEN
    ALTER TABLE "lists" ADD CONSTRAINT "lists_slug_unique" UNIQUE("slug");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'password_resets_token_hash_unique') THEN
    ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_token_hash_unique" UNIQUE("token_hash");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refresh_tokens_token_hash_unique') THEN
    ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_google_id_unique') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_google_id_unique" UNIQUE("google_id");
  END IF;
END $$;

-- 4. Foreign keys (created, or re-created when the delete rule differs)
SELECT pg_temp.jp_ensure_fk('admin_audit_log', 'admin_id', 'users', 'id', 'SET NULL', 'admin_audit_log_admin_id_users_id_fk');
SELECT pg_temp.jp_ensure_fk('career_pages', 'created_by', 'users', 'id', 'SET NULL', 'career_pages_created_by_users_id_fk');
SELECT pg_temp.jp_ensure_fk('email_approvals', 'user_id', 'users', 'id', 'SET NULL', 'email_approvals_user_id_users_id_fk');
SELECT pg_temp.jp_ensure_fk('email_approvals', 'approved_by', 'users', 'id', 'SET NULL', 'email_approvals_approved_by_users_id_fk');
SELECT pg_temp.jp_ensure_fk('email_verifications', 'user_id', 'users', 'id', 'CASCADE', 'email_verifications_user_id_users_id_fk');
SELECT pg_temp.jp_ensure_fk('feature_flags', 'updated_by', 'users', 'id', 'SET NULL', 'feature_flags_updated_by_users_id_fk');
SELECT pg_temp.jp_ensure_fk('job_events', 'job_id', 'jobs', 'id', 'CASCADE', 'job_events_job_id_jobs_id_fk');
SELECT pg_temp.jp_ensure_fk('job_events', 'career_page_id', 'career_pages', 'id', 'CASCADE', 'job_events_career_page_id_career_pages_id_fk');
SELECT pg_temp.jp_ensure_fk('job_matches', 'user_id', 'users', 'id', 'CASCADE', 'job_matches_user_id_users_id_fk');
SELECT pg_temp.jp_ensure_fk('job_matches', 'job_id', 'jobs', 'id', 'CASCADE', 'job_matches_job_id_jobs_id_fk');
SELECT pg_temp.jp_ensure_fk('job_matches', 'list_id', 'lists', 'id', 'CASCADE', 'job_matches_list_id_lists_id_fk');
SELECT pg_temp.jp_ensure_fk('jobs', 'career_page_id', 'career_pages', 'id', 'CASCADE', 'jobs_career_page_id_career_pages_id_fk');
SELECT pg_temp.jp_ensure_fk('jobs', 'hidden_by', 'users', 'id', 'SET NULL', 'jobs_hidden_by_users_id_fk');
SELECT pg_temp.jp_ensure_fk('list_career_pages', 'list_id', 'lists', 'id', 'CASCADE', 'list_career_pages_list_id_lists_id_fk');
SELECT pg_temp.jp_ensure_fk('list_career_pages', 'career_page_id', 'career_pages', 'id', 'CASCADE', 'list_career_pages_career_page_id_career_pages_id_fk');
SELECT pg_temp.jp_ensure_fk('list_career_pages', 'added_by', 'users', 'id', 'SET NULL', 'list_career_pages_added_by_users_id_fk');
SELECT pg_temp.jp_ensure_fk('list_collaborators', 'list_id', 'lists', 'id', 'CASCADE', 'list_collaborators_list_id_lists_id_fk');
SELECT pg_temp.jp_ensure_fk('list_collaborators', 'user_id', 'users', 'id', 'CASCADE', 'list_collaborators_user_id_users_id_fk');
SELECT pg_temp.jp_ensure_fk('list_collaborators', 'invited_by', 'users', 'id', 'SET NULL', 'list_collaborators_invited_by_users_id_fk');
SELECT pg_temp.jp_ensure_fk('list_contributions', 'list_id', 'lists', 'id', 'CASCADE', 'list_contributions_list_id_lists_id_fk');
SELECT pg_temp.jp_ensure_fk('list_contributions', 'contributor_user_id', 'users', 'id', 'SET NULL', 'list_contributions_contributor_user_id_users_id_fk');
SELECT pg_temp.jp_ensure_fk('list_subscriptions', 'user_id', 'users', 'id', 'CASCADE', 'list_subscriptions_user_id_users_id_fk');
SELECT pg_temp.jp_ensure_fk('list_subscriptions', 'list_id', 'lists', 'id', 'CASCADE', 'list_subscriptions_list_id_lists_id_fk');
SELECT pg_temp.jp_ensure_fk('lists', 'user_id', 'users', 'id', 'CASCADE', 'lists_user_id_users_id_fk');
SELECT pg_temp.jp_ensure_fk('lists', 'parent_list_id', 'lists', 'id', 'SET NULL', 'lists_parent_list_id_lists_id_fk');
SELECT pg_temp.jp_ensure_fk('monitor_tasks', 'career_page_id', 'career_pages', 'id', 'CASCADE', 'monitor_tasks_career_page_id_career_pages_id_fk');
SELECT pg_temp.jp_ensure_fk('monitor_tasks', 'requested_by', 'users', 'id', 'SET NULL', 'monitor_tasks_requested_by_users_id_fk');
SELECT pg_temp.jp_ensure_fk('notification_queue', 'user_id', 'users', 'id', 'CASCADE', 'notification_queue_user_id_users_id_fk');
SELECT pg_temp.jp_ensure_fk('notification_queue', 'job_id', 'jobs', 'id', 'CASCADE', 'notification_queue_job_id_jobs_id_fk');
SELECT pg_temp.jp_ensure_fk('notification_queue', 'list_id', 'lists', 'id', 'SET NULL', 'notification_queue_list_id_lists_id_fk');
SELECT pg_temp.jp_ensure_fk('notifications', 'user_id', 'users', 'id', 'CASCADE', 'notifications_user_id_users_id_fk');
SELECT pg_temp.jp_ensure_fk('oauth_accounts', 'user_id', 'users', 'id', 'CASCADE', 'oauth_accounts_user_id_users_id_fk');
SELECT pg_temp.jp_ensure_fk('password_resets', 'user_id', 'users', 'id', 'CASCADE', 'password_resets_user_id_users_id_fk');
SELECT pg_temp.jp_ensure_fk('refresh_tokens', 'user_id', 'users', 'id', 'CASCADE', 'refresh_tokens_user_id_users_id_fk');
SELECT pg_temp.jp_ensure_fk('reported_issues', 'user_id', 'users', 'id', 'SET NULL', 'reported_issues_user_id_users_id_fk');
SELECT pg_temp.jp_ensure_fk('reported_issues', 'resolved_by', 'users', 'id', 'SET NULL', 'reported_issues_resolved_by_users_id_fk');
SELECT pg_temp.jp_ensure_fk('scrape_logs', 'career_page_id', 'career_pages', 'id', 'CASCADE', 'scrape_logs_career_page_id_career_pages_id_fk');
SELECT pg_temp.jp_ensure_fk('sent_email_logs', 'user_id', 'users', 'id', 'SET NULL', 'sent_email_logs_user_id_users_id_fk');
SELECT pg_temp.jp_ensure_fk('sent_email_logs', 'sender_id', 'users', 'id', 'SET NULL', 'sent_email_logs_sender_id_users_id_fk');
SELECT pg_temp.jp_ensure_fk('subscriptions', 'user_id', 'users', 'id', 'CASCADE', 'subscriptions_user_id_users_id_fk');
SELECT pg_temp.jp_ensure_fk('subscriptions', 'career_page_id', 'career_pages', 'id', 'CASCADE', 'subscriptions_career_page_id_career_pages_id_fk');
SELECT pg_temp.jp_ensure_fk('user_jobs', 'user_id', 'users', 'id', 'CASCADE', 'user_jobs_user_id_users_id_fk');
SELECT pg_temp.jp_ensure_fk('user_jobs', 'job_id', 'jobs', 'id', 'SET NULL', 'user_jobs_job_id_jobs_id_fk');

-- 5. Indexes
CREATE INDEX IF NOT EXISTS "idx_audit_created" ON "admin_audit_log" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "idx_audit_action" ON "admin_audit_log" USING btree ("action","created_at");
CREATE INDEX IF NOT EXISTS "idx_audit_target" ON "admin_audit_log" USING btree ("target_type","target_id");
CREATE INDEX IF NOT EXISTS "idx_audit_actor" ON "admin_audit_log" USING btree ("admin_id","created_at");
CREATE INDEX IF NOT EXISTS "idx_career_pages_due" ON "career_pages" USING btree ("status","next_check_at");
CREATE INDEX IF NOT EXISTS "idx_career_pages_company" ON "career_pages" USING btree ("company_name");
CREATE INDEX IF NOT EXISTS "idx_email_verifications_user" ON "email_verifications" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_job_events_job" ON "job_events" USING btree ("job_id","created_at");
CREATE INDEX IF NOT EXISTS "idx_job_events_page" ON "job_events" USING btree ("career_page_id","created_at");
CREATE INDEX IF NOT EXISTS "idx_job_events_type" ON "job_events" USING btree ("type","created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "unique_job_match" ON "job_matches" USING btree ("user_id","job_id","list_id");
CREATE INDEX IF NOT EXISTS "idx_job_matches_user" ON "job_matches" USING btree ("user_id","created_at");
CREATE INDEX IF NOT EXISTS "idx_job_matches_job" ON "job_matches" USING btree ("job_id");
CREATE INDEX IF NOT EXISTS "idx_job_matches_list" ON "job_matches" USING btree ("list_id");
CREATE UNIQUE INDEX IF NOT EXISTS "unique_career_page_fingerprint" ON "jobs" USING btree ("career_page_id","fingerprint");
CREATE INDEX IF NOT EXISTS "idx_jobs_career_page_status" ON "jobs" USING btree ("career_page_id","status");
CREATE INDEX IF NOT EXISTS "idx_jobs_fingerprint" ON "jobs" USING btree ("fingerprint");
CREATE INDEX IF NOT EXISTS "idx_jobs_feed" ON "jobs" USING btree ("status","first_seen_at");
CREATE INDEX IF NOT EXISTS "idx_jobs_page_first_seen" ON "jobs" USING btree ("career_page_id","first_seen_at");
CREATE INDEX IF NOT EXISTS "idx_jobs_dedupe" ON "jobs" USING btree ("career_page_id","dedupe_key");
CREATE INDEX IF NOT EXISTS "idx_jobs_url_key" ON "jobs" USING btree ("career_page_id","url_key");
CREATE INDEX IF NOT EXISTS "idx_jobs_closed_at" ON "jobs" USING btree ("closed_at");
CREATE UNIQUE INDEX IF NOT EXISTS "unique_list_career_page" ON "list_career_pages" USING btree ("list_id","career_page_id");
CREATE INDEX IF NOT EXISTS "idx_list_pages_list" ON "list_career_pages" USING btree ("list_id");
CREATE INDEX IF NOT EXISTS "idx_list_pages_page" ON "list_career_pages" USING btree ("career_page_id");
CREATE UNIQUE INDEX IF NOT EXISTS "unique_user_list_collab" ON "list_collaborators" USING btree ("user_id","list_id");
CREATE INDEX IF NOT EXISTS "idx_list_collab_list" ON "list_collaborators" USING btree ("list_id");
CREATE INDEX IF NOT EXISTS "idx_list_collab_user" ON "list_collaborators" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_list_collab_status" ON "list_collaborators" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_list_collab_user_status" ON "list_collaborators" USING btree ("user_id","status");
CREATE INDEX IF NOT EXISTS "idx_list_collab_token" ON "list_collaborators" USING btree ("invite_token");
CREATE INDEX IF NOT EXISTS "idx_list_contrib_list" ON "list_contributions" USING btree ("list_id");
CREATE INDEX IF NOT EXISTS "idx_list_contrib_status" ON "list_contributions" USING btree ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "unique_user_list_sub" ON "list_subscriptions" USING btree ("user_id","list_id");
CREATE INDEX IF NOT EXISTS "idx_list_sub_list" ON "list_subscriptions" USING btree ("list_id");
CREATE INDEX IF NOT EXISTS "idx_list_sub_user" ON "list_subscriptions" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_list_user" ON "lists" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_list_visibility" ON "lists" USING btree ("visibility");
CREATE INDEX IF NOT EXISTS "idx_list_parent" ON "lists" USING btree ("parent_list_id");
CREATE INDEX IF NOT EXISTS "idx_list_deleted_at" ON "lists" USING btree ("deleted_at");
CREATE INDEX IF NOT EXISTS "idx_monitor_tasks_claim" ON "monitor_tasks" USING btree ("status","run_after","priority");
CREATE INDEX IF NOT EXISTS "idx_monitor_tasks_page" ON "monitor_tasks" USING btree ("career_page_id","enqueued_at");
CREATE INDEX IF NOT EXISTS "idx_monitor_tasks_finished" ON "monitor_tasks" USING btree ("finished_at");
CREATE UNIQUE INDEX IF NOT EXISTS "unique_active_task_per_page" ON "monitor_tasks" USING btree ("career_page_id") WHERE status IN ('queued', 'running');
CREATE UNIQUE INDEX IF NOT EXISTS "unique_user_job_event" ON "notification_queue" USING btree ("user_id","job_id","event_type");
CREATE INDEX IF NOT EXISTS "idx_notification_queue_pending" ON "notification_queue" USING btree ("user_id","sent_at");
CREATE INDEX IF NOT EXISTS "idx_notification_queue_list" ON "notification_queue" USING btree ("list_id");
CREATE INDEX IF NOT EXISTS "idx_notification_queue_unsent" ON "notification_queue" USING btree ("created_at") WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_notifications_user" ON "notifications" USING btree ("user_id","created_at");
CREATE INDEX IF NOT EXISTS "idx_notifications_unread" ON "notifications" USING btree ("user_id") WHERE read_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "unique_notification_dedupe" ON "notifications" USING btree ("user_id","dedupe_key");
CREATE UNIQUE INDEX IF NOT EXISTS "unique_provider_provider_id" ON "oauth_accounts" USING btree ("provider","provider_id");
CREATE INDEX IF NOT EXISTS "idx_password_resets_user" ON "password_resets" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_user" ON "refresh_tokens" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_hash" ON "refresh_tokens" USING btree ("token_hash");
CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_expires" ON "refresh_tokens" USING btree ("expires_at");
CREATE INDEX IF NOT EXISTS "idx_reported_issues_status" ON "reported_issues" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_reported_issues_category" ON "reported_issues" USING btree ("category");
CREATE INDEX IF NOT EXISTS "idx_scrape_logs_page_time" ON "scrape_logs" USING btree ("career_page_id","scraped_at");
CREATE INDEX IF NOT EXISTS "idx_scrape_logs_time" ON "scrape_logs" USING btree ("scraped_at");
CREATE INDEX IF NOT EXISTS "idx_sent_email_recipient" ON "sent_email_logs" USING btree ("recipient_email");
CREATE INDEX IF NOT EXISTS "idx_sent_email_template" ON "sent_email_logs" USING btree ("template_type");
CREATE INDEX IF NOT EXISTS "idx_sent_email_created" ON "sent_email_logs" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "idx_sent_email_status" ON "sent_email_logs" USING btree ("status","created_at");
CREATE INDEX IF NOT EXISTS "idx_sent_email_message" ON "sent_email_logs" USING btree ("provider_message_id");
CREATE UNIQUE INDEX IF NOT EXISTS "unique_user_career_page_sub" ON "subscriptions" USING btree ("user_id","career_page_id");
CREATE INDEX IF NOT EXISTS "idx_subscriptions_career_page" ON "subscriptions" USING btree ("career_page_id");
CREATE UNIQUE INDEX IF NOT EXISTS "unique_user_job" ON "user_jobs" USING btree ("user_id","job_id");
CREATE INDEX IF NOT EXISTS "idx_user_jobs_user_status" ON "user_jobs" USING btree ("user_id","status");
CREATE INDEX IF NOT EXISTS "idx_user_jobs_reminder" ON "user_jobs" USING btree ("reminder_at");
CREATE INDEX IF NOT EXISTS "idx_users_created" ON "users" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users" USING btree ("role");
CREATE INDEX IF NOT EXISTS "idx_users_last_active" ON "users" USING btree ("last_active_at");
