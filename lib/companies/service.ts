import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { errors } from '@/lib/api/errors';
import { client, db } from '@/lib/db/client';
import { careerPages, jobMatches, jobs, listCareerPages, listSubscriptions, lists, notificationQueue, users, type CareerPage } from '@/lib/db/schema';
import type { ListAccess } from '@/lib/lists/access';
import { visibleListIdsSql, visibleSourceIdsSql } from '@/lib/lists/access';
import { evaluateJob } from '@/lib/matching/engine';
import { rulesFromSubscription } from '@/lib/matching/rules';
import { adapterLabel, companyNameFromMatch, detectFromUrl } from '@/lib/monitoring/adapters';
import { describeErrorClass, toScanError } from '@/lib/monitoring/errors';
import { extractSource } from '@/lib/monitoring/extract';
import { createHttpClient } from '@/lib/monitoring/http';
import { normalizeJobs } from '@/lib/monitoring/normalize';
import { enqueueScan, resumeSourceIfAutoPaused } from '@/lib/monitoring/queue';
import { getLimits } from '@/lib/plans';
import { cleanText } from '@/lib/security/html';
import { rateLimit } from '@/lib/security/rateLimit';
import { UnsafeUrlError, assertPublicUrl, checkUrlSyntax } from '@/lib/security/ssrf';

/**
 * Companies (monitored career sources) as users see them.
 *
 * `career_pages` is a shared registry: a URL is stored once and scanned once
 * no matter how many watchlists include it. Users never edit a source
 * directly (that would change it for everyone); they add it to, remove it
 * from, or replace it within their own watchlists.
 */

export function displayCompanyName(name: string | null | undefined, url: string): string {
  if (name && name.trim()) return name.trim();
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

async function validatedUrl(raw: string): Promise<string> {
  const syntax = checkUrlSyntax(raw);
  if (!syntax.safe) throw errors.validation([{ field: 'url', message: syntax.reason }], syntax.reason);
  try {
    await assertPublicUrl(syntax.normalizedUrl!);
  } catch (error) {
    const message =
      error instanceof UnsafeUrlError && /resolve/i.test(error.message)
        ? 'We could not find that website. Check the address and try again.'
        : 'That address points to a private or internal network and cannot be monitored.';
    throw errors.validation([{ field: 'url', message }], message);
  }
  return syntax.normalizedUrl!;
}

/** Finds or creates the registry entry for a URL. */
export async function ensureSource(rawUrl: string, options: { companyName?: string | null; createdBy?: string | null } = {}): Promise<CareerPage> {
  const url = await validatedUrl(rawUrl);
  const match = detectFromUrl(url);
  const providedName = cleanText(options.companyName, 120) || null;

  const [row] = await db
    .insert(careerPages)
    .values({
      url,
      companyName: providedName ?? companyNameFromMatch(match),
      atsType: match?.adapterId ?? 'unknown',
      scrapeMethod: match ? 'api' : 'html',
      createdBy: options.createdBy ?? null,
      nextCheckAt: new Date(),
    })
    .onConflictDoUpdate({ target: careerPages.url, set: { url: sql`excluded.url` } })
    .returning();

  if (providedName && !row.companyName) {
    await db.update(careerPages).set({ companyName: providedName, updatedAt: new Date() }).where(eq(careerPages.id, row.id));
    row.companyName = providedName;
  }
  return row;
}

async function limitsForListOwner(ownerId: string) {
  const [owner] = await db.select({ plan: users.plan, role: users.role, quotaExempt: users.quotaExempt }).from(users).where(eq(users.id, ownerId));
  return getLimits(owner ?? { plan: 'free' });
}

async function companyCount(listId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(listCareerPages).where(eq(listCareerPages.listId, listId));
  return row?.n ?? 0;
}

/**
 * Records matches for a company's currently open jobs against every alert on
 * a list, so the "Matching" view is complete the moment a company is added.
 * Never sends notifications: these jobs are not new.
 */
export async function matchExistingJobs(listId: string, careerPageId: string): Promise<number> {
  const subscriptions = await db
    .select({
      userId: listSubscriptions.userId,
      positiveKeywords: listSubscriptions.positiveKeywords,
      negativeKeywords: listSubscriptions.negativeKeywords,
      matchRules: listSubscriptions.matchRules,
    })
    .from(listSubscriptions)
    .where(eq(listSubscriptions.listId, listId));
  if (subscriptions.length === 0) return 0;

  const open = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      department: jobs.department,
      location: jobs.location,
      description: jobs.description,
      workplaceType: jobs.workplaceType,
      employmentType: jobs.employmentType,
      seniority: jobs.seniority,
    })
    .from(jobs)
    .where(and(eq(jobs.careerPageId, careerPageId), eq(jobs.status, 'active'), isNull(jobs.hiddenAt)))
    .limit(5000);
  if (open.length === 0) return 0;

  const rows: (typeof jobMatches.$inferInsert)[] = [];
  for (const subscription of subscriptions) {
    const rules = rulesFromSubscription(subscription);
    for (const job of open) {
      const result = evaluateJob(job, rules);
      if (result.matched) rows.push({ userId: subscription.userId, jobId: job.id, listId, matchedTerms: result.terms, reasons: result.reasons });
    }
  }
  for (let index = 0; index < rows.length; index += 500) {
    await db.insert(jobMatches).values(rows.slice(index, index + 500)).onConflictDoNothing();
  }
  return rows.length;
}

