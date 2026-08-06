import { ATSAdapter, NormalizedJob } from '../types';
import * as cheerio from 'cheerio';

export const GreenhouseAdapter: ATSAdapter = {
  name: 'greenhouse',

  detect(url: string, html: string): boolean {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('greenhouse.io') || lowerUrl.includes('gh_jid')) {
      return true;
    }
    return html.includes('boards.greenhouse.io') || html.includes('id="grnhse_app"');
  },

  async extractJobs(url: string, html: string): Promise<NormalizedJob[]> {
    // Try to extract board token from URL (e.g. boards.greenhouse.io/stripe -> stripe)
    const match = url.match(/boards\.greenhouse\.io\/([^/?#]+)/i);
    if (match && match[1]) {
      const boardToken = match[1];
      try {
        const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`;
        const res = await fetch(apiUrl, { headers: { 'User-Agent': 'JobPingly-Bot/1.0' } });
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.jobs)) {
            return data.jobs.map((j: any) => ({
              externalId: String(j.id),
              title: j.title || 'Untitled Position',
              url: j.absolute_url || `https://boards.greenhouse.io/${boardToken}/jobs/${j.id}`,
              location: j.location?.name || 'Remote / Unspecified',
              department: j.departments?.[0]?.name || undefined,
              rawData: j,
            }));
          }
        }
      } catch (err) {
        // Fallback to HTML parsing if API fails
      }
    }

    // HTML Cheerio fallback for Greenhouse pages
    const $ = cheerio.load(html);
    const jobs: NormalizedJob[] = [];

    $('.opening, .job-row, [data-mapped-department]').each((_, el) => {
      const $el = $(el);
      const link = $el.find('a').first();
      const title = link.text().trim() || $el.find('.title, h3, h4').text().trim();
      const href = link.attr('href');
      const location = $el.find('.location').text().trim();

      if (title) {
        const jobUrl = href ? (href.startsWith('http') ? href : new URL(href, url).toString()) : url;
        const externalIdMatch = jobUrl.match(/gh_jid=(\d+)|jobs\/(\d+)/);
        jobs.push({
          externalId: externalIdMatch ? (externalIdMatch[1] || externalIdMatch[2]) : undefined,
          title,
          url: jobUrl,
          location: location || undefined,
        });
      }
    });

    return jobs;
  },
};
