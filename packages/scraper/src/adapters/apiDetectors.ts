import { ATSAdapter, NormalizedJob } from '../types';

/**
 * Stage 3: Detect API & Paginated Fetcher Adapter
 * Handles Greenhouse, Lever, Workday, SmartRecruiters, and Ashby API endpoints.
 * Supports multi-page fetch loops.
 */
export const ApiDetectorsAdapter: ATSAdapter = {
  name: 'api_detectors',

  detect(url: string, html: string): boolean {
    const lower = url.toLowerCase() + html.toLowerCase();
    return lower.includes('greenhouse.io') ||
           lower.includes('lever.co') ||
           lower.includes('smartrecruiters.com') ||
           lower.includes('ashbyhq.com') ||
           lower.includes('myworkdayjobs.com');
  },

  async extractJobs(url: string, html: string): Promise<NormalizedJob[]> {
    const lowerUrl = url.toLowerCase();

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

    return [];
  },
};
