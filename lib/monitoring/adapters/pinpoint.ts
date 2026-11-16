import type { WorkplaceType } from '@/lib/constants';
import type { AdapterMatch, RawJob, SourceAdapter } from '../types';

/** Pinpoint career sites (<company>.pinpointhq.com) publish their postings at /postings.json. */

interface PinpointPosting {
  id: string | number;
  title: string;
  url?: string;
  path?: string;
  description?: string;
  employment_type?: string;
  employment_type_text?: string;
  workplace_type?: string;
  workplace_type_text?: string;
  compensation?: string | null;
  compensation_minimum?: number | null;
  compensation_maximum?: number | null;
  compensation_currency?: string | null;
  deadline_at?: string | null;
  location?: { name?: string; city?: string; province?: string };
  department?: { name?: string };
  job?: { department?: { name?: string }; requisition_id?: string };
}

const WORKPLACE: Record<string, WorkplaceType> = { remote: 'remote', hybrid: 'hybrid', onsite: 'onsite', on_site: 'onsite' };

export const pinpointAdapter: SourceAdapter = {
  id: 'pinpoint',
  label: 'Pinpoint',
  kind: 'api',
  examples: ['https://acme.pinpointhq.com'],

  matchUrl(url): AdapterMatch | null {
    const host = url.hostname.toLowerCase();
    if (!host.endsWith('.pinpointhq.com') || ['www', 'app', 'api'].includes(host.split('.')[0])) return null;
    return { adapterId: 'pinpoint', identifier: host.split('.')[0], meta: { host } };
  },

  matchHtml(_url, html): AdapterMatch | null {
    const match = /https?:\/\/([a-z0-9-]+)\.pinpointhq\.com/i.exec(html);
    if (!match || ['www', 'app', 'api', 'cdn', 'assets'].includes(match[1].toLowerCase())) return null;
    return { adapterId: 'pinpoint', identifier: match[1].toLowerCase(), meta: { host: `${match[1].toLowerCase()}.pinpointhq.com` } };
  },

  async fetchJobs({ match, http }) {
    const host = match.meta?.host ?? `${match.identifier}.pinpointhq.com`;
    const { data, response } = await http.getJson<{ data?: PinpointPosting[] }>(`https://${host}/postings.json`, {
      maxBytes: 20 * 1024 * 1024,
    });

    const jobs: RawJob[] = (data.data ?? [])
      .filter(posting => posting?.title)
      .map(posting => ({
        externalId: String(posting.id),
        title: posting.title,
        url: posting.url ?? (posting.path ? `https://${host}${posting.path}` : null),
        location: posting.location?.name || [posting.location?.city, posting.location?.province].filter(Boolean).join(', ') || null,
        department: posting.department?.name ?? posting.job?.department?.name ?? null,
        jobType: posting.employment_type_text ?? posting.employment_type?.replace(/_/g, ' ') ?? null,
        workplaceType: WORKPLACE[(posting.workplace_type ?? '').toLowerCase()] ?? null,
        description: posting.description ?? null,
        salaryText: posting.compensation ?? null,
        salaryMin: posting.compensation_minimum ?? null,
        salaryMax: posting.compensation_maximum ?? null,
        salaryCurrency: posting.compensation_currency ?? null,
        deadlineAt: posting.deadline_at ?? null,
      }));

    return { jobs, httpStatus: response.status };
  },
};
