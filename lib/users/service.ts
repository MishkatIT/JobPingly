import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { errors } from '@/lib/api/errors';
import { recordAudit } from '@/lib/audit';
import { verifyPassword } from '@/lib/auth/password';
import { invalidateSessionCache } from '@/lib/auth/session';
import { displayCompanyName, healthOf } from '@/lib/companies/service';
import { client, db } from '@/lib/db/client';
import { emailApprovals, listSubscriptions, lists, notifications, refreshTokens, userJobs, users } from '@/lib/db/schema';
import { visibleListIdsSql, visibleSourceIdsSql } from '@/lib/lists/access';
import { loadNotificationPolicy } from '@/lib/notifications/policy';
import { getLimits, normalizePlan, PLAN_INFO, serializeLimits } from '@/lib/plans';
import { cleanText } from '@/lib/security/html';
import { describeDigestSchedule, evaluateDigestSchedule, isValidTimezone } from '@/lib/utils/digestSchedule';
import { isSupportedFrequency, resolveEffectiveFrequency } from '@/lib/utils/frequency';
import { avatarUrlSql, normalizeAvatarInput } from './avatar';

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

const SOCIAL_KEYS = ['website', 'linkedin', 'github', 'twitter'] as const;

function cleanSocials(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {};
  const result: Record<string, string> = {};
  for (const key of SOCIAL_KEYS) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    try {
      const url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
      if (url.protocol === 'https:' || url.protocol === 'http:') result[key] = url.toString().slice(0, 200);
    } catch {
      // ignore invalid links
    }
  }
  return result;
}

export async function getProfile(userId: string) {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: avatarUrlSql,
      socials: users.socials,
      timezone: users.timezone,
      role: users.role,
      plan: users.plan,
      quotaExempt: users.quotaExempt,
      hasPassword: sql<boolean>`${users.passwordHash} IS NOT NULL`,
      hasGoogle: sql<boolean>`${users.googleId} IS NOT NULL`,
      onboardingCompletedAt: users.onboardingCompletedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!row) throw errors.notFound('Account');

  const limits = await getLimits(row);
  const plan = normalizePlan(row.plan);
  const [usage] = await client<{ lists: number }[]>`
    SELECT count(*)::int AS lists FROM lists WHERE user_id = ${userId} AND deleted_at IS NULL
  `;
  return {
    ...row,
    socials: (row.socials as Record<string, string> | null) ?? {},
    plan: { id: plan, label: PLAN_INFO[plan].label },
    limits: serializeLimits(limits),
    usage: { lists: usage?.lists ?? 0 },
  };
}

export async function updateProfile(userId: string, input: { name?: string; avatarUrl?: string | null; socials?: unknown; timezone?: string }) {
  const patch: Partial<typeof users.$inferInsert> = {};
  if (input.name !== undefined) {
    const name = cleanText(input.name, 80);
    if (!name) throw errors.validation([{ field: 'name', message: 'Enter your name.' }]);
    patch.name = name;
  }
  if (input.avatarUrl !== undefined) {
    const avatar = normalizeAvatarInput(input.avatarUrl);
    if (avatar === undefined) {
      throw errors.validation([{ field: 'avatarUrl', message: 'Use a PNG, JPEG, WebP or GIF image under 256 KB.' }]);
    }
    patch.avatarUrl = avatar;
  }
  if (input.socials !== undefined) patch.socials = cleanSocials(input.socials);
  if (input.timezone !== undefined) {
    if (!isValidTimezone(input.timezone)) throw errors.validation([{ field: 'timezone', message: 'Choose a valid time zone.' }]);
    patch.timezone = input.timezone;
  }
  if (Object.keys(patch).length > 0) {
    await db.update(users).set(patch).where(eq(users.id, userId));
    invalidateSessionCache(userId);
  }
  return getProfile(userId);
}

