import crypto from 'node:crypto';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { errors } from '@/lib/api/errors';
import { client, db } from '@/lib/db/client';
import { listCollaborators, listContributions, listSubscriptions, lists, notificationQueue, users } from '@/lib/db/schema';
import { evaluateJob } from '@/lib/matching/engine';
import { describeRules, flattenForLegacyColumns, matchRulesSchema, rulesFromSubscription, type MatchRules } from '@/lib/matching/rules';
import { deleteMatchesForList, recomputeMatchesForSubscription } from '@/lib/monitoring/matching';
import { getLimits } from '@/lib/plans';
import { cleanText } from '@/lib/security/html';
import { INHERIT_FREQUENCY, isSupportedFrequency } from '@/lib/utils/frequency';
import { displayCompanyName } from '@/lib/companies/service';
import { visibleListIdsSql, type ListAccess } from './access';

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return base || 'watchlist';
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = `${base}-${crypto.randomBytes(3).toString('hex')}`;
    const [taken] = await db.select({ id: lists.id }).from(lists).where(eq(lists.slug, slug));
    if (!taken) return slug;
  }
  return `${base}-${crypto.randomBytes(6).toString('hex')}`;
}

export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const result: string[] = [];
  for (const tag of tags) {
    const clean = cleanText(tag, 30).toLowerCase();
    if (clean && !result.includes(clean)) result.push(clean);
    if (result.length >= 8) break;
  }
  return result;
}

/** follower_count caches the number of followers, not counting the owner. */
export async function refreshFollowerCount(listId: string): Promise<number> {
  const [row] = await client<{ n: number }[]>`
    UPDATE lists l SET follower_count = (
      SELECT count(*)::int FROM list_subscriptions s WHERE s.list_id = l.id AND s.user_id <> l.user_id
    )
    WHERE l.id = ${listId}
    RETURNING follower_count AS n
  `;
  return row?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface WatchlistSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: string;
  tags: string[];
  pinned: boolean;
  followers: number;
  relation: 'owner' | 'editor' | 'moderator' | 'follower';
  owner: { id: string; name: string | null };
  companies: number;
  openJobs: number;
  newThisWeek: number;
  issues: number;
  alerts: { enabled: boolean; frequency: string; summary: string } | null;
  updatedAt: Date;
}

export async function watchlistsForUser(userId: string): Promise<WatchlistSummary[]> {
  const rows = await client<
    {
      id: string;
      name: string;
      slug: string;
      description: string | null;
      visibility: string;
      tags: string[];
      pinned: boolean;
      followers: number;
      ownerId: string;
      ownerName: string | null;
      collabRole: string | null;
      companies: number;
      openJobs: number;
      newThisWeek: number;
      issues: number;
      alertsEnabled: boolean | null;
      digestFrequency: string | null;
      positiveKeywords: string[] | null;
      negativeKeywords: string[] | null;
      matchRules: unknown;
      hasSubscription: boolean;
      updatedAt: Date;
    }[]
  >`
    SELECT l.id, l.name, l.slug, l.description, l.visibility, l.tags, l.pinned, l.follower_count AS followers,
      l.user_id AS "ownerId", u.name AS "ownerName", c.role AS "collabRole",
      (SELECT count(*) FROM list_career_pages x WHERE x.list_id = l.id)::int AS companies,
      (SELECT coalesce(sum(cp.active_job_count), 0) FROM list_career_pages x
        JOIN career_pages cp ON cp.id = x.career_page_id
        WHERE x.list_id = l.id AND x.is_paused = false)::int AS "openJobs",
      (SELECT count(*) FROM list_career_pages x
        JOIN jobs j ON j.career_page_id = x.career_page_id
        WHERE x.list_id = l.id AND x.is_paused = false AND j.status = 'active' AND j.hidden_at IS NULL
          AND j.first_seen_at > now() - interval '7 days')::int AS "newThisWeek",
      (SELECT count(*) FROM list_career_pages x
        JOIN career_pages cp ON cp.id = x.career_page_id
        WHERE x.list_id = l.id AND cp.status IN ('broken', 'paused', 'degraded'))::int AS issues,
      s.alerts_enabled AS "alertsEnabled", s.digest_frequency AS "digestFrequency",
      s.positive_keywords AS "positiveKeywords", s.negative_keywords AS "negativeKeywords", s.match_rules AS "matchRules",
      (s.id IS NOT NULL) AS "hasSubscription", l.updated_at AS "updatedAt"
    FROM lists l
    JOIN users u ON u.id = l.user_id
    LEFT JOIN list_collaborators c ON c.list_id = l.id AND c.user_id = ${userId} AND c.status = 'accepted'
    LEFT JOIN list_subscriptions s ON s.list_id = l.id AND s.user_id = ${userId}
    WHERE l.id IN (${visibleListIdsSql(userId)})
    ORDER BY l.pinned DESC, l.updated_at DESC
  `;

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    visibility: row.visibility,
    tags: row.tags ?? [],
    pinned: row.pinned,
    followers: row.followers,
    relation: row.ownerId === userId ? 'owner' : row.collabRole === 'moderator' ? 'moderator' : row.collabRole ? 'editor' : 'follower',
    owner: { id: row.ownerId, name: row.ownerName },
    companies: row.companies,
    openJobs: row.openJobs,
    newThisWeek: row.newThisWeek,
    issues: row.issues,
    alerts: row.hasSubscription
      ? {
          enabled: Boolean(row.alertsEnabled),
          frequency: row.digestFrequency ?? INHERIT_FREQUENCY,
          summary: describeRules(rulesFromSubscription(row)),
        }
      : null,
    updatedAt: row.updatedAt,
  }));
}