async function forgetCompanyOnList(listId: string, careerPageId: string): Promise<void> {
  const companyJobs = db.select({ id: jobs.id }).from(jobs).where(eq(jobs.careerPageId, careerPageId));
  await db.delete(jobMatches).where(and(eq(jobMatches.listId, listId), inArray(jobMatches.jobId, companyJobs)));
  await db
    .update(notificationQueue)
    .set({ sentAt: new Date(), lastError: 'Company removed from the watchlist before delivery' })
    .where(and(eq(notificationQueue.listId, listId), isNull(notificationQueue.sentAt), inArray(notificationQueue.jobId, companyJobs)));
}

async function touchList(listId: string): Promise<void> {
  await db.update(lists).set({ updatedAt: new Date() }).where(eq(lists.id, listId));
}

function needsScan(source: CareerPage): boolean {
  if (source.status === 'paused') return false;
  if (!source.lastSuccessAt) return true;
  return Date.now() - source.lastSuccessAt.getTime() > 24 * 60 * 60 * 1000;
}

export interface AddCompanyInput {
  url: string;
  companyName?: string | null;
  category?: string | null;
  notes?: string | null;
}

export async function addCompanyToList(access: ListAccess, userId: string, input: AddCompanyInput) {
  if (!access.canEditCompanies) throw errors.forbidden('You cannot add companies to this watchlist.');
  const listId = access.list.id;

  const limits = await limitsForListOwner(access.list.userId);
  if ((await companyCount(listId)) >= limits.companiesPerList) {
    throw errors.limitReached(`This watchlist has reached its limit of ${limits.companiesPerList} companies.`, { limit: limits.companiesPerList });
  }

  const source = await ensureSource(input.url, { companyName: input.companyName, createdBy: userId });
  const [link] = await db
    .insert(listCareerPages)
    .values({
      listId,
      careerPageId: source.id,
      category: cleanText(input.category, 60) || null,
      notes: cleanText(input.notes, 500) || null,
      addedBy: userId,
    })
    .onConflictDoNothing()
    .returning({ id: listCareerPages.id });
  if (!link) throw errors.conflict(`${displayCompanyName(source.companyName, source.url)} is already in this watchlist.`);

  await touchList(listId);
  if (needsScan(source)) await enqueueScan(source.id, { trigger: 'onboarding', requestedBy: userId });
  await matchExistingJobs(listId, source.id);

  return {
    id: source.id,
    url: source.url,
    name: displayCompanyName(source.companyName, source.url),
    adapter: source.atsType,
    status: source.status,
    scanQueued: needsScan(source),
  };
}

