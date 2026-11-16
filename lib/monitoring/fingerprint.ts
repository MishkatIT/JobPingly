import crypto from 'node:crypto';
import type { JobKeys } from './types';

/**
 * Job identity.
 *
 * A posting is recognised across scans by up to three keys, strongest first:
 *
 *   ext:  the ATS's own id for the posting
 *   url:  the posting's canonical URL
 *   tl:   normalised title + location
 *
 * The strongest key available becomes the stored fingerprint. The weaker keys
 * are kept as fallbacks so that a posting is still recognised when the strong
 * key changes, which happens whenever a company migrates ATS, a site
 * restructures its URLs, or extraction for a page moves from one adapter to
 * another. Without the fallbacks every such change re-announced the entire
 * job board as "new".
 *
 * The `ext:` and `url:` hashes are byte-for-byte compatible with the keys
 * written before v2, so existing rows keep matching after the upgrade.
 */

function hash(input: string): string {
  return crypto.createHash('sha256').update(input.toLowerCase().trim()).digest('hex').substring(0, 24);
}

export function externalIdKey(externalId: string | number | null | undefined): string | null {
  if (externalId === null || externalId === undefined) return null;
  const id = String(externalId).trim();
  if (!id) return null;
  // Legacy format was `${company}|${id}` with an empty company.
  return `ext:${hash(`|${id}`)}`;
}

const TRACKING_PARAM = /^(utm_|gh_src$|source$|src$|ref$|referrer$|lever-source|lever-origin|fbclid$|gclid$|trk$|trackingid$)/i;

/** Canonical form of a job URL for identity purposes. Returns null for unusable URLs. */
export function canonicalJobUrl(jobUrl: string | null | undefined, pageUrl?: string | null): string | null {
  if (!jobUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(String(jobUrl).trim(), pageUrl || undefined);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  for (const key of Array.from(parsed.searchParams.keys())) {
    if (TRACKING_PARAM.test(key)) parsed.searchParams.delete(key);
  }
  const search = parsed.searchParams.toString();
  const clean = parsed.origin + parsed.pathname + (search ? `?${search}` : '');

  // A link back to the listing page (or the site root) identifies nothing.
  const strip = (value: string) => value.replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase();
  if (parsed.pathname === '/' || parsed.pathname === '') {
    if (!search) return null;
  }
  if (pageUrl && strip(clean) === strip(pageUrl) && !search) return null;
  return clean;
}

export function urlKey(jobUrl: string | null | undefined, pageUrl?: string | null): string | null {
  const canonical = canonicalJobUrl(jobUrl, pageUrl);
  return canonical ? `url:${hash(canonical)}` : null;
}

/** Lower-cases, strips punctuation and noise words that vary between scrapes. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/\((?:m\/f\/d|m\/w\/d|f\/m\/d|all genders|remote|hybrid|on-?site)\)/g, ' ')
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeLocation(location: string | null | undefined): string {
  if (!location) return '';
  return location
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titleLocationKey(title: string, location: string | null | undefined): string {
  return `tl:${hash(`${normalizeTitle(title)}|${normalizeLocation(location)}`)}`;
}

export function buildJobKeys(
  job: { externalId?: string | number | null; url?: string | null; title: string; location?: string | null },
  pageUrl?: string | null,
): JobKeys {
  const ext = externalIdKey(job.externalId);
  const url = urlKey(job.url, pageUrl);
  const titleLocation = titleLocationKey(job.title, job.location);
  return { primary: ext ?? url ?? titleLocation, ext, url, titleLocation };
}

/** Stable hash of the attributes a user would consider a meaningful change. */
export function contentHashOf(fields: Record<string, unknown>): string {
  const canonical = Object.keys(fields)
    .sort()
    .map(key => `${key}=${fields[key] === null || fields[key] === undefined ? '' : String(fields[key]).replace(/\s+/g, ' ').trim()}`)
    .join('\u001f');
  return crypto.createHash('sha256').update(canonical).digest('hex').substring(0, 32);
}

/** Hash of an entire scan result; equal hashes mean nothing on the board changed. */
export function resultSetHash(jobs: { keys: JobKeys; contentHash: string }[]): string {
  const lines = jobs.map(job => `${job.keys.primary}:${job.contentHash}`).sort();
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
}