export async function listDetail(access: ListAccess, userId: string | null) {
  const { list } = access;
  const [owner] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, list.userId));

  const [stats] = await client<{ companies: number; openJobs: number; newThisWeek: number; issues: number }[]>`
    SELECT
      (SELECT count(*) FROM list_career_pages x WHERE x.list_id = ${list.id})::int AS companies,
      (SELECT coalesce(sum(cp.active_job_count), 0) FROM list_career_pages x JOIN career_pages cp ON cp.id = x.career_page_id
        WHERE x.list_id = ${list.id} AND x.is_paused = false)::int AS "openJobs",
      (SELECT count(*) FROM list_career_pages x JOIN jobs j ON j.career_page_id = x.career_page_id
        WHERE x.list_id = ${list.id} AND x.is_paused = false AND j.status = 'active' AND j.hidden_at IS NULL
          AND j.first_seen_at > now() - interval '7 days')::int AS "newThisWeek",
      (SELECT count(*) FROM list_career_pages x JOIN career_pages cp ON cp.id = x.career_page_id
        WHERE x.list_id = ${list.id} AND cp.status IN ('broken', 'paused', 'degraded'))::int AS issues
  `;

  let subscription = null;
  if (userId) {
    const [row] = await db.select().from(listSubscriptions).where(and(eq(listSubscriptions.listId, list.id), eq(listSubscriptions.userId, userId)));
    if (row) {
      const rules = rulesFromSubscription(row);
      subscription = { alertsEnabled: row.alertsEnabled, digestFrequency: row.digestFrequency, rules, summary: describeRules(rules) };
    }
  }

  let pendingSuggestions = 0;
  if (access.canReviewSuggestions) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(listContributions)
      .where(and(eq(listContributions.listId, list.id), eq(listContributions.status, 'pending')));
    pendingSuggestions = row?.n ?? 0;
  }

  const limits = await getLimits((await db.select({ plan: users.plan, role: users.role, quotaExempt: users.quotaExempt }).from(users).where(eq(users.id, list.userId)))[0] ?? { plan: 'free' });

  return {
    list: {
      id: list.id,
      name: list.name,
      slug: list.slug,
      description: list.description,
      visibility: list.visibility,
      tags: list.tags ?? [],
      pinned: list.pinned,
      followers: list.followerCount,
      featured: Boolean(list.featuredAt),
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
      owner: owner ?? { id: list.userId, name: null },
    },
    access: {
      role: access.role,
      isFollowing: access.isFollowing,
      canEditCompanies: access.canEditCompanies,
      canEditDetails: access.canEditDetails,
      canChangeVisibility: access.canChangeVisibility,
      canManageMembers: access.canManageMembers,
      canReviewSuggestions: access.canReviewSuggestions,
      canDelete: access.canDelete,
    },
    subscription,
    stats: { ...stats, pendingSuggestions },
    limits: { companiesPerList: Number.isFinite(limits.companiesPerList) ? limits.companiesPerList : null },
  };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export interface ListInput {
  name: string;
  description?: string | null;
  visibility?: 'private' | 'public';
  tags?: string[];
}

