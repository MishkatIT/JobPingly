import { ATSAdapter, NormalizedJob } from '../types';

/**
 * Workday ATS Adapter
 * Detects and extracts jobs from Workday career sites (e.g., *.myworkdayjobs.com)
 * by querying Workday's direct CXS REST API (/wday/cxs/<tenant>/<site>/jobs).
 */
export const WorkdayAdapter: ATSAdapter = {
  name: 'workday',

  detect(url: string, html: string): boolean {
    const lowerUrl = url.toLowerCase();
    const lowerHtml = html.toLowerCase();
    return (
      lowerUrl.includes('myworkdayjobs.com') ||
      lowerHtml.includes('myworkdayjobs.com') ||
      lowerHtml.includes('wday/cxs')
    );
  },

  async extractJobs(url: string, html: string): Promise<NormalizedJob[]> {
    try {
      const parsedUrl = new URL(url);
      const host = parsedUrl.host; // e.g., "company.wd5.myworkdayjobs.com"
      const pathname = parsedUrl.pathname; // e.g., "/en-US/Careers" or "/Careers/job/Location/Title_R123"

      // Parse tenant and site name from pathname or URL
      // Workday path pattern: /<locale>/<siteName> or /<siteName>
      const pathSegments = pathname.split('/').filter(Boolean);
      let siteName = 'Careers';

      if (pathSegments.length > 0) {
        // If first segment is locale like en-US, take second segment as siteName
        if (/^[a-z]{2}(-[a-z]{2})?$/i.test(pathSegments[0]) && pathSegments.length > 1) {
          siteName = pathSegments[1];
        } else {
          siteName = pathSegments[0];
        }
      }

      // Infer tenant from subdomain (e.g. "nvidia.wd5.myworkdayjobs.com" -> tenant "nvidia")
      const tenantMatch = host.match(/^([^.]+)\./);
      const tenant = tenantMatch ? tenantMatch[1] : 'company';

      // Workday CXS REST API endpoint
      const apiUrl = `https://${host}/wday/cxs/${tenant}/${siteName}/jobs`;

      const allJobs: NormalizedJob[] = [];
      let offset = 0;
      const limit = 20;
      let hasMore = true;

      while (hasMore && offset < 200) {
        try {
          const res = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) JobPinglyBot/1.0',
            },
            body: JSON.stringify({
              appliedFacets: {},
              limit,
              offset,
              searchText: '',
            }),
            signal: AbortSignal.timeout(15000),
          });

          if (!res.ok) {
            break;
          }

          const data = await res.json();
          const jobPostings = data.jobPostings || [];

          if (jobPostings.length === 0) {
            hasMore = false;
            break;
          }

          for (const item of jobPostings) {
            const title = item.title || item.name;
            if (!title) continue;

            const externalPath = item.externalPath || '';
            const jobUrl = externalPath
              ? `https://${host}${externalPath.startsWith('/') ? '' : '/'}${externalPath}`
              : url;

            const location = item.locationsText || item.location || undefined;
            const externalId = item.bulletFields?.[0] || externalPath.split('_').pop() || undefined;

            allJobs.push({
              externalId: externalId ? String(externalId) : undefined,
              title: String(title).trim(),
              url: jobUrl,
              location: location ? String(location).trim() : undefined,
              jobType: item.timeType || item.employmentType || undefined,
              rawData: item,
            });
          }

          offset += limit;
          hasMore = offset < (data.total || 0) && jobPostings.length === limit;
        } catch (fetchErr) {
          console.warn(`[Workday Adapter] API fetch failed at offset ${offset}:`, (fetchErr as Error).message);
          hasMore = false;
        }
      }

      if (allJobs.length > 0) {
        return allJobs;
      }
    } catch (err: any) {
      console.warn('[Workday Adapter] Extraction exception:', err.message);
    }

    return [];
  },
};
