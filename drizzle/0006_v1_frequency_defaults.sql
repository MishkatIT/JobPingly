-- 0006_v1_frequency_defaults.sql
--
-- Finishes what v1's legacy 0002 migration intended but production never ran
-- (found by comparing the upgraded production copy with a fresh database:
-- this was the only column whose default differed).
--
-- Watchlist subscriptions were created with the old column default 'instant',
-- which v1's own notes describe as dead data the processor never read. v2
-- reads a watchlist's frequency, and 'instant' means "send immediately", so
-- left alone every existing subscription would switch from the account's
-- digest schedule to one email per match. 'inherit' keeps the account
-- preference, which is how these subscriptions behaved. People choose
-- "As soon as a job is found" in v2 as 'realtime', so no current choice is
-- overwritten. Safe to run more than once.

ALTER TABLE "list_subscriptions" ALTER COLUMN "digest_frequency" SET DEFAULT 'inherit';

UPDATE "list_subscriptions"
SET "digest_frequency" = 'inherit'
WHERE "digest_frequency" IN ('instant', '');

-- Seed the digest schedule's "last sent" marker from real digest emails, so
-- people who received digests are not all treated as never delivered.
UPDATE "users" u
SET "last_digest_sent_at" = s.last_sent
FROM (
  SELECT lower("recipient_email") AS email, max("created_at") AS last_sent
  FROM "sent_email_logs"
  WHERE "template_type" = 'digest' AND "status" = 'sent'
  GROUP BY lower("recipient_email")
) s
WHERE lower(u."email") = s.email AND u."last_digest_sent_at" IS NULL;