export async function createList(user: { id: string; plan: string; role: string; quotaExempt?: boolean }, input: ListInput) {
  const limits = await getLimits(user);
  const [owned] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lists)
    .where(and(eq(lists.userId, user.id), isNull(lists.deletedAt)));
  if ((owned?.n ?? 0) >= limits.lists) {
    throw errors.limitReached(`You have reached your limit of ${limits.lists} watchlists. Delete one or ask us about higher limits.`, { limit: limits.lists });
  }

  const name = cleanText(input.name, 80);
  if (!name) throw errors.validation([{ field: 'name', message: 'Give the watchlist a name.' }]);

  const [list] = await db
    .insert(lists)
    .values({
      userId: user.id,
      name,
      slug: await uniqueSlug(name),
      description: cleanText(input.description, 300) || null,
      visibility: input.visibility === 'public' ? 'public' : 'private',
      tags: normalizeTags(input.tags),
    })
    .returning();

  // The owner's alert settings for the list live on a subscription row.
  await db.insert(listSubscriptions).values({ userId: user.id, listId: list.id, alertsEnabled: true }).onConflictDoNothing();
  return list;
}

export interface ListPatch {
  name?: string;
  description?: string | null;
  visibility?: 'private' | 'public';
  tags?: string[];
  pinned?: boolean;
}

export async function updateList(access: ListAccess, patch: ListPatch) {
  const changes: Partial<typeof lists.$inferInsert> = {};
  if (patch.name !== undefined || patch.description !== undefined || patch.tags !== undefined) {
    if (!access.canEditDetails) throw errors.forbidden('You cannot edit this watchlist.');
    if (patch.name !== undefined) {
      const name = cleanText(patch.name, 80);
      if (!name) throw errors.validation([{ field: 'name', message: 'Give the watchlist a name.' }]);
      changes.name = name;
    }
    if (patch.description !== undefined) changes.description = cleanText(patch.description, 300) || null;
    if (patch.tags !== undefined) changes.tags = normalizeTags(patch.tags);
  }
  if (patch.visibility !== undefined) {
    if (!access.canChangeVisibility) throw errors.forbidden('Only the owner can change who can see this watchlist.');
    changes.visibility = patch.visibility;
  }
  if (patch.pinned !== undefined) {
    if (access.role !== 'owner') throw errors.forbidden('Only the owner can pin this watchlist.');
    changes.pinned = patch.pinned;
  }
  if (Object.keys(changes).length === 0) return access.list;

  const [updated] = await db
    .update(lists)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(lists.id, access.list.id))
    .returning();
  return updated;
}

/** Moves a list to the trash. Staff can restore it from the admin panel. */
export async function deleteList(access: ListAccess) {
  if (!access.canDelete) throw errors.forbidden('Only the owner can delete this watchlist.');
  await db.update(lists).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(lists.id, access.list.id));
  await deleteMatchesForList(access.list.id);
  await db
    .update(notificationQueue)
    .set({ sentAt: new Date(), lastError: 'Watchlist deleted before delivery' })
    .where(and(eq(notificationQueue.listId, access.list.id), isNull(notificationQueue.sentAt)));
}

