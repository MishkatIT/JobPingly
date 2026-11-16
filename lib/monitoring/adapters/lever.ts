import type { WorkplaceType } from '@/lib/constants';
import type { AdapterMatch, RawJob, SourceAdapter } from '../types';

/**
 * Lever Postings API (public, no authentication).
 * https://github.com/lever/postings-api
 */

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  country?: string;
  workplaceType?: string;
  categories?: { location?: string; team?: string; department?: string; commitment?: string; allLocations?: string[] };
  descriptionPlain?: string;
  description?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
  salaryDescriptionPlain?: string;
}

const WORKPLACE: Record<string, WorkplaceType> = { remote: 'remote', hybrid: 'hybrid', onsite: 'onsite', 'on-site': 'onsite' };

export const leverAdapter: SourceAdapter = {
  id: 'lever',
  label: 'Lever',
  kind: 'api',
  examples: ['https://jobs.lever.co/netflix', 'https://jobs.eu.lever.co/company'],

  matchUrl(url): AdapterMatch | null {
    const host = url.hostname.toLowerCase();
    if (host !== 'jobs.lever.co' && host !== 'jobs.eu.lever.co') return null;
    const site = url.pathname.split('/').filter(Boolean)[0];
    if (!site) return null;
    return { adapterId: 'lever', identifier: site, meta: { region: host.includes('.eu.') ? 'eu' : 'global' } };
  },

  matchHtml(_url, html): AdapterMatch | null {
    const match = /jobs\.(eu\.)?lever\.co\/([a-z0-9_.-]+)/i.exec(html);
    if (!match) return null;
    return { adapterId: 'lever', identifier: match[2], meta: { region: match[1] ? 'eu' : 'global' } };
  },

  async fetchJobs({ match, http, maxPages }) {
    const site = match.identifier!;
    const apiHost = match.meta?.region === 'eu' ? 'api.eu.lever.co' : 'api.lever.co';
    const jobs: RawJob[] = [];
    const pageSize = 100;
    let truncated = false;
    let status: number | undefined;

    for (let skip = 0; ; skip += pageSize) {
      if (skip >= 3000 || (maxPages !== undefined && skip / pageSize >= maxPages)) {
        truncated = true;
        break;
      }
      const { data, response } = await http.getJson<LeverPosting[]>(
        `https://${apiHost}/v0/postings/${encodeURIComponent(site)}?mode=json&limit=${pageSize}&skip=${skip}`,
        { maxBytes: 20 * 1024 * 1024 },
      );
      status = response.status;
      if (!Array.isArray(data)) break;

      for (const posting of data) {
        const range = posting.salaryRange;
        jobs.push({
          externalId: posting.id,
          title: posting.text,
          url: posting.hostedUrl ?? `https://jobs.lever.co/${site}/${posting.id}`,
          location: posting.categories?.allLocations?.join('; ') || posting.categories?.location || posting.country || null,
          department: posting.categories?.department || posting.categories?.team || null,
          jobType: posting.categories?.commitment ?? null,
          workplaceType: WORKPLACE[(posting.workplaceType ?? '').toLowerCase()] ?? null,
          description: posting.descriptionPlain ?? posting.description ?? null,
          salaryMin: range?.min ?? null,
          salaryMax: range?.max ?? null,
          salaryCurrency: range?.currency ?? null,
          salaryText:
            range?.min || range?.max
              ? `${range.currency ?? ''} ${range.min ?? ''}${range.max ? ` - ${range.max}` : ''}${range.interval ? ` ${range.interval.replace(/-/g, ' ')}` : ''}`.trim()
              : (posting.salaryDescriptionPlain ?? null),
          postedAt: posting.createdAt ?? null,
          extra: { team: posting.categories?.team },
        });
      }
      if (data.length < pageSize) break;
    }

    return { jobs, truncated, httpStatus: status };
  },
};
