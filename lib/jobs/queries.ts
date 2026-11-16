import { and, desc, eq } from 'drizzle-orm';
import { client, db } from '@/lib/db/client';
import { careerPages, jobEvents, jobMatches, jobs, lists, userJobs } from '@/lib/db/schema';
import { displayCompanyName } from '@/lib/companies/service';
import { visibleSourceIdsSql } from '@/lib/lists/access';
import { explainMatch, type MatchReason } from '@/lib/matching/engine';

/**
 * Job queries for signed-in users. A user sees the jobs of every company on
 * a watchlist they own, help maintain, or follow (public lists only).
 */

export const FEED_VIEWS = ['matching', 'new', 'all', 'closed', 'dismissed'] as const;
export type FeedView = (typeof FEED_VIEWS)[number];
export const FEED_SORTS = ['newest', 'posted', 'company', 'title'] as const;
export type FeedSort = (typeof FEED_SORTS)[number];

export interface FeedFilters {
  view: FeedView;
  q?: string;
  listId?: string;
  companyId?: string;
  workplace?: string[];
  employment?: string[];
  seniority?: string[];
  postedWithinDays?: number;
  sort: FeedSort;
  page: number;
  pageSize: number;
}

export interface FeedJob {
  id: string;
  title: string;
  url: string | null;
  location: string | null;
  department: string | null;
  workplaceType: string | null;
  employmentType: string | null;
  seniority: string | null;
  salaryText: string | null;
  postedAt: Date | null;
  deadlineAt: Date | null;
  firstSeenAt: Date;
  status: string;
  closedAt: Date | null;
  company: { id: string; name: string; url: string; logoUrl: string | null };
  userStatus: string | null;
  matched: boolean;
  matchedTerms: string[];
}

export async function feedForUser(userId: string, filters: FeedFilters): Promise<{ items: FeedJob[]; total: number }> {
  const pattern = filters.q ? `%${filters.q.replace(/[\\%_]/g, char => `\\${char}`)}%` : null;
  const offset = (filters.page - 1) * filters.pageSize;

  const viewCondition = {
    matching: client`AND j.status = 'active' AND EXISTS (SELECT 1 FROM job_matches m WHERE m.user_id = ${userId} AND m.job_id = j.id) AND (uj.status IS NULL OR uj.status <> 'dismissed')`,
    new: client`AND j.status = 'active' AND j.first_seen_at > now() - interval '7 days' AND (uj.status IS NULL OR uj.status <> 'dismissed')`,
    all: client`AND j.status = 'active' AND (uj.status IS NULL OR uj.status <> 'dismissed')`,
    closed: client`AND j.status = 'closed' AND j.closed_at > now() - interval '30 days'`,
    dismissed: client`AND uj.status = 'dismissed'`,
  }[filters.view];

  const order = {
    newest: client`j.first_seen_at DESC, j.id`,
    posted: client`j.posted_at DESC NULLS LAST, j.first_seen_at DESC, j.id`,
    company: client`lower(coalesce(cp.company_name, cp.url)), j.title, j.id`,
    title: client`lower(j.title), j.id`,
  }[filters.sort];

  const rows = await client<
    (Omit<FeedJob, 'company' | 'matchedTerms'> & {
      companyId: string;
      companyName: string | null;
      companyUrl: string;
      companyLogo: string | null;
      matchedTerms: string[] | null;
      total: number;
    })[]
  >`
    SELECT j.id, j.title, j.url, j.location, j.department, j.workplace_type AS "workplaceType",
      j.employment_type AS "employmentType", j.seniority, j.salary_text AS "salaryText",
      j.posted_at AS "postedAt", j.deadline_at AS "deadlineAt", j.first_seen_at AS "firstSeenAt",
      j.status, j.closed_at AS "closedAt",
      cp.id AS "companyId", cp.company_name AS "companyName", cp.url AS "companyUrl", cp.logo_url AS "companyLogo",
      uj.status AS "userStatus",
      EXISTS (SELECT 1 FROM job_matches m WHERE m.user_id = ${userId} AND m.job_id = j.id) AS matched,
      (SELECT array_agg(DISTINCT t) FROM job_matches m, unnest(m.matched_terms) t
        WHERE m.user_id = ${userId} AND m.job_id = j.id AND t <> '*') AS "matchedTerms",
      count(*) OVER()::int AS total
    FROM jobs j
    JOIN career_pages cp ON cp.id = j.career_page_id
    LEFT JOIN user_jobs uj ON uj.user_id = ${userId} AND uj.job_id = j.id
    WHERE j.career_page_id IN (${visibleSourceIdsSql(userId, filters.listId ?? null)})
      AND j.hidden_at IS NULL
      ${viewCondition}
      ${filters.companyId ? client`AND j.career_page_id = ${filters.companyId}::uuid` : client``}
      ${pattern ? client`AND (j.title ILIKE ${pattern} OR cp.company_name ILIKE ${pattern} OR j.location ILIKE ${pattern} OR j.department ILIKE ${pattern})` : client``}
      ${filters.workplace?.length ? client`AND j.workplace_type = ANY(${filters.workplace})` : client``}
      ${filters.employment?.length ? client`AND j.employment_type = ANY(${filters.employment})` : client``}
      ${filters.seniority?.length ? client`AND j.seniority = ANY(${filters.seniority})` : client``}
      ${filters.postedWithinDays ? client`AND coalesce(j.posted_at, j.first_seen_at) > now() - make_interval(days => ${filters.postedWithinDays})` : client``}
    ORDER BY ${order}
    LIMIT ${filters.pageSize} OFFSET ${offset}
  `;

  const total = rows[0]?.total ?? 0;
  return {
    total,
    items: rows.map(({ companyId, companyName, companyUrl, companyLogo, total: _total, matchedTerms, ...job }) => ({
      ...job,
      matchedTerms: matchedTerms ?? [],
      company: { id: companyId, name: displayCompanyName(companyName, companyUrl), url: companyUrl, logoUrl: companyLogo },
    })),
  };
}