/** Copies a list's companies into a new private list owned by the user. */
export async function duplicateList(
  user: { id: string; plan: string; role: string; quotaExempt?: boolean },
  source: ListAccess,
  name?: string,
) {
  const created = await createList(user, {
    name: name || `${source.list.name} (copy)`,
    description: source.list.description,
    visibility: 'private',
    tags: source.list.tags ?? [],
  });

  const limits = await getLimits(user);
  const max = Number.isFinite(limits.companiesPerList) ? limits.companiesPerList : 100_000;
  await client`
    INSERT INTO list_career_pages (list_id, career_page_id, category, notes, added_by)
    SELECT ${created.id}, x.career_page_id, x.category, NULL, ${user.id}
    FROM list_career_pages x
    WHERE x.list_id = ${source.list.id}
    ORDER BY x.added_at
    LIMIT ${max}
    ON CONFLICT DO NOTHING
  `;
  await db.update(lists).set({ parentListId: source.list.id, isCanonical: false }).where(eq(lists.id, created.id));

  // Carry over the user's own alert rules from the original, if they had any.
  const [ownRules] = await db
    .select()
    .from(listSubscriptions)
    .where(and(eq(listSubscriptions.listId, source.list.id), eq(listSubscriptions.userId, user.id)));
  if (ownRules) {
    await db
      .update(listSubscriptions)
      .set({
        positiveKeywords: ownRules.positiveKeywords,
        negativeKeywords: ownRules.negativeKeywords,
        matchRules: ownRules.matchRules,
        digestFrequency: ownRules.digestFrequency,
      })
      .where(and(eq(listSubscriptions.listId, created.id), eq(listSubscriptions.userId, user.id)));
  }
  await recomputeMatchesForSubscription(user.id, created.id);
  return created;
}

export async function followList(userId: string, access: ListAccess) {
  if (access.list.userId === userId) throw errors.conflict('You own this watchlist, so you already get its alerts.');
  await db.insert(listSubscriptions).values({ userId, listId: access.list.id, alertsEnabled: true }).onConflictDoNothing();
  const followers = await refreshFollowerCount(access.list.id);
  await recomputeMatchesForSubscription(userId, access.list.id);
  return { following: true, followers };
}