export interface ImportResult {
  added: { id: string; name: string; url: string }[];
  skipped: { url: string; reason: string }[];
}

export async function importCompanies(access: ListAccess, userId: string, entries: AddCompanyInput[]): Promise<ImportResult> {
  const result: ImportResult = { added: [], skipped: [] };
  const seen = new Set<string>();
  for (const entry of entries.slice(0, 200)) {
    const key = entry.url.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try {
      const added = await addCompanyToList(access, userId, entry);
      result.added.push({ id: added.id, name: added.name, url: added.url });
    } catch (error) {
      const message = (error as Error).message || 'Could not be added.';
      result.skipped.push({ url: entry.url, reason: message });
      if ((error as { code?: string }).code === 'limit_reached') {
        for (const rest of entries.slice(entries.indexOf(entry) + 1)) result.skipped.push({ url: rest.url, reason: message });
        break;
      }
    }
  }
  return result;
}

export async function removeCompanyFromList(access: ListAccess, careerPageId: string): Promise<void> {
  if (!access.canEditCompanies) throw errors.forbidden('You cannot remove companies from this watchlist.');
  const removed = await db
    .delete(listCareerPages)
    .where(and(eq(listCareerPages.listId, access.list.id), eq(listCareerPages.careerPageId, careerPageId)))
    .returning({ id: listCareerPages.id });
  if (removed.length === 0) throw errors.notFound('Company');
  await forgetCompanyOnList(access.list.id, careerPageId);
  await touchList(access.list.id);
}

export interface UpdateListCompanyInput {
  isPaused?: boolean;
  category?: string | null;
  notes?: string | null;
  /** Replace the company's careers URL within this watchlist only. */
  url?: string;
}

export async function updateListCompany(access: ListAccess, userId: string, careerPageId: string, input: UpdateListCompanyInput) {
  if (!access.canEditCompanies) throw errors.forbidden('You cannot change companies in this watchlist.');
  const listId = access.list.id;
  const [link] = await db
    .select()
    .from(listCareerPages)
    .where(and(eq(listCareerPages.listId, listId), eq(listCareerPages.careerPageId, careerPageId)));
  if (!link) throw errors.notFound('Company');

  let targetId = careerPageId;
  if (input.url !== undefined) {
    const [current] = await db.select({ companyName: careerPages.companyName }).from(careerPages).where(eq(careerPages.id, careerPageId));
    const replacement = await ensureSource(input.url, { companyName: current?.companyName, createdBy: userId });
    if (replacement.id !== careerPageId) {
      const [clash] = await db
        .select({ id: listCareerPages.id })
        .from(listCareerPages)
        .where(and(eq(listCareerPages.listId, listId), eq(listCareerPages.careerPageId, replacement.id)));
      if (clash) throw errors.conflict('That careers page is already in this watchlist.');
      await db.update(listCareerPages).set({ careerPageId: replacement.id }).where(eq(listCareerPages.id, link.id));
      await forgetCompanyOnList(listId, careerPageId);
      if (needsScan(replacement)) await enqueueScan(replacement.id, { trigger: 'onboarding', requestedBy: userId });
      await matchExistingJobs(listId, replacement.id);
      targetId = replacement.id;
    }
  }

  const patch: Partial<typeof listCareerPages.$inferInsert> = {};
  if (input.isPaused !== undefined) patch.isPaused = input.isPaused;
  if (input.category !== undefined) patch.category = cleanText(input.category, 60) || null;
  if (input.notes !== undefined) patch.notes = cleanText(input.notes, 500) || null;
  if (Object.keys(patch).length > 0) {
    await db.update(listCareerPages).set(patch).where(eq(listCareerPages.id, link.id));
  }
  await touchList(listId);
  return { id: targetId };
}

