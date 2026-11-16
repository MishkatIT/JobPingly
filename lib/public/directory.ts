import { client } from '@/lib/db/client';
import { displayCompanyName, healthOf } from '@/lib/companies/service';
import { loadListAccessBySlug } from '@/lib/lists/access';

/**
 * The public directory: watchlists their owners chose to publish. Lists with
 * no companies and lists owned by suspended accounts are never shown.
 */

export const DIRECTORY_SORTS = ['popular', 'newest', 'companies', 'jobs'] as const;
export type DirectorySort = (typeof DIRECTORY_SORTS)[number];

export interface DirectoryEntry {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  tags: string[];
  followers: number;
  featured: boolean;
  companies: number;
  openJobs: number;
  topCompanies: string[];
  owner: { id: string; name: string | null; avatarUrl: string | null };
  updatedAt: Date;
}

export async function publicDirectory(options: { q?: string; tag?: string; sort: DirectorySort; page: number; pageSize: number }) {
  const pattern = options.q ? `%${options.q.replace(/[\\%_]/g, char => `\\${char}`)}%` : null;
  const order = {
    popular: client`l.follower_count DESC, "openJobs" DESC, "updatedAt" DESC`,
    newest: client`l.created_at DESC`,
    companies: client`companies DESC, l.follower_count DESC`,
    jobs: client`"openJobs" DESC, l.follower_count DESC`,
  }[options.sort];

  const rows = await client<
    (Omit<DirectoryEntry, 'owner' | 'topCompanies' | 'featured'> & {
      featuredAt: Date | null;
      ownerId: string;
      ownerName: string | null;
      ownerAvatar: string | null;
      topCompanies: { name: string | null; url: string }[] | null;
      total: number;
    })[]
  >`
    SELECT * FROM (
      SELECT l.id, l.name, l.slug, l.description, l.tags, l.follower_count AS followers, l.featured_at AS "featuredAt",
        l.updated_at AS "updatedAt", l.created_at,
        u.id AS "ownerId", u.name AS "ownerName",
        CASE WHEN u.avatar_url LIKE 'data:%' THEN '/api/avatar/' || u.id::text || '?v=' || substr(md5(u.avatar_url), 1, 8) ELSE u.avatar_url END AS "ownerAvatar",
        (SELECT count(*) FROM list_career_pages x WHERE x.list_id = l.id)::int AS companies,
        (SELECT coalesce(sum(cp.active_job_count), 0) FROM list_career_pages x JOIN career_pages cp ON cp.id = x.career_page_id
          WHERE x.list_id = l.id AND x.is_paused = false)::int AS "openJobs",
        (SELECT json_agg(t) FROM (
          SELECT cp.company_name AS name, cp.url FROM list_career_pages x JOIN career_pages cp ON cp.id = x.career_page_id
          WHERE x.list_id = l.id ORDER BY cp.active_job_count DESC LIMIT 4
        ) t) AS "topCompanies",
        l.follower_count
      FROM lists l
      JOIN users u ON u.id = l.user_id AND u.is_blocked = false
      WHERE l.visibility = 'public' AND l.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM list_career_pages x WHERE x.list_id = l.id)
        ${options.tag ? client`AND ${options.tag} = ANY(l.tags)` : client``}
        ${
          pattern
            ? client`AND (l.name ILIKE ${pattern} OR l.description ILIKE ${pattern} OR EXISTS (
                SELECT 1 FROM list_career_pages x JOIN career_pages cp ON cp.id = x.career_page_id
                WHERE x.list_id = l.id AND cp.company_name ILIKE ${pattern}))`
            : client``
        }
    ) l
    ORDER BY ("featuredAt" IS NOT NULL) DESC, ${order}
    LIMIT ${options.pageSize} OFFSET ${(options.page - 1) * options.pageSize}
  `;

  const [{ total }] = await client<{ total: number }[]>`
    SELECT count(*)::int AS total FROM lists l JOIN users u ON u.id = l.user_id AND u.is_blocked = false
    WHERE l.visibility = 'public' AND l.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM list_career_pages x WHERE x.list_id = l.id)
      ${options.tag ? client`AND ${options.tag} = ANY(l.tags)` : client``}
      ${
        pattern
          ? client`AND (l.name ILIKE ${pattern} OR l.description ILIKE ${pattern} OR EXISTS (
              SELECT 1 FROM list_career_pages x JOIN career_pages cp ON cp.id = x.career_page_id
              WHERE x.list_id = l.id AND cp.company_name ILIKE ${pattern}))`
          : client``
      }
  `;

  const items: DirectoryEntry[] = rows.map(row => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    tags: row.tags ?? [],
    followers: row.followers,
    featured: Boolean(row.featuredAt),
    companies: row.companies,
    openJobs: row.openJobs,
    topCompanies: (row.topCompanies ?? []).map(company => displayCompanyName(company.name, company.url)),
    owner: { id: row.ownerId, name: row.ownerName, avatarUrl: row.ownerAvatar },
    updatedAt: row.updatedAt,
  }));
  return { items, total };
}

export async function popularTags(limit = 12): Promise<{ tag: string; count: number }[]> {
  return client<{ tag: string; count: number }[]>`
    SELECT tag, count(*)::int AS count
    FROM lists l, unnest(l.tags) AS tag
    WHERE l.visibility = 'public' AND l.deleted_at IS NULL
    GROUP BY tag ORDER BY count DESC, tag LIMIT ${limit}
  `;
}

