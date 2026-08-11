import { NormalizedJob } from './types';
import * as cheerio from 'cheerio';
import { aiFallbackNormalize } from './aiFallback';

/**
 * Stage 4: Advanced Playwright & Dynamic Client-Side Browser Fallback
 * Handles JavaScript-rendered SPAs, infinite scroll, 'Load More' buttons, and multipage pagination.
 */
export async function runPlaywrightFallback(url: string): Promise<NormalizedJob[]> {
  try {
    // Dynamic runtime require to bypass Webpack static bundling when playwright is not installed
    const dynamicRequire = typeof eval !== 'undefined' ? eval('require') : null;
    if (dynamicRequire) {
      let playwright: any = null;
      try {
        playwright = dynamicRequire('playwright');
      } catch {
        playwright = null;
      }

      if (playwright) {
        const browser = await playwright.chromium.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {
          return page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        });

        // 1. Deep Infinite Scroll & 'Load More' Button Clicking (Up to 6 iterations)
        const LOAD_MORE_SELECTORS = [
          'button:has-text("Load More")',
          'button:has-text("Show More")',
          'button:has-text("View More")',
          'button:has-text("More Jobs")',
          'button:has-text("See More")',
          'button:has-text("View All")',
          'button:has-text("Show All")',
          'button:has-text("Explore Roles")',
          'a:has-text("Load More")',
          'a:has-text("Show More")',
          'a:has-text("View More Jobs")',
          '[class*="load-more"]',
          '[id*="load-more"]',
          '[aria-label*="Load more"]',
          '[aria-label*="Show more"]',
          '[data-testid*="load-more"]',
        ].join(', ');

        for (let i = 0; i < 6; i++) {
          // Scroll down to trigger lazy loading
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(1000);

          // Click any visible 'Load More' / 'View More' buttons
          try {
            const loadMoreBtn = await page.$(LOAD_MORE_SELECTORS);
            if (loadMoreBtn && (await loadMoreBtn.isVisible())) {
              await loadMoreBtn.click().catch(() => {});
              await page.waitForTimeout(1500);
            }
          } catch {
            // Ignore click errors if button becomes detached
          }
        }

        let combinedHtml = await page.content();
        const allJobs: NormalizedJob[] = [...parseDomForJobs(url, combinedHtml)];
        const seenUrls = new Set<string>();
        for (const j of allJobs) {
          if (j.url) seenUrls.add(j.url);
        }

        // 2. Multipage Pagination Crawling (Up to 5 pages)
        try {
          const paginationLinks: string[] = await page.$$eval(
            'a[href*="page="], a[href*="p="], a[href*="offset="], a.next, a:has-text("Next"), [aria-label="Next page"], [aria-label="Next"]',
            (elements: any[]) => elements.map((e: any) => e.href).filter(Boolean)
          );

          const uniquePageUrls = Array.from(new Set(paginationLinks)).slice(0, 5);

          for (const pageUrlItem of uniquePageUrls) {
            const pageUrlStr = String(pageUrlItem);
            if (pageUrlStr && pageUrlStr !== url && !pageUrlStr.includes('#')) {
              try {
                await page.goto(pageUrlStr, { waitUntil: 'domcontentloaded', timeout: 15000 });
                await page.waitForTimeout(1000);
                const subPageHtml = await page.content();
                const subJobs = parseDomForJobs(pageUrlStr, subPageHtml);

                for (const sj of subJobs) {
                  if (sj.url && !seenUrls.has(sj.url)) {
                    seenUrls.add(sj.url);
                    allJobs.push(sj);
                  }
                }
              } catch {
                // Ignore subpage navigation failures
              }
            }
          }
        } catch {
          // Ignore pagination discovery errors
        }

        await browser.close();
        return allJobs;
      }
    }
  } catch (e) {
    console.warn('[Playwright Fallback] Playwright execution skipped:', (e as Error).message);
  }

  return [];
}

export function parseDomForJobs(pageUrl: string, html: string): NormalizedJob[] {
  const $ = cheerio.load(html);
  const rawItems: any[] = [];

  // Extract job links and job card elements
  $('[class*="job"], [class*="career"], [class*="posting"], [class*="position"], [class*="opening"], [class*="vacancy"], tr:has(a), li:has(a)').each((_, el) => {
    const $el = $(el);
    const link = $el.find('a').first();
    const title = $el.find('h1, h2, h3, h4, h5, .title, [class*="title"]').first().text().trim() || link.text().trim();
    const href = link.attr('href') || $el.attr('href');
    const location = $el.find('[class*="location"], .location, span:contains("Dhaka"), span:contains("Remote")').first().text().trim();

    const containerText = $el.text() || '';
    let deadline: string | undefined = undefined;
    const deadlineMatch = containerText.match(/(?:deadline|closing date|apply by|expires|last date|applyLastDate)\s*:\s*([A-Za-z0-9\s,/-]{4,30})/i);
    if (deadlineMatch && deadlineMatch[1]) {
      deadline = deadlineMatch[1].trim();
    }

    let postedDate: string | undefined = undefined;
    const timeTag = $el.find('time').first();
    if (timeTag.length > 0) {
      postedDate = timeTag.attr('datetime') || timeTag.text().trim();
    }
    if (!postedDate) {
      const postedMatch = containerText.match(/(?:posted|date posted|published|posted on|postedAt)\s*:\s*([A-Za-z0-9\s,/-]{4,30})/i);
      if (postedMatch && postedMatch[1]) {
        postedDate = postedMatch[1].trim();
      }
    }

    if (title && title.length > 2 && title.length < 150) {
      let fullUrl = href || pageUrl;
      try {
        if (fullUrl && !fullUrl.startsWith('http')) {
          fullUrl = new URL(fullUrl, pageUrl).toString();
        }
      } catch {
        fullUrl = pageUrl;
      }

      rawItems.push({ title, href: fullUrl, location, deadline, postedDate });
    }
  });

  return aiFallbackNormalize(rawItems, pageUrl);
}
