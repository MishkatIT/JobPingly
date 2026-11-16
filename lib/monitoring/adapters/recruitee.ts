import type { AdapterMatch, RawJob, SourceAdapter } from '../types';

/** Recruitee careers sites expose their offers at /api/offers/. */

interface RecruiteeOffer {
  id: number;
  title: string;
  careers_url?: string;
  location?: string;
  city?: string;
  country?: string;
  department?: string;
  employment_type_code?: string;
  remote?: boolean;
  hybrid?: boolean;
  on_site?: boolean;
  description?: string;
  requirements?: string;
  published_at?: string;
  created_at?: string;
  status?: string;
  salary?: { min?: string | number; max?: string | number; currency?: string; period?: string };
}

export const recruiteeAdapter: SourceAdapter = {
  id: 'recruitee',
  label: 'Recruitee',
  kind: 'api',
  examples: ['https://acme.recruitee.com'],

  matchUrl(url): AdapterMatch | null {
    const host = url.hostname.toLowerCase();
    if (!host.endsWith('.recruitee.com') || host === 'www.recruitee.com' || host === 'api.recruitee.com') return null;
    return { adapterId: 'recruitee', identifier: host.split('.')[0], meta: { host } };
  },

  matchHtml(_url, html): AdapterMatch | null {
    const match = /https?:\/\/([a-z0-9-]+)\.recruitee\.com/i.exec(html);
    if (!match || ['www', 'api', 'careers', 'd27i7n2isjbnbi', 'cdn'].includes(match[1].toLowerCase())) return null;
    return { adapterId: 'recruitee', identifier: match[1], meta: { host: `${match[1].toLowerCase()}.recruitee.com` } };
  },

  async fetchJobs({ match, http }) {
    const host = match.meta?.host ?? `${match.identifier}.recruitee.com`;
    const { data, response } = await http.getJson<{ offers?: RecruiteeOffer[] }>(`https://${host}/api/offers/`, {
      maxBytes: 20 * 1024 * 1024,
    });

    const jobs: RawJob[] = (data.offers ?? [])
      .filter(offer => !offer.status || offer.status === 'published')
      .map(offer => {
        const min = offer.salary?.min ? Number(offer.salary.min) : null;
        const max = offer.salary?.max ? Number(offer.salary.max) : null;
        return {
          externalId: String(offer.id),
          title: offer.title,
          url: offer.careers_url ?? null,
          location: offer.location || [offer.city, offer.country].filter(Boolean).join(', ') || null,
          department: offer.department ?? null,
          jobType: offer.employment_type_code?.replace(/_/g, ' ') ?? null,
          workplaceType: offer.remote ? 'remote' : offer.hybrid ? 'hybrid' : offer.on_site ? 'onsite' : null,
          description: [offer.description, offer.requirements].filter(Boolean).join('\n') || null,
          salaryMin: Number.isFinite(min) ? min : null,
          salaryMax: Number.isFinite(max) ? max : null,
          salaryCurrency: offer.salary?.currency ?? null,
          salaryText: min || max ? `${offer.salary?.currency ?? ''} ${min ?? ''}${max ? ` - ${max}` : ''} ${offer.salary?.period ?? ''}`.trim() : null,
          postedAt: offer.published_at ?? offer.created_at ?? null,
        };
      });

    return { jobs, httpStatus: response.status };
  },
};