export async function completeOnboarding(userId: string) {
  await db.update(users).set({ onboardingCompletedAt: new Date() }).where(and(eq(users.id, userId), isNull(users.onboardingCompletedAt)));
  invalidateSessionCache(userId);
}

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------

export interface NotificationSettingsShape {
  inApp: boolean;
  jobChanges: boolean;
  sourceFailures: boolean;
}

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettingsShape = { inApp: true, jobChanges: true, sourceFailures: true };

export async function getNotificationPreferences(userId: string) {
  const [row] = await db
    .select({
      email: users.email,
      emailEnabled: users.emailNotificationsEnabled,
      frequency: users.notificationPreference,
      digestHour: users.digestHour,
      digestMinute: users.digestMinute,
      timezone: users.timezone,
      lastDigestSentAt: users.lastDigestSentAt,
      frequencyEnforcementExempt: users.frequencyEnforcementExempt,
      settings: users.notificationSettings,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!row) throw errors.notFound('Account');

  const [approval] = await db.select({ status: emailApprovals.status }).from(emailApprovals).where(eq(emailApprovals.email, row.email));
  const policy = await loadNotificationPolicy();
  const enforced = policy.globalPolicyEnforced && !row.frequencyEnforcementExempt;
  const effectiveFrequency = resolveEffectiveFrequency({ isEnforced: enforced, enforcedFrequency: policy.enforcedFrequencyValue, accountFrequency: row.frequency });
  const hour = enforced && policy.enforcedDigestHour !== null ? policy.enforcedDigestHour : row.digestHour;
  const minute = enforced && policy.enforcedDigestMinute !== null ? policy.enforcedDigestMinute : row.digestMinute;
  const schedule = evaluateDigestSchedule({ frequency: effectiveFrequency, now: new Date(), lastSentAt: row.lastDigestSentAt, timezone: row.timezone, hour, minute });

  return {
    emailEnabled: row.emailEnabled,
    frequency: row.frequency,
    digestHour: row.digestHour,
    digestMinute: row.digestMinute,
    timezone: row.timezone,
    settings: { ...DEFAULT_NOTIFICATION_SETTINGS, ...((row.settings as Partial<NotificationSettingsShape>) ?? {}) },
    approval: policy.requireApproval ? (approval?.status ?? 'pending') : 'approved',
    platformEmailEnabled: policy.notificationsEnabled,
    enforced: enforced ? { frequency: effectiveFrequency, description: describeDigestSchedule(effectiveFrequency, hour, minute, row.timezone) } : null,
    schedule: {
      description: describeDigestSchedule(effectiveFrequency, hour, minute, row.timezone),
      nextAt: schedule.nextDueAt,
      /** A slot has already passed and will be delivered by the next worker cycle. */
      dueNow: schedule.due,
      lastSentAt: row.lastDigestSentAt,
    },
  };
}

export async function updateNotificationPreferences(
  userId: string,
  input: {
    emailEnabled?: boolean;
    frequency?: string;
    digestHour?: number;
    digestMinute?: number;
    timezone?: string;
    settings?: Partial<NotificationSettingsShape>;
  },
) {
  const patch: Partial<typeof users.$inferInsert> = {};
  if (input.emailEnabled !== undefined) patch.emailNotificationsEnabled = input.emailEnabled;
  if (input.frequency !== undefined) {
    if (!isSupportedFrequency(input.frequency)) throw errors.validation([{ field: 'frequency', message: 'Choose a supported frequency.' }]);
    patch.notificationPreference = input.frequency;
  }
  if (input.digestHour !== undefined) patch.digestHour = Math.min(23, Math.max(0, Math.floor(input.digestHour)));
  if (input.digestMinute !== undefined) patch.digestMinute = Math.min(59, Math.max(0, Math.floor(input.digestMinute)));
  if (input.timezone !== undefined) {
    if (!isValidTimezone(input.timezone)) throw errors.validation([{ field: 'timezone', message: 'Choose a valid time zone.' }]);
    patch.timezone = input.timezone;
  }
  if (input.settings) {
    const [row] = await db.select({ settings: users.notificationSettings }).from(users).where(eq(users.id, userId));
    const current = { ...DEFAULT_NOTIFICATION_SETTINGS, ...((row?.settings as Partial<NotificationSettingsShape>) ?? {}) };
    for (const key of Object.keys(DEFAULT_NOTIFICATION_SETTINGS) as (keyof NotificationSettingsShape)[]) {
      if (typeof input.settings[key] === 'boolean') current[key] = input.settings[key] as boolean;
    }
    patch.notificationSettings = current;
  }
  if (Object.keys(patch).length > 0) {
    await db.update(users).set(patch).where(eq(users.id, userId));
    invalidateSessionCache(userId);
  }
  return getNotificationPreferences(userId);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function maskIp(ip: string | null): string | null {
  if (!ip) return null;
  if (ip.includes('.')) return ip.split('.').slice(0, 3).join('.') + '.x';
  return ip.split(':').slice(0, 3).join(':') + ':…';
}

export async function listSessions(userId: string, currentSessionId: string) {
  const rows = await db
    .select({
      id: refreshTokens.id,
      device: refreshTokens.deviceHint,
      ipAddress: refreshTokens.ipAddress,
      createdAt: refreshTokens.createdAt,
      lastUsedAt: refreshTokens.lastUsedAt,
      expiresAt: refreshTokens.expiresAt,
    })
    .from(refreshTokens)
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, new Date())))
    .orderBy(desc(sql`coalesce(${refreshTokens.lastUsedAt}, ${refreshTokens.createdAt})`))
    .limit(50);
  return rows.map(row => ({ ...row, ipAddress: maskIp(row.ipAddress), device: row.device ?? 'Unknown device', current: row.id === currentSessionId }));
}

