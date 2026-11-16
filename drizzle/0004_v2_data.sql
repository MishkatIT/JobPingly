-- 0004_v2_data.sql
--
-- Data adjustments that accompany the v2 schema. Every statement is safe to
-- run more than once and none of them deletes a user-facing record.

-- 1. Scan history: derive the new `outcome` column from the legacy booleans.
UPDATE scrape_logs
SET outcome = CASE
  WHEN success = false THEN 'failed'
  WHEN suspicious = true THEN 'suspicious'
  WHEN error_message ILIKE 'Content unchanged%' THEN 'unchanged'
  ELSE 'success'
END
WHERE outcome IS NULL;

-- "Content unchanged" was stored in error_message although it is not an error.
UPDATE scrape_logs
SET error_message = NULL
WHERE success = true AND error_message ILIKE 'Content unchanged%';

-- 2. Adapter names. The pipeline used to store whichever extractor ran,
--    including the LLM model name; normalise those to stable adapter ids.
UPDATE career_pages SET ats_type = 'ai', scrape_method = 'ai'
WHERE ats_type LIKE 'ollama\_%' ESCAPE '\';

UPDATE career_pages SET ats_type = 'browser', scrape_method = 'browser'
WHERE ats_type = 'playwright_browser';

UPDATE career_pages SET ats_type = 'generic_html', scrape_method = 'html'
WHERE ats_type IN ('generic', 'api_detectors');

UPDATE career_pages SET scrape_method = 'api'
WHERE ats_type IN ('greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters');

-- 3. Denormalised open-job counter.
UPDATE career_pages cp
SET active_job_count = COALESCE(j.n, 0)
FROM (
  SELECT cp2.id, COUNT(jb.id)::int AS n
  FROM career_pages cp2
  LEFT JOIN jobs jb ON jb.career_page_id = cp2.id AND jb.status = 'active' AND jb.hidden_at IS NULL
  GROUP BY cp2.id
) j
WHERE j.id = cp.id AND cp.active_job_count IS DISTINCT FROM COALESCE(j.n, 0);

-- 4. Health columns: seed from the most recent scan so the source list is
--    meaningful immediately after deploy instead of after the next scan.
UPDATE career_pages cp
SET last_jobs_found = l.jobs_found,
    last_duration_ms = l.duration_ms
FROM (
  SELECT DISTINCT ON (career_page_id) career_page_id, jobs_found, duration_ms
  FROM scrape_logs
  WHERE success = true AND COALESCE(outcome, '') <> 'unchanged'
  ORDER BY career_page_id, scraped_at DESC
) l
WHERE l.career_page_id = cp.id AND cp.last_jobs_found IS NULL;

UPDATE career_pages cp
SET last_error = l.error_message,
    last_failure_at = l.scraped_at
FROM (
  SELECT DISTINCT ON (career_page_id) career_page_id, error_message, scraped_at
  FROM scrape_logs
  WHERE success = false
  ORDER BY career_page_id, scraped_at DESC
) l
WHERE l.career_page_id = cp.id
  AND cp.consecutive_failures > 0
  AND cp.last_error IS NULL;

-- 5. Job timestamps.
UPDATE jobs SET updated_at = last_seen_at WHERE updated_at > last_seen_at;

-- 6. Stored email bodies. Verification codes, password-reset links and invite
--    tokens were being kept in clear text in sent_email_logs.html_content and
--    shown in the admin panel. Remove the bodies; the delivery record stays.
UPDATE sent_email_logs
SET html_content = NULL
WHERE html_content IS NOT NULL
  AND template_type IN ('otp', 'reset', 'invite');

-- 7. The "master admin list" kept an exclusion list inside its description
--    text. The auto-sync that needed it is gone (admins manage sources from
--    the Sources screen), so restore a plain description. The list and its
--    companies are kept exactly as they are.
UPDATE lists
SET description = NULLIF(btrim(split_part(description, '|EXCLUDED:', 1)), '')
WHERE description LIKE '%|EXCLUDED:[%';

-- 8. Every list owner has a subscription row for their own list (that is where
--    alert rules live). Owners who had no row were not receiving alerts for
--    that list, so the backfilled rows are created with alerts switched off:
--    nobody starts receiving email they were not receiving before.
INSERT INTO list_subscriptions (user_id, list_id, alerts_enabled)
SELECT l.user_id, l.id, false
FROM lists l
WHERE l.deleted_at IS NULL
ON CONFLICT (user_id, list_id) DO NOTHING;

-- 9. follower_count caches the number of people following a list, not
--    counting its owner (who always has a subscription row for alerts).
UPDATE lists l
SET follower_count = (
  SELECT COUNT(*)::int FROM list_subscriptions s
  WHERE s.list_id = l.id AND s.user_id <> l.user_id
)
WHERE l.follower_count IS DISTINCT FROM (
  SELECT COUNT(*)::int FROM list_subscriptions s
  WHERE s.list_id = l.id AND s.user_id <> l.user_id
);

-- 10. Collapse the duplicated enforcement flag into a single key.
INSERT INTO feature_flags (key, value, description)
SELECT 'notifications.enforce_frequency', value, 'Apply one digest frequency to every non-exempt user'
FROM feature_flags
WHERE key = 'email.enforce_frequency_policy' AND value = 'true'::jsonb
ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb;

DELETE FROM feature_flags WHERE key = 'email.enforce_frequency_policy';

-- 11. Queue rows that point at users who can no longer receive mail were
--     being re-read on every worker cycle. Settle them once.
UPDATE notification_queue q
SET sent_at = now(), last_error = 'Settled during v2 migration: recipient blocked'
FROM users u
WHERE u.id = q.user_id AND q.sent_at IS NULL AND u.is_blocked = true;
