import { isSafeHref } from './ssrf';

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

/**
 * Escapes a value for interpolation into HTML text or a double-quoted
 * attribute. Every dynamic value placed in an email template MUST pass
 * through this (or `safeUrl` for hrefs): job titles and company names come
 * from scraped pages, and user names come from sign-up forms.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"'`]/g, char => ENTITIES[char]);
}

/** Returns an escaped http(s) URL, or the fallback when the value is not a safe link. */
export function safeUrl(value: unknown, fallback = '#'): string {
  return isSafeHref(value) ? escapeHtml(value) : escapeHtml(fallback);
}

// Control characters, invisible format characters (zero-width, bidi overrides,
// byte-order mark) and the Unicode line/paragraph separators.
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/** Removes control and invisible characters and collapses whitespace; for single-line text. */
export function cleanText(value: unknown, maxLength = 200): string {
  if (typeof value !== 'string') return '';
  return value.replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/** Converts HTML to readable plain text (used for job descriptions). */
export function htmlToText(html: unknown, maxLength = 20_000): string {
  if (typeof html !== 'string' || !html) return '';
  const decoded = html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  return decoded
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|ul|ol)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return n > 31 && n < 0x10ffff ? String.fromCodePoint(n) : ' ';
    })
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}
