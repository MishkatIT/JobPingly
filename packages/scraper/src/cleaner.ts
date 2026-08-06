import * as cheerio from 'cheerio';

/**
 * Cleans scraped career page HTML before hashing and sending to Ollama.
 * Strips script, style, noscript, svg, navigation, footer, repetitive menus, tracking, and comments.
 * Preserves text & structures relevant to job extraction.
 */
export function cleanCareerPageContent(html: string): string {
  if (!html) return '';

  const $ = cheerio.load(html);

  // 1. Remove non-content & structural noise elements
  $(
    'script, style, noscript, svg, iframe, canvas, nav, footer, header, ' +
    'form, input, button, select, [role="navigation"], [role="banner"], ' +
    '[role="contentinfo"], .nav, .footer, .header, .sidebar, .menu, ' +
    '#nav, #footer, #header, #sidebar, .cookie-banner, .gdpr, .social-share'
  ).remove();

  // 2. Remove comments
  $('*').contents().filter((_, el) => el.type === 'comment').remove();

  // 3. Extract text from remaining DOM structure while preserving structural text
  let bodyText = $('body').text() || $.text();

  // 4. Collapse whitespace
  bodyText = bodyText
    .replace(/\t/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();

  // Cap max text length to avoid token limits (default ~25,000 characters)
  const MAX_CONTENT_LENGTH = 25000;
  if (bodyText.length > MAX_CONTENT_LENGTH) {
    bodyText = bodyText.substring(0, MAX_CONTENT_LENGTH) + '\n[Content Truncated]';
  }

  return bodyText;
}