/** Companies on one watchlist, with monitoring health. */
export async function listCompaniesOnList(listId: string) {
  const rows = await client<
    {
      id: string;
      url: string;
      companyName: string | null;
      logoUrl: string | null;
      websiteUrl: string | null;
      adapter: string | null;
      status: string;
      pausedReason: string | null;
      lastSuccessAt: Date | null;
      lastScrapedAt: Date | null;
      nextCheckAt: Date | null;
      consecutiveFailures: number;
      lastErrorClass: string | null;
      openJobs: number;
      newThisWeek: number;
      isPaused: boolean;
      category: string | null;
      notes: string | null;
      addedAt: Date;
    }[]
  >`
    SELECT cp.id, cp.url, cp.company_name AS "companyName", cp.logo_url AS "logoUrl", cp.website_url AS "websiteUrl",
      cp.ats_type AS adapter, cp.status, cp.paused_reason AS "pausedReason",
      cp.last_success_at AS "lastSuccessAt", cp.last_scraped_at AS "lastScrapedAt", cp.next_check_at AS "nextCheckAt",
      cp.consecutive_failures AS "consecutiveFailures", cp.last_error_class AS "lastErrorClass",
      cp.active_job_count AS "openJobs",
      (SELECT count(*) FROM jobs j
        WHERE j.career_page_id = cp.id AND j.status = 'active' AND j.hidden_at IS NULL
          AND j.first_seen_at > now() - interval '7 days')::int AS "newThisWeek",
      lcp.is_paused AS "isPaused", lcp.category, lcp.notes, lcp.added_at AS "addedAt"
    FROM list_career_pages lcp
    JOIN career_pages cp ON cp.id = lcp.career_page_id
    WHERE lcp.list_id = ${listId}
    ORDER BY lower(coalesce(cp.company_name, cp.url))
  `;
  return rows.map(row => ({ ...row, name: displayCompanyName(row.companyName, row.url), ...healthOf(row) }));
}

/**
 * Plain-language health for users (raw error text stays in the admin panel).
 * A source that has never been read successfully is never "Healthy": it is
 * either waiting for its first scan or having trouble with it.
 */
export function healthOf(source: { status: string; lastErrorClass: string | null; lastSuccessAt: Date | null; pausedReason?: string | null }) {
  const error = source.lastErrorClass ? describeErrorClass(source.lastErrorClass) : null;
  const neverSucceeded = !source.lastSuccessAt && source.status !== 'paused';
  const health = neverSucceeded ? (source.lastErrorClass ? (source.status === 'broken' ? 'broken' : 'degraded') : 'pending') : source.status;
  const labels: Record<string, string> = {
    pending: 'Waiting for first scan',
    active: 'Healthy',
    degraded: 'Having trouble',
    broken: 'Failing',
    paused: 'Paused',
  };
  return {
    health,
    healthLabel: labels[health] ?? 'Paused',
    issue: error ? { label: error.label, hint: error.hint } : source.status === 'paused' && source.pausedReason ? { label: 'Paused', hint: source.pausedReason } : null,
  };
}

