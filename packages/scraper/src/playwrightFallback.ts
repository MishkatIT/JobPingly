import { NormalizedJob } from './types';
import * as cheerio from 'cheerio';
import { aiFallbackNormalize } from './aiFallback';

/**
 * Stage 4: Playwright & Dynamic Client-Side Browser Fallback
 * Handles JavaScript-rendered SPAs, infinite scroll, and 'Load More' buttons.
 * Uses runtime dynamic require to avoid Webpack compile-time module resolution errors.
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
        const browser = await playwright.chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });

        // Scroll to trigger lazy loaded jobs
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(1000);

          // Click 'Load More' or 'View All Jobs' buttons if present
          const loadMoreBtn = await page.$('button:has-text("Load More"), button:has-text("View All"), button:has-text("More Jobs"), a:has-text("Load More")');
          if (loadMoreBtn) {
            await loadMoreBtn.click().catch(() => {});
            await page.waitForTimeout(1500);
          }
        }

        const content = await page.content();
        await browser.close();

        return parseDomForJobs(url, content);
      }
    }
  } catch (e) {
    console.warn('[Playwright Fallback] Playwright runtime execution skipped:', (e as Error).message);
  }

  return [];
}

export function parseDomForJobs(pageUrl: string, html: string): NormalizedJob[] {
  const $ = cheerio.load(html);
  const rawItems: any[] = [];

  // Extract job links and job card elements
  $('[class*="job"], [class*="career"], [class*="posting"], [class*="position"], [data-job-id]').each((_, el) => {
    const $el = $(el);
    const title = $el.find('h1, h2, h3, h4, h5, .title, [class*="title"], a').first().text().trim();
    const href = $el.find('a').attr('href') || $el.attr('href');
    const location = $el.find('[class*="location"], .location').text().trim();

    if (title && title.length > 2) {
      rawItems.push({ title, href, location });
    }
  });

  return aiFallbackNormalize(rawItems, pageUrl);
}