/** Real platform figures for the public pages. Never estimated or padded. */
export async function platformStats() {
  const [row] = await client<{ companies: number; openJobs: number; jobsLast30Days: number; publicLists: number }[]>`
    SELECT
      (SELECT count(*) FROM career_pages WHERE last_success_at IS NOT NULL AND status <> 'paused')::int AS companies,
      (SELECT coalesce(sum(active_job_count), 0) FROM career_pages)::int AS "openJobs",
      (SELECT count(*) FROM jobs WHERE first_seen_at > now() - interval '30 days')::int AS "jobsLast30Days",
      (SELECT count(*) FROM lists l WHERE l.visibility = 'public' AND l.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM list_career_pages x WHERE x.list_id = l.id))::int AS "publicLists"
  `;
  return row ?? { companies: 0, openJobs: 0, jobsLast30Days: 0, publicLists: 0 };
}

export async function publicListBySlug(slug: string, viewerId: string | null) {
  const access = await loadListAccessBySlug(slug, viewerId);
  if (!access || access.list.visibility !== 'public') return null;
  const { list } = access;

  const [owner] = await client<{ id: string; name: string | null; avatarUrl: string | null; isBlocked: boolean }[]>`
    SELECT id, name, is_blocked AS "isBlocked",
      CASE WHEN avatar_url LIKE 'data:%' THEN '/api/avatar/' || id::text || '?v=' || substr(md5(avatar_url), 1, 8) ELSE avatar_url END AS "avatarUrl"
    FROM users WHERE id = ${list.userId}
  `;
  if (!owner || owner.isBlocked) return null;

  const companies = await client<
    { id: string; url: string; companyName: string | null; logoUrl: string | null; openJobs: number; status: string; lastErrorClass: string | null; lastSuccessAt: Date | null; category: string | null }[]
  >`
    SELECT cp.id, cp.url, cp.company_name AS "companyName", cp.logo_url AS "logoUrl", cp.active_job_count AS "openJobs",
      cp.status, cp.last_error_class AS "lastErrorClass", cp.last_success_at AS "lastSuccessAt", x.category
    FROM list_career_pages x JOIN career_pages cp ON cp.id = x.career_page_id
    WHERE x.list_id = ${list.id}
    ORDER BY cp.active_job_count DESC, lower(coalesce(cp.company_name, cp.url))
  `;

  return {
    list: {
      id: list.id,
      name: list.name,
      slug: list.slug,
      description: list.description,
      tags: list.tags ?? [],
      followers: list.followerCount,
      featured: Boolean(list.featuredAt),
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
    },
    owner: { id: owner.id, name: owner.name, avatarUrl: owner.avatarUrl },
    viewer: { role: access.role, isFollowing: access.isFollowing, canEdit: access.canEditCompanies },
    companies: companies.map(company => ({
      id: company.id,
      name: displayCompanyName(company.companyName, company.url),
      url: company.url,
      logoUrl: company.logoUrl,
      openJobs: company.openJobs,
      category: company.category,
      healthLabel: healthOf(company).healthLabel,
      health: healthOf(company).health,
    })),
    openJobs: companies.reduce((sum, company) => sum + company.openJobs, 0),
  };
}

export async function publicProfile(userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const [user] = await client<{ id: string; name: string | null; avatarUrl: string | null; socials: Record<string, string> | null; createdAt: Date }[]>`
    SELECT id, name, socials, created_at AS "createdAt",
      CASE WHEN avatar_url LIKE 'data:%' THEN '/api/avatar/' || id::text || '?v=' || substr(md5(avatar_url), 1, 8) ELSE avatar_url END AS "avatarUrl"
    FROM users WHERE id = ${userId} AND is_blocked = false
  `;
  if (!user) return null;
  const lists = await client<{ id: string; name: string; slug: string; description: string | null; followers: number; companies: number }[]>`
    SELECT l.id, l.name, l.slug, l.description, l.follower_count AS followers,
      (SELECT count(*) FROM list_career_pages x WHERE x.list_id = l.id)::int AS companies
    FROM lists l
    WHERE l.user_id = ${userId} AND l.visibility = 'public' AND l.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM list_career_pages x WHERE x.list_id = l.id)
    ORDER BY l.follower_count DESC, l.updated_at DESC
  `;
  // Only people who publish something have a public profile.
  if (lists.length === 0) return null;
  return { user: { ...user, socials: user.socials ?? {} }, lists };
}

/** The most recently discovered open jobs at companies on public lists (for the homepage preview). */
export async function latestPublicJobs(limit = 6) {
  const rows = await client<
    { id: string; title: string; location: string | null; workplaceType: string | null; employmentType: string | null; firstSeenAt: Date; companyName: string | null; companyUrl: string; logoUrl: string | null }[]
  >`
    SELECT DISTINCT ON (j.career_page_id) j.id, j.title, j.location, j.workplace_type AS "workplaceType",
      j.employment_type AS "employmentType", j.first_seen_at AS "firstSeenAt",
      cp.company_name AS "companyName", cp.url AS "companyUrl", cp.logo_url AS "logoUrl"
    FROM jobs j
    JOIN career_pages cp ON cp.id = j.career_page_id
    WHERE j.status = 'active' AND j.hidden_at IS NULL
      AND EXISTS (
        SELECT 1 FROM list_career_pages x JOIN lists l ON l.id = x.list_id
        JOIN users u ON u.id = l.user_id AND NOT u.is_blocked
        WHERE x.career_page_id = j.career_page_id AND l.visibility = 'public' AND l.deleted_at IS NULL
      )
    ORDER BY j.career_page_id, j.first_seen_at DESC
  `;
  return rows
    .sort((a, b) => b.firstSeenAt.getTime() - a.firstSeenAt.getTime())
    .slice(0, limit)
    .map(row => ({ ...row, companyName: displayCompanyName(row.companyName, row.companyUrl) }));
}