// ---------------------------------------------------------------------------
// Export & deletion
// ---------------------------------------------------------------------------

export async function exportUserData(userId: string) {
  const profile = await getProfile(userId);
  const preferences = await getNotificationPreferences(userId);
  const ownedLists = await client`
    SELECT l.id, l.name, l.description, l.visibility, l.tags, l.created_at AS "createdAt",
      coalesce(json_agg(json_build_object('url', cp.url, 'company', cp.company_name, 'category', x.category, 'paused', x.is_paused))
        FILTER (WHERE cp.id IS NOT NULL), '[]') AS companies
    FROM lists l
    LEFT JOIN list_career_pages x ON x.list_id = l.id
    LEFT JOIN career_pages cp ON cp.id = x.career_page_id
    WHERE l.user_id = ${userId} AND l.deleted_at IS NULL
    GROUP BY l.id
    ORDER BY l.created_at
  `;
  const subscriptions = await db
    .select({ list: lists.name, alertsEnabled: listSubscriptions.alertsEnabled, frequency: listSubscriptions.digestFrequency, include: listSubscriptions.positiveKeywords, exclude: listSubscriptions.negativeKeywords, rules: listSubscriptions.matchRules })
    .from(listSubscriptions)
    .innerJoin(lists, eq(lists.id, listSubscriptions.listId))
    .where(eq(listSubscriptions.userId, userId));
  const tracker = await db.select({ status: userJobs.status, notes: userJobs.notes, appliedAt: userJobs.appliedAt, snapshot: userJobs.snapshot, createdAt: userJobs.createdAt }).from(userJobs).where(eq(userJobs.userId, userId));
  const inbox = await db.select({ type: notifications.type, title: notifications.title, body: notifications.body, createdAt: notifications.createdAt }).from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(500);

  return {
    exportedAt: new Date().toISOString(),
    profile: { email: profile.email, name: profile.name, timezone: profile.timezone, socials: profile.socials, plan: profile.plan.id, createdAt: profile.createdAt },
    notificationPreferences: { emailEnabled: preferences.emailEnabled, frequency: preferences.frequency, digestHour: preferences.digestHour, digestMinute: preferences.digestMinute, settings: preferences.settings },
    watchlists: ownedLists,
    alerts: subscriptions,
    tracker,
    notifications: inbox,
  };
}