/** Every company on the user's watchlists, with health and which lists include it. */
export async function companiesForUser(userId: string, filters: { q?: string; health?: string; listId?: string }) {
  const pattern = filters.q ? `%${filters.q.replace(/[\\%_]/g, c => `\\${c}`)}%` : null;
  const rows = await client<
    {
      id: string;
      url: string;
      companyName: string | null;
      logoUrl: string | null;
      adapter: string | null;
      status: string;
      pausedReason: string | null;
      lastSuccessAt: Date | null;
      nextCheckAt: Date | null;
      lastErrorClass: string | null;
      openJobs: number;
      newThisWeek: number;
      lists: { id: string; name: string; canEdit: boolean }[];
    }[]
  >`
    SELECT cp.id, cp.url, cp.company_name AS "companyName", cp.logo_url AS "logoUrl", cp.ats_type AS adapter, cp.status,
      cp.paused_reason AS "pausedReason", cp.last_success_at AS "lastSuccessAt", cp.next_check_at AS "nextCheckAt",
      cp.last_error_class AS "lastErrorClass", cp.active_job_count AS "openJobs",
      (SELECT count(*) FROM jobs j
        WHERE j.career_page_id = cp.id AND j.status = 'active' AND j.hidden_at IS NULL
          AND j.first_seen_at > now() - interval '7 days')::int AS "newThisWeek",
      (SELECT json_agg(json_build_object(
          'id', l.id, 'name', l.name,
          'canEdit', (l.user_id = ${userId} OR EXISTS (
            SELECT 1 FROM list_collaborators c WHERE c.list_id = l.id AND c.user_id = ${userId} AND c.status = 'accepted'))
        ) ORDER BY l.name)
        FROM list_career_pages lcp2 JOIN lists l ON l.id = lcp2.list_id
        WHERE lcp2.career_page_id = cp.id AND l.deleted_at IS NULL
          AND l.id IN (${visibleListIdsSql(userId)})
      ) AS lists
    FROM career_pages cp
    WHERE cp.id IN (${visibleSourceIdsSql(userId, filters.listId ?? null)})
      ${pattern ? client`AND (cp.company_name ILIKE ${pattern} OR cp.url ILIKE ${pattern})` : client``}
    ORDER BY lower(coalesce(cp.company_name, cp.url))
    LIMIT 2000
  `;

  const mapped = rows.map(row => ({ ...row, lists: row.lists ?? [], name: displayCompanyName(row.companyName, row.url), ...healthOf(row) }));
  if (!filters.health || filters.health === 'all') return mapped;
  if (filters.health === 'issues') return mapped.filter(row => row.health === 'degraded' || row.health === 'broken' || row.health === 'paused');
  return mapped.filter(row => row.health === filters.health);
}

/** A user may ask for a fresh scan of a company on a watchlist they can edit. */
export async function requestRescan(userId: string, careerPageId: string) {
  const [editable] = await client<{ ok: number }[]>`
    SELECT 1 AS ok FROM list_career_pages lcp
    JOIN lists l ON l.id = lcp.list_id AND l.deleted_at IS NULL
    WHERE lcp.career_page_id = ${careerPageId} AND (
      l.user_id = ${userId}
      OR EXISTS (SELECT 1 FROM list_collaborators c WHERE c.list_id = l.id AND c.user_id = ${userId} AND c.status = 'accepted')
    )
    LIMIT 1
  `;
  if (!editable) throw errors.notFound('Company');

  const perCompany = await rateLimit({ key: `rescan:${careerPageId}`, limit: 1, windowSeconds: 600 });
  if (!perCompany.allowed) {
    throw errors.tooManyRequests(perCompany.retryAfterSeconds, 'This company was checked a few minutes ago. Try again shortly.');
  }
  await resumeSourceIfAutoPaused(careerPageId);
  const result = await enqueueScan(careerPageId, { trigger: 'manual', force: true, requestedBy: userId });
  return { queued: true, alreadyQueued: result.alreadyQueued };
}

/**
 * Reads a careers URL without storing anything, so the user can see what
 * JobPingly will find before adding it. Bounded in requests and pages.
 */
