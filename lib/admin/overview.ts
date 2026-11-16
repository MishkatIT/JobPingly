import { client } from '@/lib/db/client';
import { getTodaySentEmailCount } from '@/lib/email/send';
import { env } from '@/lib/env';
import { adapterLabel } from '@/lib/monitoring/adapters';
import { describeErrorClass } from '@/lib/monitoring/errors';
import { getQueueStats } from '@/lib/monitoring/queue';
import { getWorkerHealth } from '@/lib/monitoring/scheduler';
import { loadNotificationPolicy } from '@/lib/notifications/policy';
import { getSettings } from '@/lib/settings/store';

let sizeCache: { bytes: number; at: number } | null = null;

/**
 * pg_database_size() walks every file of the database (about 100 ms even on a
 * small one), so the figure is cached for ten minutes per process.
 */
async function databaseSize(): Promise<number> {
  if (sizeCache && Date.now() - sizeCache.at < 10 * 60_000) return sizeCache.bytes;
  const [row] = await client<{ bytes: string }[]>`SELECT pg_database_size(current_database())::bigint AS bytes`;
  sizeCache = { bytes: Number(row?.bytes ?? 0), at: Date.now() };
  return sizeCache.bytes;
}

/** Platform-wide figures for the admin overview. Every number is a live query (database size: up to 10 minutes old). */
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
      -- Sources that never succeeded count as degraded once a scan has failed, so the buckets add up.
      (SELECT count(*) FROM career_pages WHERE status = 'degraded'
        OR (status = 'active' AND last_success_at IS NULL AND last_error_class IS NOT NULL))::int AS "sourcesDegraded",
      (SELECT count(*) FROM career_pages WHERE status = 'broken')::int AS "sourcesBroken",
      (SELECT count(*) FROM career_pages WHERE status = 'paused')::int AS "sourcesPaused",
      (SELECT count(*) FROM career_pages WHERE last_success_at IS NULL AND last_error_class IS NULL AND status NOT IN ('paused', 'broken', 'degraded'))::int AS "sourcesPending",
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
      (SELECT count(*) FROM reported_issues WHERE status IN ('open', 'in_progress'))::int AS "openIssues"
  `;

  // One grouped pass per table over the window (instead of a sub-query per day and metric).
  const series = await client<{ day: Date; signups: number; jobs: number; scansOk: number; scansFailed: number; emailsSent: number; emailsFailed: number }[]>`
    WITH bounds AS (SELECT date_trunc('day', now()) - interval '29 days' AS start),
    days AS (
      SELECT generate_series((SELECT start FROM bounds), date_trunc('day', now()), interval '1 day') AS day
    ),
    signups AS (
      SELECT date_trunc('day', created_at) AS day, count(*)::int AS n
      FROM users WHERE created_at >= (SELECT start FROM bounds) GROUP BY 1
    ),
    found AS (
      SELECT date_trunc('day', first_seen_at) AS day, count(*)::int AS n
      FROM jobs WHERE first_seen_at >= (SELECT start FROM bounds) GROUP BY 1
    ),
    scans AS (
      SELECT date_trunc('day', scraped_at) AS day,
        count(*) FILTER (WHERE success)::int AS ok, count(*) FILTER (WHERE NOT success)::int AS failed
      FROM scrape_logs WHERE scraped_at >= (SELECT start FROM bounds) GROUP BY 1
    ),
    mail AS (
      SELECT date_trunc('day', created_at) AS day,
        count(*) FILTER (WHERE status = 'sent')::int AS sent, count(*) FILTER (WHERE status = 'failed')::int AS failed
      FROM sent_email_logs WHERE created_at >= (SELECT start FROM bounds) GROUP BY 1
    )
    SELECT d.day,
      coalesce(s.n, 0) AS signups,
      coalesce(f.n, 0) AS jobs,
      coalesce(sc.ok, 0) AS "scansOk",
      coalesce(sc.failed, 0) AS "scansFailed",
      coalesce(m.sent, 0) AS "emailsSent",
      coalesce(m.failed, 0) AS "emailsFailed"
    FROM days d
    LEFT JOIN signups s ON s.day = d.day
    LEFT JOIN found f ON f.day = d.day
    LEFT JOIN scans sc ON sc.day = d.day
    LEFT JOIN mail m ON m.day = d.day
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

  const [queue, workers, email, policy, settings, dbBytes] = await Promise.all([
    getQueueStats(),
    getWorkerHealth(),
    getTodaySentEmailCount(),
    loadNotificationPolicy(),
    getSettings(['scraper.enabled', 'notifications.enabled', 'platform.maintenance_mode', 'auth.signup_enabled']),
    databaseSize(),
  ]);

  return {
    counts: {
      ...counts,
      dbBytes,
      scanSuccessRate24h: counts.scans24h > 0 ? (counts.scans24h - counts.scansFailed24h) / counts.scans24h : null,
    },
    series,
    failuresByClass: failuresByClass.map(row => ({ ...row, label: describeErrorClass(row.errorClass).label })),
    adapters: adapters.map(row => ({ ...row, label: adapterLabel(row.adapter) })),
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