/** Counts for the feed's tabs, computed in one pass. */
export async function feedCounts(userId: string, listId?: string | null) {
  const [row] = await client<{ matching: number; new: number; all: number; closed: number; dismissed: number }[]>`
    SELECT
      count(*) FILTER (WHERE j.status = 'active' AND (uj.status IS NULL OR uj.status <> 'dismissed')
        AND EXISTS (SELECT 1 FROM job_matches m WHERE m.user_id = ${userId} AND m.job_id = j.id))::int AS matching,
      count(*) FILTER (WHERE j.status = 'active' AND (uj.status IS NULL OR uj.status <> 'dismissed')
        AND j.first_seen_at > now() - interval '7 days')::int AS new,
      count(*) FILTER (WHERE j.status = 'active' AND (uj.status IS NULL OR uj.status <> 'dismissed'))::int AS all,
      count(*) FILTER (WHERE j.status = 'closed' AND j.closed_at > now() - interval '30 days')::int AS closed,
      count(*) FILTER (WHERE uj.status = 'dismissed')::int AS dismissed
    FROM jobs j
    LEFT JOIN user_jobs uj ON uj.user_id = ${userId} AND uj.job_id = j.id
    WHERE j.career_page_id IN (${visibleSourceIdsSql(userId, listId ?? null)}) AND j.hidden_at IS NULL
  `;
  return row ?? { matching: 0, new: 0, all: 0, closed: 0, dismissed: 0 };
}

async function canSeeJob(userId: string, jobId: string, careerPageId: string): Promise<boolean> {
  const [visible] = await client<{ ok: number }[]>`
    SELECT 1 AS ok WHERE ${careerPageId}::uuid IN (${visibleSourceIdsSql(userId)})
    UNION ALL
    SELECT 1 FROM user_jobs WHERE user_id = ${userId} AND job_id = ${jobId}
    LIMIT 1
  `;
  return Boolean(visible);
}

