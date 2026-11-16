import type { AdapterMatch, RawJob, SourceAdapter } from '../types';

/** Workable-hosted career pages (apply.workable.com/<account>), via the public widget API. */

interface WorkableJob {
  title: string;
  shortcode: string;
  url?: string;
  application_url?: string;
  department?: string;
  employment_type?: string;
  telecommuting?: boolean;
  city?: string;
  state?: string;
  country?: string;
  published_on?: string;
  created_at?: string;
  description?: string;
}

export const workableAdapter: SourceAdapter = {
  id: 'workable',
  label: 'Workable',
  kind: 'api',
  examples: ['https://apply.workable.com/acme'],

  matchUrl(url): AdapterMatch | null {
    const host = url.hostname.toLowerCase();
    if (host === 'apply.workable.com') {
      const account = url.pathname.split('/').filter(Boolean)[0];
      return account && account !== 'api' ? { adapterId: 'workable', identifier: account } : null;
    }
    if (host.endsWith('.workable.com') && !['www', 'apply', 'careers', 'resources', 'help'].includes(host.split('.')[0])) {
      return { adapterId: 'workable', identifier: host.split('.')[0] };
    }
    return null;
  },

  matchHtml(_url, html): AdapterMatch | null {
    const match = /apply\.workable\.com\/([a-z0-9-]+)/i.exec(html);
    if (!match || ['api', 'j'].includes(match[1].toLowerCase())) return null;
    return { adapterId: 'workable', identifier: match[1] };
  },

  async fetchJobs({ match, http }) {
    const account = match.identifier!;
    const { data, response } = await http.getJson<{ name?: string; jobs?: WorkableJob[] }>(
      `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(account)}?details=true`,
      { maxBytes: 30 * 1024 * 1024 },
    );

    const jobs: RawJob[] = (data.jobs ?? []).map(job => ({
      externalId: job.shortcode,
      title: job.title,
      url: job.url ?? `https://apply.workable.com/${account}/j/${job.shortcode}/`,
      location: [job.city, job.state, job.country].filter(Boolean).join(', ') || null,
      department: job.department ?? null,
      jobType: job.employment_type ?? null,
      workplaceType: job.telecommuting ? 'remote' : null,
      description: job.description ?? null,
      postedAt: job.published_on ?? job.created_at ?? null,
    }));

    return { jobs, companyName: data.name ?? null, httpStatus: response.status };
  },
};
