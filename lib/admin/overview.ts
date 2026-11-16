import { client } from '@/lib/db/client';
import { getTodaySentEmailCount } from '@/lib/email/send';
import { env } from '@/lib/env';
import { getQueueStats } from '@/lib/monitoring/queue';
import { getWorkerHealth } from '@/lib/monitoring/scheduler';
import { loadNotificationPolicy } from '@/lib/notifications/policy';
import { getSettings } from '@/lib/settings/store';

/** Platform-wide figures for the admin overview. Every number is a live query. */
export async function adminOverview() {
  const [counts] = await client<
    {
      usersTotal: number;
      usersVerified: number;
      usersUnverified: number;
      usersSuspended: number;
      usersNewToday: number;
      usersNew7d: number;
      usersNewPrev7d: number;
      usersActive7d: number;
      usersActive30d: number;
      sourcesTotal: number;
      sourcesActive: number;
      sourcesDegraded: number;
      sourcesBroken: number;
      sourcesPaused: number;
      sourcesPending: number;
      sourcesUnwatched: number;
      jobsOpen: number;
      jobsNewToday: number;
      jobsNew7d: number;
      jobsNewPrev7d: number;
      jobsClosed7d: number;
      jobsHidden: number;
      scans24h: number;
      scansFailed24h: number;
      scansSuspicious24h: number;
      listsTotal: number;
      listsPublic: number;
      pendingAlerts: number;
      pendingApprovals: number;
      openIssues: number;
      dbBytes: number;
    }[]
  >`
    SELECT
      (SELECT count(*) FROM users)::int AS "usersTotal",
      (SELECT count(*) FROM users WHERE email_verified)::int AS "usersVerified",
      (SELECT count(*) FROM users WHERE NOT email_verified)::int AS "usersUnverified",
      (SELECT count(*) FROM users WHERE is_blocked)::int AS "usersSuspended",
      (SELECT count(*) FROM users WHERE created_at >= date_trunc('day', now()))::int AS "usersNewToday",
      (SELECT count(*) FROM users WHERE created_at > now() - interval '7 days')::int AS "usersNew7d",
      (SELECT count(*) FROM users WHERE created_at > now() - interval '14 days' AND created_at <= now() - interval '7 days')::int AS "usersNewPrev7d",
      (SELECT count(*) FROM users WHERE last_active_at > now() - interval '7 days')::int AS "usersActive7d",
      (SELECT count(*) FROM users WHERE last_active_at > now() - interval '30 days')::int AS "usersActive30d",
      (SELECT count(*) FROM career_pages)::int AS "sourcesTotal",
      (SELECT count(*) FROM career_pages WHERE status = 'active' AND last_success_at IS NOT NULL)::int AS "sourcesActive",
      (SELECT count(*) FROM career_pages WHERE status = 'degraded')::int AS "sourcesDegraded",
      (SELECT count(*) FROM career_pages WHERE status = 'broken')::int AS "sourcesBroken",
      (SELECT count(*) FROM career_pages WHERE status = 'paused')::int AS "sourcesPaused",
      (SELECT count(*) FROM career_pages WHERE last_success_at IS NULL AND status <> 'paused')::int AS "sourcesPending",
      (SELECT count(*) FROM career_pages cp WHERE NOT EXISTS (
        SELECT 1 FROM list_career_pages x JOIN lists l ON l.id = x.list_id
        WHERE x.career_page_id = cp.id AND l.deleted_at IS NULL))::int AS "sourcesUnwatched",
      (SELECT count(*) FROM jobs WHERE status = 'active' AND hidden_at IS NULL)::int AS "jobsOpen",
      (SELECT count(*) FROM jobs WHERE first_seen_at >= date_trunc('day', now()))::int AS "jobsNewToday",
      (SELECT count(*) FROM jobs WHERE first_seen_at > now() - interval '7 days')::int AS "jobsNew7d",
      (SELECT count(*) FROM jobs WHERE first_seen_at > now() - interval '14 days' AND first_seen_at <= now() - interval '7 days')::int AS "jobsNewPrev7d",
      (SELECT count(*) FROM jobs WHERE status = 'closed' AND closed_at > now() - interval '7 days')::int AS "jobsClosed7d",
      (SELECT count(*) FROM jobs WHERE hidden_at IS NOT NULL)::int AS "jobsHidden",
      (SELECT count(*) FROM scrape_logs WHERE scraped_at > now() - interval '24 hours')::int AS "scans24h",
      (SELECT count(*) FROM scrape_logs WHERE scraped_at > now() - interval '24 hours' AND NOT success)::int AS "scansFailed24h",
      (SELECT count(*) FROM scrape_logs WHERE scraped_at > now() - interval '24 hours' AND suspicious)::int AS "scansSuspicious24h",
      (SELECT count(*) FROM lists WHERE deleted_at IS NULL)::int AS "listsTotal",
      (SELECT count(*) FROM lists WHERE deleted_at IS NULL AND visibility = 'public')::int AS "listsPublic",
      (SELECT count(*) FROM notification_queue WHERE sent_at IS NULL)::int AS "pendingAlerts",
      (SELECT count(*) FROM email_approvals WHERE status = 'pending')::int AS "pendingApprovals",
      (SELECT count(*) FROM reported_issues WHERE status IN ('open', 'in_progress'))::int AS "openIssues",
      pg_database_size(current_database())::bigint AS "dbBytes"
  `;

  const series = await client<{ day: Date; signups: number; jobs: number; scansOk: number; scansFailed: number; emailsSent: number; emailsFailed: number }[]>`
    WITH days AS (
      SELECT generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') AS day
    )
    SELECT d.day,
      (SELECT count(*) FROM users u WHERE u.created_at >= d.day AND u.created_at < d.day + interval '1 day')::int AS signups,
      (SELECT count(*) FROM jobs j WHERE j.first_seen_at >= d.day AND j.first_seen_at < d.day + interval '1 day')::int AS jobs,
      (SELECT count(*) FROM scrape_logs s WHERE s.scraped_at >= d.day AND s.scraped_at < d.day + interval '1 day' AND s.success)::int AS "scansOk",
      (SELECT count(*) FROM scrape_logs s WHERE s.scraped_at >= d.day AND s.scraped_at < d.day + interval '1 day' AND NOT s.success)::int AS "scansFailed",
      (SELECT count(*) FROM sent_email_logs e WHERE e.created_at >= d.day AND e.created_at < d.day + interval '1 day' AND e.status = 'sent')::int AS "emailsSent",
      (SELECT count(*) FROM sent_email_logs e WHERE e.created_at >= d.day AND e.created_at < d.day + interval '1 day' AND e.status = 'failed')::int AS "emailsFailed"
    FROM days d
    ORDER BY d.day
  `;

  const failuresByClass = await client<{ errorClass: string; count: number }[]>`
    SELECT coalesce(error_class, 'unknown') AS "errorClass", count(*)::int AS count
    FROM scrape_logs WHERE scraped_at > now() - interval '24 hours' AND NOT success
    GROUP BY 1 ORDER BY 2 DESC LIMIT 8
  `;

  const adapters = await client<{ adapter: string; count: number }[]>`
    SELECT coalesce(ats_type, 'unknown') AS adapter, count(*)::int AS count FROM career_pages GROUP BY 1 ORDER BY 2 DESC
  `;

  const [queue, workers, email, policy, settings] = await Promise.all([
    getQueueStats(),
    getWorkerHealth(),
    getTodaySentEmailCount(),
    loadNotificationPolicy(),
    getSettings(['scraper.enabled', 'notifications.enabled', 'platform.maintenance_mode', 'auth.signup_enabled']),
  ]);

  return {
    counts: {
      ...counts,
      dbBytes: Number(counts.dbBytes),
      scanSuccessRate24h: counts.scans24h > 0 ? (counts.scans24h - counts.scansFailed24h) / counts.scans24h : null,
    },
    series,
    failuresByClass,
    adapters,
    queue,
    workers,
    email: { ...email, dailyLimit: policy.dailyLimit, digestLimit: policy.effectiveDigestLimit, provider: env.email.provider },
    switches: {
      monitoring: settings['scraper.enabled'],
      emailAlerts: settings['notifications.enabled'],
      maintenance: settings['platform.maintenance_mode'],
      signups: settings['auth.signup_enabled'],
    },
  };
}