/** Works even when the list has since been made private or deleted. */
export async function unfollowList(userId: string, listId: string) {
  const [list] = await db.select({ userId: lists.userId }).from(lists).where(eq(lists.id, listId));
  if (!list) throw errors.notFound('Watchlist');
  if (list.userId === userId) throw errors.conflict('You own this watchlist. Turn its alerts off instead of unfollowing.');

  const removed = await db
    .delete(listSubscriptions)
    .where(and(eq(listSubscriptions.listId, listId), eq(listSubscriptions.userId, userId)))
    .returning({ id: listSubscriptions.id });
  if (removed.length === 0) return { following: false, followers: await refreshFollowerCount(listId) };

  await deleteMatchesForList(listId, [userId]);
  await db
    .update(notificationQueue)
    .set({ sentAt: new Date(), lastError: 'Unfollowed before delivery' })
    .where(and(eq(notificationQueue.listId, listId), eq(notificationQueue.userId, userId), isNull(notificationQueue.sentAt)));
  return { following: false, followers: await refreshFollowerCount(listId) };
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export interface AlertSettingsInput {
  alertsEnabled?: boolean;
  digestFrequency?: string;
  rules?: unknown;
}

export async function updateAlertSettings(
  user: { id: string; plan: string; role: string; quotaExempt?: boolean },
  access: ListAccess,
  input: AlertSettingsInput,
) {
  const [existing] = await db
    .select()
    .from(listSubscriptions)
    .where(and(eq(listSubscriptions.listId, access.list.id), eq(listSubscriptions.userId, user.id)));
  if (!existing && access.role === 'viewer') throw errors.conflict('Follow this watchlist to set up alerts for it.');

  const patch: Partial<typeof listSubscriptions.$inferInsert> = {};
  if (input.alertsEnabled !== undefined) patch.alertsEnabled = input.alertsEnabled;
  if (input.digestFrequency !== undefined) {
    if (!isSupportedFrequency(input.digestFrequency, { allowInherit: true })) {
      throw errors.validation([{ field: 'digestFrequency', message: 'Choose a supported frequency.' }]);
    }
    patch.digestFrequency = input.digestFrequency;
  }

  let rules: MatchRules | null = null;
  if (input.rules !== undefined) {
    const limits = await getLimits(user);
    const parsed = matchRulesSchema(Number.isFinite(limits.keywordsPerAlert) ? limits.keywordsPerAlert : 500).safeParse(input.rules);
    if (!parsed.success) {
      throw errors.validation(
        parsed.error.issues.slice(0, 10).map(issue => ({ field: `rules.${issue.path.join('.')}`, message: issue.message })),
        `Alerts can have at most ${limits.keywordsPerAlert} keywords per group.`,
      );
    }
    rules = parsed.data;
    patch.matchRules = rules;
    Object.assign(patch, flattenForLegacyColumns(rules));
  }

  if (existing) {
    if (Object.keys(patch).length > 0) {
      await db.update(listSubscriptions).set(patch).where(eq(listSubscriptions.id, existing.id));
    }
  } else {
    await db.insert(listSubscriptions).values({ userId: user.id, listId: access.list.id, alertsEnabled: true, ...patch });
  }

  const matches = input.rules !== undefined || !existing ? await recomputeMatchesForSubscription(user.id, access.list.id) : null;
  const [saved] = await db
    .select()
    .from(listSubscriptions)
    .where(and(eq(listSubscriptions.listId, access.list.id), eq(listSubscriptions.userId, user.id)));
  const effective = rulesFromSubscription(saved);
  return {
    alertsEnabled: saved.alertsEnabled,
    digestFrequency: saved.digestFrequency,
    rules: effective,
    summary: describeRules(effective),
    matchingOpenJobs: matches,
  };
}

/** Evaluates draft rules against a list's open jobs without saving anything. */
export async function previewAlertRules(listId: string, rulesInput: unknown) {
  const parsed = matchRulesSchema(500).safeParse(rulesInput);
  if (!parsed.success) throw errors.validation(parsed.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })));
  const rules = parsed.data;

  const open = await client<
    {
      id: string;
      title: string;
      department: string | null;
      location: string | null;
      workplaceType: string | null;
      employmentType: string | null;
      seniority: string | null;
      description: string | null;
      companyName: string | null;
      companyUrl: string;
    }[]
  >`
    SELECT j.id, j.title, j.department, j.location, j.workplace_type AS "workplaceType",
      j.employment_type AS "employmentType", j.seniority,
      ${rules.fields.includes('description') ? client`j.description` : client`NULL::text`} AS description,
      cp.company_name AS "companyName", cp.url AS "companyUrl"
    FROM list_career_pages x
    JOIN jobs j ON j.career_page_id = x.career_page_id
    JOIN career_pages cp ON cp.id = x.career_page_id
    WHERE x.list_id = ${listId} AND x.is_paused = false AND j.status = 'active' AND j.hidden_at IS NULL
    ORDER BY j.first_seen_at DESC
    LIMIT 20000
  `;

  let matching = 0;
  const sample: { id: string; title: string; company: string; location: string | null; reasons: unknown }[] = [];
  for (const job of open) {
    const result = evaluateJob(job, rules);
    if (!result.matched) continue;
    matching++;
    if (sample.length < 8) {
      sample.push({ id: job.id, title: job.title, company: displayCompanyName(job.companyName, job.companyUrl), location: job.location, reasons: result.reasons });
    }
  }
  return { total: open.length, matching, sample, summary: describeRules(rules) };
}

// ---------------------------------------------------------------------------
// Collaborators
// ---------------------------------------------------------------------------

export async function listMembers(access: ListAccess) {
  const includeEmail = access.canManageMembers;
  const rows = await db
    .select({
      id: listCollaborators.id,
      userId: listCollaborators.userId,
      role: listCollaborators.role,
      status: listCollaborators.status,
      createdAt: listCollaborators.createdAt,
      name: users.name,
      email: users.email,
    })
    .from(listCollaborators)
    .innerJoin(users, eq(users.id, listCollaborators.userId))
    .where(and(eq(listCollaborators.listId, access.list.id), ne(listCollaborators.status, 'declined')));
  return rows.map(row => ({ ...row, email: includeEmail ? row.email : null }));
}

export async function listSuggestions(access: ListAccess) {
  if (!access.canReviewSuggestions) throw errors.forbidden();
  return db
    .select({
      id: listContributions.id,
      url: listContributions.url,
      companyName: listContributions.companyName,
      status: listContributions.status,
      createdAt: listContributions.createdAt,
      contributor: users.name,
    })
    .from(listContributions)
    .leftJoin(users, eq(users.id, listContributions.contributorUserId))
    .where(and(eq(listContributions.listId, access.list.id), eq(listContributions.status, 'pending')))
    .orderBy(listContributions.createdAt);
}

