import type { AdapterMatch, RawJob, SourceAdapter } from '../types';

/**
 * SmartRecruiters Posting API (public).
 * https://developers.smartrecruiters.com/docs/posting-api
 */

interface SrPosting {
  id: string;
  name: string;
  refNumber?: string;
  releasedDate?: string;
  location?: { city?: string; region?: string; country?: string; remote?: boolean; hybrid?: boolean; fullLocation?: string };
  department?: { label?: string };
  typeOfEmployment?: { label?: string };
  experienceLevel?: { label?: string };
}

const HOSTS = new Set(['jobs.smartrecruiters.com', 'careers.smartrecruiters.com']);

export const smartRecruitersAdapter: SourceAdapter = {
  id: 'smartrecruiters',
  label: 'SmartRecruiters',
  kind: 'api',
  examples: ['https://jobs.smartrecruiters.com/Visa', 'https://careers.smartrecruiters.com/Bosch'],

  matchUrl(url): AdapterMatch | null {
    if (!HOSTS.has(url.hostname.toLowerCase())) return null;
    const company = url.pathname.split('/').filter(Boolean)[0];
    return company ? { adapterId: 'smartrecruiters', identifier: decodeURIComponent(company) } : null;
  },

  matchHtml(_url, html): AdapterMatch | null {
    const match = /(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9_.-]+)/.exec(html);
    if (!match || /^(sr-jobs|oneclick-ui|static)$/i.test(match[1])) return null;
    return { adapterId: 'smartrecruiters', identifier: match[1] };
  },

  async fetchJobs({ match, http, maxPages }) {
    const company = match.identifier!;
    const jobs: RawJob[] = [];
    const limit = 100;
    let truncated = false;
    let status: number | undefined;

    for (let offset = 0; ; offset += limit) {
      if (offset >= 3000 || (maxPages !== undefined && offset / limit >= maxPages)) {
        truncated = true;
        break;
      }
      let page: { content?: SrPosting[]; totalFound?: number };
      try {
        const result = await http.getJson<{ content?: SrPosting[]; totalFound?: number }>(
          `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings?limit=${limit}&offset=${offset}`,
        );
        page = result.data;
        status = result.response.status;
      } catch (error) {
        if (offset === 0) throw error;
        truncated = true;
        break;
      }

      const content = page.content ?? [];
      for (const posting of content) {
        const loc = posting.location;
        const location = loc?.fullLocation || [loc?.city, loc?.region, loc?.country?.toUpperCase()].filter(Boolean).join(', ');
        jobs.push({
          externalId: posting.id,
          title: posting.name,
          url: `https://jobs.smartrecruiters.com/${company}/${posting.id}`,
          location: location || null,
          department: posting.department?.label ?? null,
          jobType: posting.typeOfEmployment?.label ?? null,
          workplaceType: loc?.remote ? 'remote' : loc?.hybrid ? 'hybrid' : null,
          postedAt: posting.releasedDate ?? null,
          extra: { refNumber: posting.refNumber, experienceLevel: posting.experienceLevel?.label },
        });
      }
      if (content.length < limit || offset + limit >= (page.totalFound ?? 0)) break;
    }

    return { jobs, truncated, httpStatus: status };
  },
};