export async function previewSource(rawUrl: string) {
  const url = await validatedUrl(rawUrl);
  const http = createHttpClient({ maxRequests: 20 });
  try {
    const extraction = await extractSource({ url, allowAi: false, respectRobots: true, force: true, http, maxPages: 2 });
    const jobs = normalizeJobs(extraction.jobs, url);
    return {
      ok: true as const,
      url,
      adapter: extraction.adapter,
      adapterLabel: adapterLabel(extraction.adapter),
      kind: extraction.kind,
      companyName: extraction.companyName,
      jobCount: jobs.length,
      partial: extraction.truncated,
      sample: jobs.slice(0, 6).map(job => ({ title: job.title, location: job.location })),
    };
  } catch (error) {
    const scanError = toScanError(error);
    const description = describeErrorClass(scanError.errorClass);
    return { ok: false as const, url, errorClass: scanError.errorClass, label: description.label, hint: description.hint, message: scanError.message };
  }
}

/** A company's profile for a user who has it on a watchlist (or on any public list). */
export async function companyDetailForUser(userId: string | null, careerPageId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(careerPageId)) return null;
  const [visible] = await client<{ ok: number }[]>`
    SELECT 1 AS ok
    WHERE ${userId ? client`${careerPageId}::uuid IN (${visibleSourceIdsSql(userId)})` : client`false`}
       OR EXISTS (
         SELECT 1 FROM list_career_pages x JOIN lists l ON l.id = x.list_id
         WHERE x.career_page_id = ${careerPageId} AND l.visibility = 'public' AND l.deleted_at IS NULL
       )
  `;
  if (!visible) return null;

  const [source] = await db.select().from(careerPages).where(eq(careerPages.id, careerPageId));
  if (!source) return null;

  const [stats] = await client<{ openJobs: number; newThisWeek: number; closedThisMonth: number; firstSeen: Date | null }[]>`
    SELECT
      count(*) FILTER (WHERE status = 'active' AND hidden_at IS NULL)::int AS "openJobs",
      count(*) FILTER (WHERE status = 'active' AND hidden_at IS NULL AND first_seen_at > now() - interval '7 days')::int AS "newThisWeek",
      count(*) FILTER (WHERE status = 'closed' AND closed_at > now() - interval '30 days')::int AS "closedThisMonth",
      min(first_seen_at) AS "firstSeen"
    FROM jobs WHERE career_page_id = ${careerPageId}
  `;

  const scans = await client<{ scrapedAt: Date; outcome: string | null; jobsFound: number | null; jobsAdded: number | null; jobsRemoved: number | null; errorClass: string | null }[]>`
    SELECT scraped_at AS "scrapedAt", outcome, jobs_found AS "jobsFound", jobs_added AS "jobsAdded",
      jobs_removed AS "jobsRemoved", error_class AS "errorClass"
    FROM scrape_logs WHERE career_page_id = ${careerPageId}
    ORDER BY scraped_at DESC LIMIT 10
  `;

  const listsWithCompany = userId
    ? await client<{ id: string; name: string; canEdit: boolean }[]>`
        SELECT l.id, l.name,
          (l.user_id = ${userId} OR EXISTS (
            SELECT 1 FROM list_collaborators c WHERE c.list_id = l.id AND c.user_id = ${userId} AND c.status = 'accepted'
          )) AS "canEdit"
        FROM list_career_pages x JOIN lists l ON l.id = x.list_id
        WHERE x.career_page_id = ${careerPageId} AND l.id IN (${visibleListIdsSql(userId)})
        ORDER BY l.name
      `
    : [];

  return {
    company: {
      id: source.id,
      name: displayCompanyName(source.companyName, source.url),
      url: source.url,
      websiteUrl: source.websiteUrl,
      logoUrl: source.logoUrl,
      industry: source.industry,
      location: source.hqLocation,
      adapter: source.atsType,
      adapterLabel: adapterLabel(source.atsType),
      lastSuccessAt: source.lastSuccessAt,
      lastScrapedAt: source.lastScrapedAt,
      nextCheckAt: source.nextCheckAt,
      ...healthOf(source),
    },
    stats,
    scans: scans.map(scan => ({ ...scan, errorLabel: scan.errorClass ? describeErrorClass(scan.errorClass).label : null })),
    lists: listsWithCompany,
  };
}
