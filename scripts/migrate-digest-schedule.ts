/**
 * Idempotent migration for timezone-aware digest scheduling.
 *
 * Run with: npm run db:migrate:digest
 *
 * `drizzle-kit push` can create the new columns and change the column default,
 * but it cannot do the data migration this change needs:
 *
 *  - users.last_digest_sent_at has to be seeded from real digest sends, or every
 *    existing user looks like "never delivered" and gets a digest on the first
 *    worker cycle after deploy.
 *  - list_subscriptions.digest_frequency rows all hold the old column default
 *    'instant'. That column was dead data (nothing ever read it); now that it is
 *    honoured, leaving it as 'instant' would override every user's account
 *    preference with instant alerts. They are migrated to 'inherit'.
 *
 * Safe to run more than once.
 */

import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jobpingly';
const client = postgres(connectionString, { prepare: false });

async function migrate() {
  console.log('[migrate-digest-schedule] Starting...');
  try {
    // 1. Per-user delivery time + timezone.
    await client`ALTER TABLE users ADD COLUMN IF NOT EXISTS digest_hour integer DEFAULT 8 NOT NULL`;
    await client`ALTER TABLE users ADD COLUMN IF NOT EXISTS digest_minute integer DEFAULT 0 NOT NULL`;
    await client`ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'UTC' NOT NULL`;
    await client`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_digest_sent_at timestamp with time zone`;
    console.log('[migrate-digest-schedule] users columns ensured.');

    // Clamp anything out of range.
    const clampedHours = await client`
      UPDATE users SET digest_hour = 8 WHERE digest_hour < 0 OR digest_hour > 23
    `;
    const clampedMinutes = await client`
      UPDATE users SET digest_minute = 0 WHERE digest_minute < 0 OR digest_minute > 59
    `;
    if (clampedHours.count || clampedMinutes.count) {
      console.log(`[migrate-digest-schedule] Clamped ${clampedHours.count} hour(s) and ${clampedMinutes.count} minute(s).`);
    }

    // 2. Seed the delivery marker from genuine digest sends.
    const seeded = await client`
      UPDATE users u
      SET last_digest_sent_at = s.last_sent
      FROM (
        SELECT lower(recipient_email) AS email, MAX(created_at) AS last_sent
        FROM sent_email_logs
        WHERE template_type = 'digest' AND status = 'sent'
        GROUP BY lower(recipient_email)
      ) s
      WHERE lower(u.email) = s.email AND u.last_digest_sent_at IS NULL
    `;
    console.log(`[migrate-digest-schedule] Seeded last_digest_sent_at for ${seeded.count} user(s).`);

    // 3. Per-list frequency inheritance.
    await client`ALTER TABLE list_subscriptions ALTER COLUMN digest_frequency SET DEFAULT 'inherit'`;
    const inherited = await client`
      UPDATE list_subscriptions SET digest_frequency = 'inherit'
      WHERE digest_frequency IN ('instant', '')
    `;
    console.log(`[migrate-digest-schedule] Moved ${inherited.count} subscription(s) to 'inherit'.`);

    // 4. List attribution on queued notifications.
    await client`ALTER TABLE notification_queue ADD COLUMN IF NOT EXISTS list_id uuid`;
    await client`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'notification_queue_list_id_fkey'
        ) THEN
          ALTER TABLE notification_queue
            ADD CONSTRAINT notification_queue_list_id_fkey
            FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE SET NULL;
        END IF;
      END $$
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_notification_queue_list ON notification_queue (list_id)`;
    console.log('[migrate-digest-schedule] notification_queue.list_id ensured.');

    console.log('[migrate-digest-schedule] Completed successfully.');
  } catch (err) {
    console.error('[migrate-digest-schedule] Failed:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

migrate();
