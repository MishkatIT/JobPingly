import { ATSAdapter, NormalizedJob } from '../types';
import * as cheerio from 'cheerio';

export const GenericAdapter: ATSAdapter = {
  name: 'generic',

  detect(): boolean {
    return true; // Fallback adapter
  },

  async extractJobs(url: string, html: string): Promise<NormalizedJob[]> {
    const $ = cheerio.load(html);
    const jobs: NormalizedJob[] = [];
    const seenUrls = new Set<string>();

    // 1. JSON-LD Structured Data extraction
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const text = $(el).html();
        if (!text) return;
        const data = JSON.parse(text);
        const items = Array.isArray(data) ? data : (data['@graph'] ? data['@graph'] : [data]);

        for (const item of items) {
          if (item && (item['@type'] === 'JobPosting' || item['@type'] === 'http://schema.org/JobPosting')) {
            const title = item.title;
            const jobUrl = item.url || url;
            if (title && !seenUrls.has(jobUrl)) {
              seenUrls.add(jobUrl);
              const location = typeof item.jobLocation === 'string'
                ? item.jobLocation
                : item.jobLocation?.address?.addressLocality || item.jobLocation?.name;

              jobs.push({
                externalId: item.identifier?.value || undefined,
                title: String(title).trim(),
                url: jobUrl,
                location: location ? String(location).trim() : undefined,
                jobType: item.employmentType ? String(item.employmentType) : undefined,
                rawData: item,
              });
            }
          }
        }
      } catch (e) {
        // Ignore JSON parse errors in script tags
      }
    });

    if (jobs.length > 0) return jobs;

    // 2. Generic HTML Links & Job Container Parsing
    $('a').each((_, el) => {
      const $a = $(el);
      const href = $a.attr('href');
      if (!href) return;

      const lowerHref = href.toLowerCase();

      // Check if href indicates a job posting link
      const isJobLink = lowerHref.includes('/job') ||
                        lowerHref.includes('/jobs/') ||
                        lowerHref.includes('/position') ||
                        lowerHref.includes('/opening') ||
                        lowerHref.includes('/vacancy') ||
                        lowerHref.includes('/careers/') ||
                        lowerHref.includes('gh_jid') ||
                        lowerHref.includes('jobid=');

      if (!isJobLink) return;

      let fullUrl = href;
      try {
        fullUrl = href.startsWith('http') ? href : new URL(href, url).toString();
      } catch {
        fullUrl = href;
      }

      if (seenUrls.has(fullUrl)) return;

      // Extract title:优先 Check inner header element (h1, h2, h3, h4, h5, .title, [class*="title"])
      let title = $a.find('h1, h2, h3, h4, h5, .title, [class*="title"]').first().text();
      if (!title) {
        // Fallback to parent container header if <a> is a button wrapper
        const $parent = $a.closest('tr, li, article, div[class*="job"], div[class*="card"], div[class*="posting"]');
        title = $parent.find('h1, h2, h3, h4, h5, .title, [class*="title"]').first().text() || $a.text();
      }

      // Collapse extra whitespace & newlines
      title = title.replace(/\s+/g, ' ').trim();

      // Clean common suffix buttons (e.g. "More Details", "Apply Now", "View Position")
      title = title
        .replace(/\s*(more details|apply now|view details|apply|details|read more)$/i, '')
        .trim();

      // Skip generic navigation links
      const lowerTitle = title.toLowerCase();
      if (['home', 'about us', 'careers', 'jobs', 'login', 'contact', 'privacy', 'terms', 'see open roles'].includes(lowerTitle)) {
        return;
      }

      if (title.length < 3 || title.length > 150) return;

      // Extract metadata (location, job type) from container if present
      const $container = $a.closest('tr, li, article, div[class*="job"], div[class*="card"], div[class*="posting"]');
      const location = $container.find('[class*="location"], .location, span:contains("Dhaka"), span:contains("Remote")').first().text().trim() || undefined;

      seenUrls.add(fullUrl);
      jobs.push({
        title,
        url: fullUrl,
        location: location ? location.replace(/\s+/g, ' ').trim() : undefined,
      });
    });

    return jobs;
  },
};
