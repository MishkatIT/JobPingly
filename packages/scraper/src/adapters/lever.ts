import { ATSAdapter, NormalizedJob } from '../types';
import * as cheerio from 'cheerio';

export const LeverAdapter: ATSAdapter = {
  name: 'lever',

  detect(url: string, html: string): boolean {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('lever.co')) {
      return true;
    }
    return html.includes('jobs.lever.co') || html.includes('lever-job');
  },

  async extractJobs(url: string, html: string): Promise<NormalizedJob[]> {
    // Try to extract company name from URL (e.g., jobs.lever.co/netflix -> netflix)
    const match = url.match(/jobs\.lever\.co\/([^/?#]+)/i);
    if (match && match[1]) {
      const company = match[1];
      try {
        const apiUrl = `https://api.lever.co/v0/postings/${company}?mode=json`;
        const res = await fetch(apiUrl, { headers: { 'User-Agent': 'JobPingly-Bot/1.0' } });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            return data.map((j: any) => ({
              externalId: String(j.id),
              title: j.text || 'Untitled Position',
              url: j.hostedUrl || `https://jobs.lever.co/${company}/${j.id}`,
              location: j.categories?.location || j.country || undefined,
              department: j.categories?.department || undefined,
              jobType: j.categories?.commitment || undefined,
              rawData: j,
            }));
          }
        }
      } catch (err) {
        // Fallback to HTML
      }
    }

    // HTML fallback
    const $ = cheerio.load(html);
    const jobs: NormalizedJob[] = [];

    $('.posting').each((_, el) => {
      const $el = $(el);
      const link = $el.find('a.posting-title, a').first();
      const title = $el.find('h5, .posting-title h5, a').first().text().trim();
      const href = link.attr('href');
      const location = $el.find('.location, .sort-by-location').text().trim();
      const department = $el.find('.department, .sort-by-team').text().trim();

      if (title) {
        const jobUrl = href ? (href.startsWith('http') ? href : new URL(href, url).toString()) : url;
        const extMatch = jobUrl.match(/lever\.co\/[^/]+\/([a-f0-9-]+)/i);
        jobs.push({
          externalId: extMatch ? extMatch[1] : undefined,
          title,
          url: jobUrl,
          location: location || undefined,
          department: department || undefined,
        });
      }
    });

    return jobs;
  },
};
