import * as cheerio from 'cheerio';

/**
 * Cleans scraped career page HTML before hashing and sending to Ollama.
 * Strips script, style, noscript, svg, navigation, footer, repetitive menus, tracking, and comments.
 * Preserves text & structures relevant to job extraction, including embedded Next.js JSON data scripts.
 */
export function cleanCareerPageContent(html: string): string {
  if (!html) return '';

  const $ = cheerio.load(html);

  // 0. Extract embedded JSON script payloads (e.g. __NEXT_DATA__, ld+json, or React flight data)
  const scriptPayloads: string[] = [];
  $('script').each((_, el) => {
    const text = $(el).html() || '';
    const id = $(el).attr('id');
    const type = $(el).attr('type');

    if (
      id === '__NEXT_DATA__' ||
      type === 'application/ld+json' ||
      type === 'application/json' ||
      text.includes('__next_f') ||
      text.includes('"title"') ||
      text.includes('openings') ||
      text.includes('deadline') ||
      text.includes('posted') ||
      text.includes('applyLastDate') ||
      text.includes('datePosted')
    ) {
      if (text.length > 10 && text.length < 50000) {
        scriptPayloads.push(text);
      }
    }
  });

  // 1. Remove strictly non-text code/syntax & non-content media (script, style, svg, iframe, etc.)
  // Note: We DO NOT remove text-bearing elements (like nav, footer, header, sidebar, form, menu) to ensure no textual job data is removed.
  $(
    'script, style, noscript, svg, iframe, canvas, ' +
    '.cookie-banner, .gdpr, .social-share'
  ).remove();

  // 2. Remove HTML comments (syntax noise)
  $('*').contents().filter((_, el) => el.type === 'comment').remove();

  // 3. Extract text from remaining DOM structure while preserving structural text
  let bodyText = $('body').text() || $.text();

  // Append extracted script payloads if body text is sparse
  if (scriptPayloads.length > 0) {
    bodyText += '\n\n[Embedded Script Data]\n' + scriptPayloads.join('\n');
  }

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

