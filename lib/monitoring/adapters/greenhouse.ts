import type { AdapterMatch, RawJob, SourceAdapter } from '../types';

/**
 * Greenhouse Job Board API (public, no authentication).
 * https://developers.greenhouse.io/job-board.html
 */

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url?: string;
  updated_at?: string;
  first_published?: string;
  location?: { name?: string };
  departments?: { name?: string }[];
  offices?: { name?: string; location?: string }[];
  content?: string;
  metadata?: { name?: string; value?: unknown }[] | null;
}

const HOSTS = /^(?:boards|job-boards|boards\.eu|job-boards\.eu)\.greenhouse\.io$/i;
const RESERVED = new Set(['embed', 'jobs', 'v1', 'api']);

function tokenFromHtml(html: string): string | null {
  const patterns = [
    /boards\.greenhouse\.io\/embed\/job_board(?:\/js)?\?(?:[^"'\s]*&)?for=([a-z0-9_-]+)/i,
    /boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9_-]+)/i,
    /(?:job-)?boards(?:\.eu)?\.greenhouse\.io\/([a-z0-9_-]+)(?:\/jobs\/\d+|["'?/])/i,
  ];
  for (const pattern of patterns) {
    const token = pattern.exec(html)?.[1];
    if (token && !RESERVED.has(token.toLowerCase())) return token;
  }
  return null;
}

export const greenhouseAdapter: SourceAdapter = {
  id: 'greenhouse',
  label: 'Greenhouse',
  kind: 'api',
  examples: ['https://boards.greenhouse.io/stripe', 'https://job-boards.greenhouse.io/anthropic'],

  matchUrl(url): AdapterMatch | null {
    if (HOSTS.test(url.hostname)) {
      const embedded = url.pathname.startsWith('/embed/') ? url.searchParams.get('for') : null;
      const token = embedded ?? url.pathname.split('/').filter(Boolean)[0];
      if (token && !RESERVED.has(token.toLowerCase())) return { adapterId: 'greenhouse', identifier: token };
    }
    return null;
  },

  matchHtml(_url, html): AdapterMatch | null {
    if (!/greenhouse\.io|grnhse/i.test(html)) return null;
    const token = tokenFromHtml(html);
    return token ? { adapterId: 'greenhouse', identifier: token } : null;
  },

  async fetchJobs({ match, http }) {
    const token = match.identifier!;
    const { data, response } = await http.getJson<{ jobs?: GreenhouseJob[] }>(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`,
      { maxBytes: 30 * 1024 * 1024 },
    );

    const jobs: RawJob[] = (data.jobs ?? []).map(job => {
      const office = job.offices?.map(o => o.name).filter(Boolean).join(', ');
      const salaryMeta = job.metadata?.find(m => /salary|compensation|pay range/i.test(m.name ?? ''));
      const typeMeta = job.metadata?.find(m => /employment type|time type|job type|commitment/i.test(m.name ?? ''));
      return {
        externalId: String(job.id),
        title: job.title,
        url: job.absolute_url ?? `https://boards.greenhouse.io/${token}/jobs/${job.id}`,
        location: job.location?.name || office || null,
        department: job.departments?.[0]?.name ?? null,
        jobType: typeof typeMeta?.value === 'string' ? typeMeta.value : null,
        salaryText: typeof salaryMeta?.value === 'string' ? salaryMeta.value : null,
        description: job.content ?? null,
        postedAt: job.first_published ?? job.updated_at ?? null,
        extra: { offices: office || undefined, updatedAt: job.updated_at },
      };
    });

    return { jobs, httpStatus: response.status };
  },
};
