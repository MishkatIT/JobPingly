import { ATSAdapter, NormalizedJob } from '../types';
import { aiFallbackNormalize } from '../aiFallback';

/**
 * Stage 3: Detect API & Paginated Fetcher Adapter
 * Handles Greenhouse, Lever, Workday, SmartRecruiters, Ashby API endpoints,
 * as well as internal company REST/JSON API endpoints (e.g. /api/jobs, /api/openings, /api/careers).
 */
export const ApiDetectorsAdapter: ATSAdapter = {
  name: 'api_detectors',

  detect(url: string, html: string): boolean {
    const lower = url.toLowerCase() + html.toLowerCase();
    return lower.includes('greenhouse.io') ||
           lower.includes('lever.co') ||
           lower.includes('smartrecruiters.com') ||
           lower.includes('ashbyhq.com') ||
           lower.includes('myworkdayjobs.com') ||
           lower.includes('/api/jobs') ||
           lower.includes('/api/openings') ||
           lower.includes('/api/careers') ||
           lower.includes('/api/vacancies') ||
           /\/_next\/static\/chunks\/app\/careers/i.test(html);
  },

  async extractJobs(url: string, html: string): Promise<NormalizedJob[]> {
    // 1. SmartRecruiters API with Pagination
    const srMatch = url.match(/smartrecruiters\.com\/([^/?#]+)/i) || html.match(/smartrecruiters\.com\/([^/"'?#\s]+)/i);
    if (srMatch && srMatch[1]) {
      const company = srMatch[1];
      const allJobs: NormalizedJob[] = [];
      let offset = 0;
      const limit = 100;
      let hasMore = true;

      while (hasMore && offset < 500) {
        try {
          const apiRes = await fetch(`https://api.smartrecruiters.com/v1/companies/${company}/postings?offset=${offset}&limit=${limit}`);
          if (apiRes.ok) {
            const data = await apiRes.json();
            const content = data.content || [];
            for (const j of content) {
              allJobs.push({
                externalId: String(j.id),
                title: j.name,
                url: `https://jobs.smartrecruiters.com/${company}/${j.id}`,
                location: j.location?.city ? `${j.location.city}, ${j.location.country}` : j.location?.country,
                department: j.department?.label || undefined,
                jobType: j.typeOfEmployment?.label || undefined,
                rawData: j,
              });
            }
            offset += limit;
            hasMore = content.length === limit && offset < data.totalFound;
          } else {
            hasMore = false;
          }
        } catch {
          hasMore = false;
        }
      }

      if (allJobs.length > 0) return allJobs;
    }

    // 2. Ashby API
    const ashbyMatch = url.match(/ashbyhq\.com\/([^/?#]+)/i);
    if (ashbyMatch && ashbyMatch[1]) {
      const org = ashbyMatch[1];
      try {
        const apiRes = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${org}`);
        if (apiRes.ok) {
          const data = await apiRes.json();
          if (data && Array.isArray(data.jobs)) {
            return data.jobs.map((j: any) => ({
              externalId: String(j.id),
              title: j.title,
              url: j.jobUrl || `https://jobs.ashbyhq.com/${org}/${j.id}`,
              location: j.locationName || undefined,
              department: j.departmentName || undefined,
              jobType: j.employmentType || undefined,
              rawData: j,
            }));
          }
        }
      } catch {}
    }

    // 3. Internal REST/JSON API Detection (e.g. Next.js / Nuxt / Custom endpoints like /api/jobs)
    try {
      const parsedUrl = new URL(url);
      const origin = parsedUrl.origin;

      // Extract candidate endpoints from HTML or script text
      const endpointMatches = Array.from(html.matchAll(/["'](\/(?:api|v1|v2)\/[a-zA-Z0-9_\-\/]+)["']/g))
        .map(m => m[1])
        .filter(ep => /\b(jobs|openings|careers|vacancies|positions)\b/i.test(ep));

      const candidateEndpoints = Array.from(new Set([
        ...endpointMatches,
        '/api/jobs',
        '/api/openings',
        '/api/careers',
        '/api/vacancies',
        '/api/positions',
        '/api/v1/jobs',
        '/jobs.json',
      ]));

      for (const endpoint of candidateEndpoints) {
        const targetApiUrl = `${origin}${endpoint}`;
        try {
          const res = await fetch(targetApiUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) JobPinglyBot/1.0',
              'Accept': 'application/json, text/plain, */*',
            },
            signal: AbortSignal.timeout(5000),
          });

          if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
            const json = await res.json();
            const rawItems = Array.isArray(json)
              ? json
              : (json.jobs || json.data || json.openings || json.positions || json.items || []);

            if (Array.isArray(rawItems) && rawItems.length > 0) {
              const jobs: NormalizedJob[] = [];
              for (const item of rawItems) {
                if (!item || typeof item !== 'object') continue;
                const title = item.title || item.name || item.jobTitle || item.position;
                if (!title || typeof title !== 'string' || title.length < 3) continue;

                let itemUrl = item.url || item.applyUrl || item.link || item.href;
                if (!itemUrl && item.id) {
                  // Attempt relative link resolution
                  itemUrl = `${origin}/careers/openings/${item.id}`;
                }
                if (!itemUrl) {
                  itemUrl = url;
                } else if (!itemUrl.startsWith('http')) {
                  itemUrl = new URL(itemUrl, origin).toString();
                }

                const location = item.city
                  ? (item.country ? `${item.city}, ${item.country}` : item.city)
                  : (item.location || item.address || undefined);

                jobs.push({
                  externalId: item.id ? String(item.id) : undefined,
                  title: title.trim(),
                  url: itemUrl,
                  location: typeof location === 'string' ? location.trim() : undefined,
                  department: item.organization || item.department || item.level || undefined,
                  jobType: item.level || item.jobType || item.employmentType || undefined,
                  rawData: item,
                });
              }

              if (jobs.length > 0) {
                return jobs;
              }
            }
          }
        } catch {
          // Ignore individual API endpoint probe failures
        }
      }
    } catch {
      // Ignore URL parsing errors
    }

    return [];
  },
};

