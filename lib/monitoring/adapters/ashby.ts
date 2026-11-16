import type { WorkplaceType } from '@/lib/constants';
import type { AdapterMatch, RawJob, SourceAdapter } from '../types';

/**
 * Ashby public job board API.
 * https://developers.ashbyhq.com/docs/public-job-posting-api
 */

interface AshbyJob {
  id: string;
  title: string;
  department?: string;
  team?: string;
  employmentType?: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  isRemote?: boolean;
  workplaceType?: string;
  isListed?: boolean;
  publishedAt?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  compensation?: { compensationTierSummary?: string; scrapeableCompensationSalarySummary?: string };
}

const EMPLOYMENT: Record<string, string> = {
  FullTime: 'Full-time',
  PartTime: 'Part-time',
  Intern: 'Internship',
  Contract: 'Contract',
  Temporary: 'Temporary',
};

const WORKPLACE: Record<string, WorkplaceType> = { remote: 'remote', hybrid: 'hybrid', onsite: 'onsite' };

export const ashbyAdapter: SourceAdapter = {
  id: 'ashby',
  label: 'Ashby',
  kind: 'api',
  examples: ['https://jobs.ashbyhq.com/linear'],

  matchUrl(url): AdapterMatch | null {
    if (url.hostname.toLowerCase() !== 'jobs.ashbyhq.com') return null;
    const org = url.pathname.split('/').filter(Boolean)[0];
    return org ? { adapterId: 'ashby', identifier: decodeURIComponent(org) } : null;
  },

  matchHtml(_url, html): AdapterMatch | null {
    const match =
      /jobs\.ashbyhq\.com\/([a-z0-9_.%-]+)/i.exec(html) ??
      /ashbyhq\.com\/posting-api\/job-board\/([a-z0-9_.%-]+)/i.exec(html);
    if (!match || match[1].toLowerCase() === 'api') return null;
    return { adapterId: 'ashby', identifier: decodeURIComponent(match[1]) };
  },

  async fetchJobs({ match, http }) {
    const org = match.identifier!;
    const { data, response } = await http.getJson<{ jobs?: AshbyJob[] }>(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}?includeCompensation=true`,
      { maxBytes: 30 * 1024 * 1024 },
    );

    const jobs: RawJob[] = (data.jobs ?? [])
      .filter(job => job.isListed !== false)
      .map(job => {
        const locations = [job.location, ...(job.secondaryLocations ?? []).map(l => l.location)].filter(Boolean);
        return {
          externalId: job.id,
          title: job.title,
          url: job.jobUrl ?? `https://jobs.ashbyhq.com/${org}/${job.id}`,
          location: locations.join('; ') || null,
          department: job.department ?? job.team ?? null,
          jobType: job.employmentType ? (EMPLOYMENT[job.employmentType] ?? job.employmentType) : null,
          workplaceType: WORKPLACE[(job.workplaceType ?? '').toLowerCase()] ?? (job.isRemote ? 'remote' : null),
          description: job.descriptionPlain ?? job.descriptionHtml ?? null,
          salaryText: job.compensation?.scrapeableCompensationSalarySummary ?? job.compensation?.compensationTierSummary ?? null,
          postedAt: job.publishedAt ?? null,
          extra: { team: job.team },
        };
      });

    return { jobs, httpStatus: response.status };
  },
};