/** Permanently deletes the account and everything it owns. */
export async function deleteAccount(userId: string, confirmation: { password?: string; email?: string }, req?: { headers: Headers }) {
  const [user] = await db.select({ email: users.email, role: users.role, passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId));
  if (!user) throw errors.notFound('Account');
  if (user.role === 'owner') throw errors.forbidden('The platform owner account cannot be deleted. Transfer ownership first.');

  if (user.passwordHash) {
    if (!confirmation.password || !(await verifyPassword(confirmation.password, user.passwordHash))) {
      throw errors.validation([{ field: 'password', message: 'Your password is not correct.' }]);
    }
  } else if ((confirmation.email ?? '').trim().toLowerCase() !== user.email) {
    throw errors.validation([{ field: 'email', message: 'Type your email address to confirm.' }]);
  }

  await recordAudit({ action: 'user.delete', actor: { id: userId, email: user.email, role: user.role }, targetType: 'user', targetId: userId, metadata: { self: true }, req });
  await db.delete(emailApprovals).where(eq(emailApprovals.email, user.email));
  await db.delete(users).where(eq(users.id, userId));
  invalidateSessionCache(userId);
}

// ---------------------------------------------------------------------------
// Dashboard overview
// ---------------------------------------------------------------------------

export async function dashboardOverview(userId: string) {
  const [counts] = await client<
    {
      watchlists: number;
      companies: number;
      openJobs: number;
      newThisWeek: number;
      matchingThisWeek: number;
      saved: number;
      applied: number;
      interviewing: number;
      companiesWithIssues: number;
      pendingFirstScan: number;
      lastScanAt: Date | null;
      nextScanAt: Date | null;
      unread: number;
    }[]
  >`
    WITH sources AS (${visibleSourceIdsSql(userId)})
    SELECT
      (SELECT count(*) FROM (${visibleListIdsSql(userId)}) v)::int AS watchlists,
      (SELECT count(*) FROM sources)::int AS companies,
      (SELECT coalesce(sum(cp.active_job_count), 0) FROM career_pages cp WHERE cp.id IN (SELECT career_page_id FROM sources))::int AS "openJobs",
      (SELECT count(*) FROM jobs j WHERE j.career_page_id IN (SELECT career_page_id FROM sources)
        AND j.status = 'active' AND j.hidden_at IS NULL AND j.first_seen_at > now() - interval '7 days')::int AS "newThisWeek",
      (SELECT count(DISTINCT m.job_id) FROM job_matches m JOIN jobs j ON j.id = m.job_id
        WHERE m.user_id = ${userId} AND j.status = 'active' AND j.hidden_at IS NULL
          AND j.first_seen_at > now() - interval '7 days'
          AND j.career_page_id IN (SELECT career_page_id FROM sources))::int AS "matchingThisWeek",
      (SELECT count(*) FROM user_jobs u WHERE u.user_id = ${userId} AND u.status = 'saved')::int AS saved,
      (SELECT count(*) FROM user_jobs u WHERE u.user_id = ${userId} AND u.status = 'applied')::int AS applied,
      (SELECT count(*) FROM user_jobs u WHERE u.user_id = ${userId} AND u.status = 'interviewing')::int AS interviewing,
      (SELECT count(*) FROM career_pages cp WHERE cp.id IN (SELECT career_page_id FROM sources)
        AND (cp.status IN ('degraded', 'broken', 'paused')
          OR (cp.last_success_at IS NULL AND cp.last_error_class IS NOT NULL)))::int AS "companiesWithIssues",
      (SELECT count(*) FROM career_pages cp WHERE cp.id IN (SELECT career_page_id FROM sources)
        AND cp.last_success_at IS NULL AND cp.last_error_class IS NULL AND cp.status <> 'paused')::int AS "pendingFirstScan",
      (SELECT max(cp.last_success_at) FROM career_pages cp WHERE cp.id IN (SELECT career_page_id FROM sources)) AS "lastScanAt",
      (SELECT min(cp.next_check_at) FROM career_pages cp WHERE cp.id IN (SELECT career_page_id FROM sources)
        AND cp.status <> 'paused') AS "nextScanAt",
      (SELECT count(*) FROM notifications n WHERE n.user_id = ${userId} AND n.read_at IS NULL)::int AS unread
  `;

  const recentMatches = await client<
    { id: string; title: string; location: string | null; firstSeenAt: Date; companyName: string | null; companyUrl: string; workplaceType: string | null; terms: string[] | null }[]
  >`
    SELECT j.id, j.title, j.location, j.first_seen_at AS "firstSeenAt", j.workplace_type AS "workplaceType",
      cp.company_name AS "companyName", cp.url AS "companyUrl",
      (SELECT array_agg(DISTINCT t) FROM job_matches m2, unnest(m2.matched_terms) t
        WHERE m2.user_id = ${userId} AND m2.job_id = j.id AND t <> '*') AS terms
    FROM jobs j
    JOIN career_pages cp ON cp.id = j.career_page_id
    WHERE j.status = 'active' AND j.hidden_at IS NULL
      AND j.career_page_id IN (${visibleSourceIdsSql(userId)})
      AND EXISTS (SELECT 1 FROM job_matches m WHERE m.user_id = ${userId} AND m.job_id = j.id)
      AND NOT EXISTS (SELECT 1 FROM user_jobs u WHERE u.user_id = ${userId} AND u.job_id = j.id AND u.status = 'dismissed')
    ORDER BY j.first_seen_at DESC
    LIMIT 8
  `;

  const issues = await client<{ id: string; url: string; companyName: string | null; status: string; lastErrorClass: string | null; lastSuccessAt: Date | null }[]>`
    SELECT cp.id, cp.url, cp.company_name AS "companyName", cp.status, cp.last_error_class AS "lastErrorClass", cp.last_success_at AS "lastSuccessAt"
    FROM career_pages cp
    WHERE cp.id IN (${visibleSourceIdsSql(userId)})
      AND (cp.status IN ('degraded', 'broken', 'paused') OR (cp.last_success_at IS NULL AND cp.last_error_class IS NOT NULL))
    ORDER BY cp.consecutive_failures DESC
    LIMIT 5
  `;

  const reminders = await db
    .select({ id: userJobs.id, reminderAt: userJobs.reminderAt, snapshot: userJobs.snapshot, status: userJobs.status })
    .from(userJobs)
    .where(and(eq(userJobs.userId, userId), isNull(userJobs.reminderSentAt), sql`${userJobs.reminderAt} IS NOT NULL`))
    .orderBy(userJobs.reminderAt)
    .limit(5);

  const preferences = await getNotificationPreferences(userId);

  return {
    counts,
    recentMatches: recentMatches.map(job => ({
      id: job.id,
      title: job.title,
      location: job.location,
      workplaceType: job.workplaceType,
      firstSeenAt: job.firstSeenAt,
      terms: job.terms ?? [],
      companyName: displayCompanyName(job.companyName, job.companyUrl),
    })),
    issues: issues.map(issue => ({ ...issue, name: displayCompanyName(issue.companyName, issue.url), ...healthOf(issue) })),
    reminders: reminders.map(reminder => ({
      id: reminder.id,
      reminderAt: reminder.reminderAt,
      status: reminder.status,
      title: (reminder.snapshot as { title?: string })?.title ?? 'Saved job',
      companyName: (reminder.snapshot as { companyName?: string })?.companyName ?? '',
    })),
    notifications: {
      emailEnabled: preferences.emailEnabled,
      approval: preferences.approval,
      schedule: preferences.schedule.description,
      nextAt: preferences.schedule.nextAt,
      dueNow: preferences.schedule.dueNow,
      platformEmailEnabled: preferences.platformEmailEnabled,
    },
  };
}
