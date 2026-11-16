import { ScanError } from '../errors';
import type { AdapterMatch, RawJob, SourceAdapter } from '../types';

/**
 * Workday career sites (*.myworkdayjobs.com), via the same CXS endpoint the
 * site's own front end calls: POST /wday/cxs/<tenant>/<site>/jobs
 */

interface WorkdayPosting {
  title?: string;
  externalPath?: string;
  locationsText?: string;
  postedOn?: string;
  timeType?: string;
  bulletFields?: string[];
}

const PAGE_SIZE = 20;
const MAX_JOBS = 2000;

/** "Posted Today", "Posted 3 Days Ago", "Posted 30+ Days Ago" -> approximate date. */
function parsePostedOn(text: string | undefined): Date | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  const now = Date.now();
  if (lower.includes('today')) return new Date(now);
  if (lower.includes('yesterday')) return new Date(now - 86_400_000);
  const days = /(\d+)\+?\s+days?/.exec(lower);
  if (days) return new Date(now - Number(days[1]) * 86_400_000);
  return null;
}

export const workdayAdapter: SourceAdapter = {
  id: 'workday',
  label: 'Workday',
  kind: 'api',
  examples: ['https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite'],

  matchUrl(url): AdapterMatch | null {
    const host = url.hostname.toLowerCase();
    if (!host.endsWith('.myworkdayjobs.com')) return null;
    const tenant = host.split('.')[0];
    const segments = url.pathname.split('/').filter(Boolean);
    // Path is /<site> or /<locale>/<site>, optionally followed by /job/...
    const site = /^[a-z]{2}(-[a-z]{2})?$/i.test(segments[0] ?? '') ? segments[1] : segments[0];
    if (!tenant || !site) return null;
    return { adapterId: 'workday', identifier: `${tenant}/${site}`, meta: { host, tenant, site } };
  },

  matchHtml(_url, html): AdapterMatch | null {
    const match = /https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[a-z]{2}\/)?([a-z0-9_-]+)/i.exec(html);
    if (!match) return null;
    const host = `${match[1]}.${match[2]}.myworkdayjobs.com`.toLowerCase();
    return { adapterId: 'workday', identifier: `${match[1]}/${match[3]}`, meta: { host, tenant: match[1], site: match[3] } };
  },

  async fetchJobs({ match, http, maxPages }) {
    const { host, tenant, site } = match.meta ?? {};
    if (!host || !tenant || !site) throw new ScanError('parse', 'Could not determine the Workday tenant and site from the URL.');

    const endpoint = `https://${host}/wday/cxs/${tenant}/${site}/jobs`;
    const jobs: RawJob[] = [];
    let total = Infinity;
    let truncated = false;
    let status: number | undefined;

    for (let offset = 0; offset < total; offset += PAGE_SIZE) {
      if (offset >= MAX_JOBS || (maxPages !== undefined && offset / PAGE_SIZE >= maxPages)) {
        truncated = true;
        break;
      }

      let page: { total?: number; jobPostings?: WorkdayPosting[] };
      try {
        const result = await http.postJson<{ total?: number; jobPostings?: WorkdayPosting[] }>(endpoint, {
          appliedFacets: {},
          limit: PAGE_SIZE,
          offset,
          searchText: '',
        });
        page = result.data;
        status = result.response.status;
      } catch (error) {
        // A failure on the first page is a failed scan. A failure part-way
        // through means we have an incomplete picture: report what we have
        // and flag it, so the pipeline does not close the jobs we never saw.
        if (offset === 0) throw error;
        truncated = true;
        break;
      }

      const postings = page.jobPostings ?? [];
      // Workday only reports `total` reliably on the first page.
      if (offset === 0) total = typeof page.total === 'number' ? page.total : postings.length;
      if (postings.length === 0) break;

      for (const posting of postings) {
        if (!posting.title) continue;
        const path = posting.externalPath ?? '';
        const requisitionId = posting.bulletFields?.find(field => /^[A-Z]{0,6}[-_]?\d{3,}/i.test(field)) ?? posting.bulletFields?.[0];
        jobs.push({
          externalId: requisitionId ?? (path ? path.split('/').pop() : null),
          title: posting.title,
          url: path ? `https://${host}/${site}${path.startsWith('/') ? '' : '/'}${path}` : null,
          location: posting.locationsText ?? null,
          jobType: posting.timeType ?? null,
          postedAt: parsePostedOn(posting.postedOn),
          extra: { postedOn: posting.postedOn },
        });
      }
      if (postings.length < PAGE_SIZE) break;
    }

    // Workday never reports more than 2,000 results, so a board at the cap
    // is almost certainly larger than what we could see.
    if (jobs.length >= MAX_JOBS) truncated = true;

    return { jobs, truncated, httpStatus: status };
  },
};