export async function jobDetailForUser(userId: string, jobId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return null;
  const [row] = await db
    .select({ job: jobs, company: careerPages })
    .from(jobs)
    .innerJoin(careerPages, eq(careerPages.id, jobs.careerPageId))
    .where(eq(jobs.id, jobId));
  if (!row || row.job.hiddenAt) return null;
  if (!(await canSeeJob(userId, jobId, row.job.careerPageId))) return null;

  const [events, matches, [state]] = await Promise.all([
    db
      .select({ type: jobEvents.type, changes: jobEvents.changes, createdAt: jobEvents.createdAt })
      .from(jobEvents)
      .where(eq(jobEvents.jobId, jobId))
      .orderBy(desc(jobEvents.createdAt))
      .limit(30),
    db
      .select({ listId: jobMatches.listId, listName: lists.name, terms: jobMatches.matchedTerms, reasons: jobMatches.reasons })
      .from(jobMatches)
      .innerJoin(lists, eq(lists.id, jobMatches.listId))
      .where(and(eq(jobMatches.userId, userId), eq(jobMatches.jobId, jobId))),
    db.select().from(userJobs).where(and(eq(userJobs.userId, userId), eq(userJobs.jobId, jobId))),
  ]);

  const { job, company } = row;
  return {
    job: {
      id: job.id,
      title: job.title,
      url: job.url,
      location: job.location,
      department: job.department,
      jobType: job.jobType,
      workplaceType: job.workplaceType,
      employmentType: job.employmentType,
      seniority: job.seniority,
      salaryText: job.salaryText,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency,
      description: job.description,
      postedAt: job.postedAt,
      deadlineAt: job.deadlineAt,
      firstSeenAt: job.firstSeenAt,
      lastSeenAt: job.lastSeenAt,
      status: job.status,
      closedAt: job.closedAt,
      reopenedAt: job.reopenedAt,
    },
    company: {
      id: company.id,
      name: displayCompanyName(company.companyName, company.url),
      url: company.url,
      websiteUrl: company.websiteUrl,
      logoUrl: company.logoUrl,
      industry: company.industry,
      location: company.hqLocation,
      openJobs: company.activeJobCount,
    },
    history: events,
    matches: matches.map(match => ({
      listId: match.listId,
      listName: match.listName,
      terms: (match.terms ?? []).filter(term => term !== '*'),
      explanation: explainMatch(match.reasons as MatchReason[] | null),
    })),
    tracking: state
      ? { status: state.status, notes: state.notes, appliedAt: state.appliedAt, reminderAt: state.reminderAt, updatedAt: state.updatedAt }
      : null,
  };
}

/** Recent jobs at the companies on a public list, for the public list page. */
export async function jobsForPublicList(listId: string, options: { q?: string; page: number; pageSize: number }) {
  const pattern = options.q ? `%${options.q.replace(/[\\%_]/g, char => `\\${char}`)}%` : null;
  const rows = await client<
    {
      id: string;
      title: string;
      url: string | null;
      location: string | null;
      workplaceType: string | null;
      employmentType: string | null;
      firstSeenAt: Date;
      postedAt: Date | null;
      companyId: string;
      companyName: string | null;
      companyUrl: string;
      total: number;
    }[]
  >`
    SELECT j.id, j.title, j.url, j.location, j.workplace_type AS "workplaceType", j.employment_type AS "employmentType",
      j.first_seen_at AS "firstSeenAt", j.posted_at AS "postedAt",
      cp.id AS "companyId", cp.company_name AS "companyName", cp.url AS "companyUrl",
      count(*) OVER()::int AS total
    FROM list_career_pages x
    JOIN jobs j ON j.career_page_id = x.career_page_id
    JOIN career_pages cp ON cp.id = x.career_page_id
    WHERE x.list_id = ${listId} AND x.is_paused = false AND j.status = 'active' AND j.hidden_at IS NULL
      ${pattern ? client`AND (j.title ILIKE ${pattern} OR cp.company_name ILIKE ${pattern} OR j.location ILIKE ${pattern})` : client``}
    ORDER BY j.first_seen_at DESC, j.id
    LIMIT ${options.pageSize} OFFSET ${(options.page - 1) * options.pageSize}
  `;
  return {
    total: rows[0]?.total ?? 0,
    items: rows.map(({ companyId, companyName, companyUrl, total: _total, ...job }) => ({
      ...job,
      company: { id: companyId, name: displayCompanyName(companyName, companyUrl) },
    })),
  };
}
