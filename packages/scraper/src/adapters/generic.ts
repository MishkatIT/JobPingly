import { ATSAdapter, NormalizedJob } from '../types';
import * as cheerio from 'cheerio';

function extractCleanDateString(text: string, prefixRegex: RegExp): string | undefined {
  if (!text) return undefined;
  const match = text.match(prefixRegex);
  if (!match || !match[1]) return undefined;

  let candidate = match[1].split('\n')[0].replace(/\s+/g, ' ').trim();

  // Strip trailing label words if captured
  candidate = candidate.replace(/\s*(?:deadline|posted|apply|location|department|experience|salary).*$/i, '').trim();

  // Strip leading label words if captured
  candidate = candidate.replace(/^(?:deadline|posted|published|closing date|apply by)\s*:?\s*/i, '').trim();

  // Validate candidate is a real date (contains month name or 4-digit year e.g. 2026)
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|\d{4})\b/i.test(candidate)) {
    return candidate;
  }
  return undefined;
}

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
              const locationStr = typeof item.jobLocation === 'string'
                ? item.jobLocation
                : item.jobLocation?.address?.addressLocality || item.jobLocation?.name;
              const validThrough = item.validThrough || item.expires || item.expirationDate;
              const datePosted = item.datePosted || item.publishedDate || item.dateCreated;

              jobs.push({
                externalId: item.identifier?.value || undefined,
                title: String(title).trim(),
                url: jobUrl,
                location: locationStr ? String(locationStr).trim() : undefined,
                jobType: item.employmentType ? String(item.employmentType) : undefined,
                rawData: {
                  ...item,
                  deadline: validThrough ? String(validThrough).trim() : undefined,
                  postedDate: datePosted ? String(datePosted).trim() : undefined,
                },
              });
            }
          }
        }
      } catch (e) {
        // Ignore JSON parse errors in script tags
      }
    });

    if (jobs.length === 0) {
      // 2. Generic HTML Links & Job Container Parsing
      $('a').each((_, el) => {
        const $a = $(el);
        const href = $a.attr('href');
        if (!href) return;

        const lowerHref = href.toLowerCase();

        // Check if href indicates a job posting link
        const isJobLink = lowerHref.includes('/job') ||
                          lowerHref.includes('/jobs/') ||
                          lowerHref.includes('/role') ||
                          lowerHref.includes('/roles/') ||
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

        // Extract title: Check inner header element (h1, h2, h3, h4, h5, .title, [class*="title"])
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
        if (['home', 'about us', 'careers', 'jobs', 'roles', 'login', 'contact', 'privacy', 'terms', 'see open roles', 'find your role'].includes(lowerTitle)) {
          return;
        }

        if (title.length < 3 || title.length > 150) return;

        // Extract metadata (location, job type, deadline, posted date) from container if present
        const $container = $a.closest('tr, li, article, div[class*="job"], div[class*="card"], div[class*="posting"]');
        const location = $container.find('[class*="location"], .location, span:contains("Dhaka"), span:contains("Remote")').first().text().trim() || undefined;

        const containerText = $container.text() || '';

        // Extract deadline date if explicitly written in card
        const deadline = extractCleanDateString(
          containerText,
          /(?:deadline|closing date|apply by|expires|last date|application deadline)\s*:?\s*([A-Za-z0-9\s,/-]{4,30})/i
        );

        // Extract posted date if explicitly written in card or <time> tag
        let postedDate: string | undefined = undefined;
        const timeTag = $container.find('time').first();
        if (timeTag.length > 0) {
          postedDate = timeTag.attr('datetime') || timeTag.text().trim();
        }
        if (!postedDate) {
          postedDate = extractCleanDateString(
            containerText,
            /(?:posted|date posted|published|posted on)\s*:?\s*([A-Za-z0-9\s,/-]{4,30})/i
          );
        }

        seenUrls.add(fullUrl);
        jobs.push({
          title,
          url: fullUrl,
          location: location ? location.replace(/\s+/g, ' ').trim() : undefined,
          rawData: {
            deadline,
            postedDate,
            location,
          },
        });
      });
    }

    // 3. Sub-page Detail Page Enrichment for missing deadlines or posted dates
    const enrichmentQueue = jobs.slice(0, 10);
    for (const j of enrichmentQueue) {
      if (j.url && j.url.startsWith('http') && (!j.rawData?.deadline || !j.rawData?.postedDate)) {
        try {
          const detailRes = await fetch(j.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) JobPinglyBot/1.0' },
            signal: AbortSignal.timeout(6000),
          });
          if (detailRes.ok) {
            const detailHtml = await detailRes.text();
            const $d = cheerio.load(detailHtml);

            if (!j.rawData?.deadline) {
              $d('*:contains("Deadline"), *:contains("deadline"), *:contains("Closing Date"), *:contains("Apply Before")').each((_, el) => {
                const text = $d(el).text().trim();
                const dDate = extractCleanDateString(
                  text,
                  /(?:deadline|closing date|apply by|expires|last date|application deadline)\s*:?\s*([A-Za-z0-9\s,/-]{4,30})/i
                );
                if (dDate && !j.rawData?.deadline) {
                  j.rawData = j.rawData || {};
                  j.rawData.deadline = dDate;
                }
              });
            }

            if (!j.rawData?.postedDate) {
              const timeTag = $d('time').first();
              let pDate = timeTag.length > 0 ? (timeTag.attr('datetime') || timeTag.text().trim()) : undefined;
              if (!pDate) {
                const detailText = $d('body').text() || '';
                pDate = extractCleanDateString(
                  detailText,
                  /(?:posted|date posted|published|posted on)\s*:?\s*([A-Za-z0-9\s,/-]{4,30})/i
                );
              }
              if (pDate) {
                j.rawData = j.rawData || {};
                j.rawData.postedDate = pDate;
              }
            }
          }
        } catch {
          // Subpage fetch timeout ignored
        }
      }
    }

    return jobs;
  },
};
