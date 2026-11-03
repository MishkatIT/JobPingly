-- Digest scheduling: wall-clock delivery time, timezone, true last-sent marker,
-- per-list frequency inheritance and list attribution on queued notifications.

-- 1. Per-user delivery time + timezone. Defaults match the previously advertised
--    "8:00 AM daily digest", which was never actually implemented.
ALTER TABLE users ADD COLUMN IF NOT EXISTS digest_hour integer DEFAULT 8 NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS digest_minute integer DEFAULT 0 NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'UTC' NOT NULL;

-- 2. True "last digest email dispatched" marker. notification_queue.sent_at is
--    also stamped when a row is only resolved (suppressed / pruned / unapproved),
--    so it cannot be used as the schedule window.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_digest_sent_at timestamp with time zone;

-- Seed it from real digest sends so existing users are not all treated as
-- "never delivered" on the first run after deploy.
UPDATE users u
SET last_digest_sent_at = s.last_sent
FROM (
  SELECT lower(recipient_email) AS email, MAX(created_at) AS last_sent
  FROM sent_email_logs
  WHERE template_type = 'digest' AND status = 'sent'
  GROUP BY lower(recipient_email)
) s
WHERE lower(u.email) = s.email AND u.last_digest_sent_at IS NULL;

ALTER TABLE users ALTER COLUMN digest_hour SET DEFAULT 8;
ALTER TABLE users ALTER COLUMN digest_minute SET DEFAULT 0;
ALTER TABLE users ALTER COLUMN timezone SET DEFAULT 'UTC';

-- Clamp any out-of-range values that predate validation.
UPDATE users SET digest_hour = 8 WHERE digest_hour < 0 OR digest_hour > 23;
UPDATE users SET digest_minute = 0 WHERE digest_minute < 0 OR digest_minute > 59;

-- 3. Per-list digest frequency now supports 'inherit' (use the account default).
--    Every existing row holds the old column default 'instant', which was dead
--    data (the processor never read it); migrating them to 'inherit' keeps
--    current behaviour instead of suddenly overriding account preferences.
ALTER TABLE list_subscriptions ALTER COLUMN digest_frequency SET DEFAULT 'inherit';
UPDATE list_subscriptions SET digest_frequency = 'inherit' WHERE digest_frequency IN ('instant', '');

-- 4. Attribute each queued notification to the list subscription that matched it,
--    so per-list frequency can be honoured.
ALTER TABLE notification_queue ADD COLUMN IF NOT EXISTS list_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_queue_list_id_fkey'
  ) THEN
    ALTER TABLE notification_queue
      ADD CONSTRAINT notification_queue_list_id_fkey
      FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notification_queue_list ON notification_queue (list_id);
