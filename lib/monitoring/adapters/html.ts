import * as cheerio from 'cheerio';
import type { AdapterResult, RawJob, SourceAdapter } from '../types';

/**
 * Extractors for career pages that are not backed by a recognised ATS API.
 * Tried in order of reliability:
 *
 *   structured_data  schema.org JobPosting JSON-LD
 *   embedded_json    job arrays inside __NEXT_DATA__ / application/json scripts
 *   generic_html     link and container heuristics
 *
 * Two helpers support JSON sources: `extractJobsFromJson` reads postings out
 * of an arbitrary JSON document (a feed someone added directly, or a site's
 * own jobs endpoint), and `findReferencedJobEndpoints` finds such endpoints
 * when the page itself points to them.
 */

type Json = Record<string, unknown>;

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function str(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  return null;
}

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// schema.org JobPosting
// ---------------------------------------------------------------------------

function isJobPosting(node: Json): boolean {
  return asArray(node['@type'] as string | string[]).some(type => /(^|\/)JobPosting$/i.test(String(type)));
}

function collectJobPostings(node: unknown, out: Json[], depth = 0): void {
  if (!node || typeof node !== 'object' || depth > 6) return;
  if (Array.isArray(node)) {
    for (const item of node) collectJobPostings(item, out, depth + 1);
    return;
  }
  const object = node as Json;
  if (isJobPosting(object)) {
    out.push(object);
    return;
  }
  for (const key of ['@graph', 'itemListElement', 'item', 'mainEntity', 'hasPart']) {
    if (object[key]) collectJobPostings(object[key], out, depth + 1);
  }
}

function jsonLdLocation(posting: Json): string | null {
  const parts = asArray(posting.jobLocation as Json | Json[]).map(location => {
    if (typeof location === 'string') return location;
    const address = (location?.address ?? location) as Json | string | undefined;
    if (typeof address === 'string') return address;
    const country = address?.addressCountry;
    return [str(address?.addressLocality), str(address?.addressRegion), typeof country === 'object' && country ? str((country as Json).name) : str(country)]
      .filter(Boolean)
      .join(', ');
  });
  const text = parts.filter(Boolean).join('; ');
  return text || str((posting.applicantLocationRequirements as Json)?.name) || null;
}

function jsonLdSalary(posting: Json): Pick<RawJob, 'salaryText' | 'salaryMin' | 'salaryMax' | 'salaryCurrency'> {
  const base = posting.baseSalary as Json | string | number | undefined;
  if (!base) return {};
  if (typeof base === 'string' || typeof base === 'number') return { salaryText: String(base) };
  const value = base.value as Json | number | string | undefined;
  const currency = str(base.currency);
  if (typeof value === 'object' && value) {
    const min = Number(value.minValue ?? value.value);
    const max = Number(value.maxValue);
    const unit = str(value.unitText);
    return {
      salaryMin: Number.isFinite(min) && min > 0 ? min : null,
      salaryMax: Number.isFinite(max) && max > 0 ? max : null,
      salaryCurrency: currency,
      salaryText: [currency, Number.isFinite(min) && min > 0 ? min : null, Number.isFinite(max) && max > 0 ? `- ${max}` : null, unit ? `per ${unit.toLowerCase()}` : null]
        .filter(Boolean)
        .join(' '),
    };
  }
  return value !== undefined ? { salaryText: `${currency ?? ''} ${value}`.trim(), salaryCurrency: currency } : {};
}

export function extractJsonLdJobs(html: string, pageUrl: string): RawJob[] {
  const $ = cheerio.load(html);
  const postings: Json[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const text = $(element).contents().text();
    if (!text || text.length > 3_000_000) return;
    try {
      collectJobPostings(JSON.parse(text), postings);
    } catch {
      // Malformed JSON-LD is common; ignore the block.
    }
  });

  return postings
    .map((posting): RawJob | null => {
      const title = str(posting.title) ?? str(posting.name);
      if (!title) return null;
      const identifier = posting.identifier as Json | string | undefined;
      const remote = asArray(posting.jobLocationType as string | string[]).some(type => /telecommute/i.test(String(type)));
      return {
        externalId: typeof identifier === 'object' && identifier ? str(identifier.value) : str(identifier),
        title,
        url: str(posting.url) ?? pageUrl,
        location: jsonLdLocation(posting),
        department: str(posting.occupationalCategory) ?? str(posting.industry),
        jobType: asArray(posting.employmentType as string | string[]).map(String).join(', ').replace(/_/g, ' ') || null,
        workplaceType: remote ? 'remote' : null,
        description: str(posting.description),
        postedAt: str(posting.datePosted),
        deadlineAt: str(posting.validThrough),
        ...jsonLdSalary(posting),
      };
    })
    .filter((job): job is RawJob => job !== null);
}

// ---------------------------------------------------------------------------
// JSON documents (embedded page data, feeds, site APIs)
// ---------------------------------------------------------------------------

const TITLE_KEYS = ['title', 'jobTitle', 'job_title', 'positionTitle', 'position', 'name', 'text'];
const JOB_SIGNAL_KEYS = [
  'location', 'locations', 'department', 'team', 'employmentType', 'employment_type', 'jobType', 'job_type',
  'applyUrl', 'apply_url', 'applicationUrl', 'jobId', 'job_id', 'requisitionId', 'req_id', 'commitment',
  'workplaceType', 'remote', 'hostedUrl', 'absolute_url', 'seniority', 'office', 'city', 'level', 'deadline',
  'jobDetails', 'vacancy', 'experience',
];
const JOB_PATH_HINT = /job|opening|position|career|vacanc|posting|role|opportunit|requisition/i;

interface Candidate {
  items: Json[];
  score: number;
}

function findJobArrays(node: unknown, path: string, out: Candidate[], depth = 0): void {
  if (!node || typeof node !== 'object' || depth > 12) return;

  if (Array.isArray(node)) {
    const objects = node.filter((item): item is Json => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
    if (objects.length >= 1 && objects.length === node.length) {
      const withTitle = objects.filter(item => TITLE_KEYS.some(key => typeof item[key] === 'string' && (item[key] as string).length > 2));
      if (withTitle.length >= Math.max(1, objects.length * 0.8)) {
        const signalCount = JOB_SIGNAL_KEYS.filter(key => objects.some(item => item[key] !== undefined && item[key] !== null)).length;
        const pathHint = JOB_PATH_HINT.test(path);
        // Without a telling path we need strong evidence in the items
        // themselves, otherwise blog posts and nav menus look like jobs.
        if ((pathHint && signalCount >= 1) || signalCount >= 2) {
          out.push({ items: objects, score: objects.length * (signalCount + (pathHint ? 2 : 0)) });
        }
      }
    }
    for (let index = 0; index < Math.min(node.length, 50); index++) findJobArrays(node[index], path, out, depth + 1);
    return;
  }

  for (const [key, value] of Object.entries(node as Json)) {
    if (value && typeof value === 'object') findJobArrays(value, `${path}.${key}`, out, depth + 1);
  }
}

function pick(item: Json, keys: string[]): unknown {
  for (const key of keys) {
    if (item[key] !== undefined && item[key] !== null && item[key] !== '') return item[key];
  }
  return undefined;
}

function flattenText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    const parts = value.map(flattenText).filter(Boolean);
    return parts.length ? parts.join('; ') : null;
  }
  if (value && typeof value === 'object') {
    const object = value as Json;
    return (
      flattenText(pick(object, ['name', 'label', 'title', 'text', 'fullLocation', 'displayName'])) ??
      ([object.city, object.region ?? object.state, object.country].map(flattenText).filter(Boolean).join(', ') || null)
    );
  }
  return null;
}

/** Maps the most job-like array found onto RawJob. */
function jobsFromCandidates(candidates: Candidate[], pageUrl: string): RawJob[] {
  if (candidates.length === 0) return [];
  const best = candidates.sort((a, b) => b.score - a.score)[0];
  const origin = new URL(pageUrl).origin;

  return best.items
    .map((item): RawJob | null => {
      const title = flattenText(pick(item, TITLE_KEYS));
      if (!title) return null;
      const id = pick(item, ['id', 'jobId', 'job_id', 'requisitionId', 'req_id', 'shortcode', 'slug']);
      let url = flattenText(pick(item, ['url', 'hostedUrl', 'absolute_url', 'applyUrl', 'apply_url', 'applicationUrl', 'link', 'href', 'jobUrl', 'path']));
      if (url && url.startsWith('/')) url = origin + url;
      const remote = item.remote === true || item.isRemote === true;
      return {
        externalId: typeof id === 'string' || typeof id === 'number' ? String(id) : null,
        title,
        url,
        location: flattenText(pick(item, ['location', 'locations', 'office', 'city', 'locationName'])),
        department: flattenText(pick(item, ['department', 'team', 'category', 'departmentName', 'organization'])),
        jobType: flattenText(pick(item, ['employmentType', 'employment_type', 'jobType', 'job_type', 'commitment', 'type'])),
        workplaceType: remote ? 'remote' : null,
        description: flattenText(pick(item, ['descriptionPlain', 'description', 'jobDetails', 'shortDescription', 'summary', 'excerpt'])),
        salaryText: flattenText(pick(item, ['salary', 'compensation', 'salaryRange'])),
        postedAt: flattenText(pick(item, ['postedAt', 'publishedAt', 'published_at', 'datePosted', 'createdAt', 'created_at', 'postedDate'])),
        deadlineAt: flattenText(pick(item, ['deadline', 'closingDate', 'closing_date', 'validThrough', 'applyLastDate', 'expiresAt'])),
        extra: typeof item.level === 'string' ? { level: item.level } : undefined,
      };
    })
    .filter((job): job is RawJob => job !== null);
}

export function extractEmbeddedJsonJobs(html: string, pageUrl: string): RawJob[] {
  const $ = cheerio.load(html);
  const candidates: Candidate[] = [];

  $('script#__NEXT_DATA__, script[type="application/json"]').each((_, element) => {
    const text = $(element).contents().text();
    if (!text || text.length < 50 || text.length > 5_000_000) return;
    try {
      findJobArrays(JSON.parse(text), '', candidates);
    } catch {
      // Not JSON after all.
    }
  });

  return jobsFromCandidates(candidates, pageUrl);
}

/**
 * Reads postings out of an arbitrary JSON document. `pathHint` lets a document
 * served from a path such as /api/jobs count as job data even when its items
 * carry little beyond a title.
 */
export function extractJobsFromJson(data: unknown, pageUrl: string, pathHint = ''): RawJob[] {
  const candidates: Candidate[] = [];
  findJobArrays(data, pathHint, candidates);
  return jobsFromCandidates(candidates, pageUrl);
}

const ENDPOINT_REFERENCE = /["'`]((?:https?:\/\/[^"'`\s]+)?\/(?:api|wp-json|v\d)\/[A-Za-z0-9_\-/.]*(?:jobs?|openings?|careers?|vacanc(?:y|ies)|positions?|postings?)[A-Za-z0-9_\-/.]*)["'`]/gi;

/**
 * Same-origin JSON endpoints that the page itself refers to and that look
 * like a jobs API (for example "/api/jobs" in an inline script). Only
 * endpoints the site's own front end mentions are returned; nothing is
 * guessed.
 */
export function findReferencedJobEndpoints(html: string, pageUrl: string, limit = 2): string[] {
  const origin = new URL(pageUrl).origin;
  const found = new Set<string>();
  for (const match of html.matchAll(ENDPOINT_REFERENCE)) {
    try {
      const resolved = new URL(match[1], pageUrl);
      if (resolved.origin !== origin) continue;
      if (/\.(js|css|map|png|jpe?g|svg|woff2?)$/i.test(resolved.pathname)) continue;
      found.add(resolved.toString());
      if (found.size >= limit) break;
    } catch {
      // not a URL
    }
  }
  return Array.from(found);
}

// ---------------------------------------------------------------------------
// Generic HTML heuristics
// ---------------------------------------------------------------------------

const JOB_HREF = /\/(jobs?|careers?|roles?|positions?|openings?|vacanc(?:y|ies)|opportunit(?:y|ies)|postings?|apply|requisitions?)\/[^/?#]+|[?&](gh_jid|jobid|job_id|jid|vacancy|position_id)=/i;
const NOT_A_JOB_HREF = /\/(search|category|categories|departments?|teams?|locations?|offices?|benefits|culture|about|faq|blog|news|events|login|signin|signup|register|alerts?|saved|privacy|terms)(\/|$|\?)|\.(pdf|png|jpe?g|svg|zip)(\?|$)/i;
const CONTAINER = 'tr, li, article, [class*="job"], [class*="posting"], [class*="opening"], [class*="position"], [class*="vacanc"], [class*="career"], [class*="card"], [class*="role"]';
const HEADING = 'h1, h2, h3, h4, h5, h6, [class*="title"], [class*="name"], strong';
const ANCESTOR_HEADING = 'h1, h2, h3, h4, h5, h6, [class*="heading-title"], [class*="job-title"], [class*="title"]';
const ACTION_TEXT = /^(apply|apply now|apply here|apply today|apply for this job|view|view job|view role|view details|view position|details|job details|learn more|read more|see more|see details|more info|more details|open)$/i;
const CLOSED_TEXT = /^(closed|expired|position filled|filled|no longer available|applications closed)$/i;

/** "/jobs/product-manager-1313dcb9" -> "Product Manager". Null when the slug is not word-like. */
function titleFromSlug(url: URL): string | null {
  let segment = url.pathname.split('/').filter(Boolean).pop() ?? '';
  try {
    segment = decodeURIComponent(segment);
  } catch {
    // keep the raw segment
  }
  const words = segment
    .replace(/\.[a-z]{2,5}$/i, '')
    .split(/[-_+]+/)
    .filter(word => /^[a-z][a-z.#+]*$/i.test(word) && !/^[a-f0-9]{6,}$/i.test(word));
  if (words.length < 2) return null;
  return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function dateAfter(text: string, label: RegExp): string | null {
  const match = label.exec(text);
  if (!match?.[1]) return null;
  const candidate = squash(match[1].split('\n')[0]);
  return /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\d{4}|\d{1,2}[/.-]\d{1,2}/i.test(candidate) ? candidate : null;
}

function isJobHref(href: string, pageUrl: string): URL | null {
  try {
    const url = new URL(href, pageUrl);
    if (!/^https?:$/.test(url.protocol)) return null;
    const comparable = `${url.pathname}${url.search}`;
    return JOB_HREF.test(comparable) && !NOT_A_JOB_HREF.test(comparable) ? url : null;
  } catch {
    return null;
  }
}

export function extractGenericHtmlJobs(html: string, pageUrl: string): RawJob[] {
  const $ = cheerio.load(html);
  const jobs: RawJob[] = [];
  const seen = new Set<string>();
  const page = new URL(pageUrl);

  $('a[href]').each((_, element) => {
    const anchor = $(element);
    const href = (anchor.attr('href') ?? '').trim();
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) return;
    // Site chrome is never a posting.
    if (anchor.closest('nav, footer, header, [role="navigation"], [class*="breadcrumb"], [class*="pagination"]').length > 0) return;

    const resolved = isJobHref(href, pageUrl);
    if (!resolved) return;
    // The listing page linking to itself (e.g. "View all jobs").
    if (resolved.origin === page.origin && resolved.pathname.replace(/\/+$/, '') === page.pathname.replace(/\/+$/, '') && !resolved.search) return;
    const full = resolved.toString();
    if (seen.has(full)) return;

    const anchorText = squash(anchor.text());
    // A "Closed" badge that links to the posting means the posting is closed.
    if (CLOSED_TEXT.test(anchorText)) {
      seen.add(full);
      return;
    }

    let container = anchor.closest(CONTAINER);
    let title = squash(anchor.find(HEADING).first().text() || anchorText);

    if (title.length < 4 || ACTION_TEXT.test(title)) {
      // The link is an "Apply" button. Walk up until an ancestor holds a
      // heading, stopping as soon as an ancestor holds other job links too:
      // beyond that point a heading would belong to several postings.
      title = '';
      let node = anchor.parent();
      for (let depth = 0; depth < 7 && node.length > 0 && !node.is('body'); depth++) {
        const links = new Set<string>();
        node.find('a[href]').each((__, other) => {
          const otherUrl = isJobHref($(other).attr('href') ?? '', pageUrl);
          if (otherUrl) links.add(otherUrl.toString());
        });
        if (links.size > 1) break;
        const heading = squash(node.find(ANCESTOR_HEADING).first().text());
        if (heading.length >= 4 && heading.length <= 140 && !ACTION_TEXT.test(heading) && !CLOSED_TEXT.test(heading)) {
          title = heading;
          container = node;
          break;
        }
        node = node.parent();
      }
      if (!title) title = titleFromSlug(resolved) ?? '';
    }
    if (title.length < 4 || title.length > 140) return;

    const containerText = container.length ? container.text() : '';
    // A card carrying a "Closed" status is not an open posting.
    if (container.length && container.find('[class*="status"], [class*="badge"], [class*="tag"], [class*="label"]').filter((__, badge) => CLOSED_TEXT.test(squash($(badge).text()))).length > 0) {
      seen.add(full);
      return;
    }

    const location = squash(container.find('[class*="location"], [class*="Location"], [data-location], [itemprop="jobLocation"]').first().text()) || null;
    const department = squash(container.find('[class*="department"], [class*="team"], [class*="category"]').first().text()) || null;
    const time = container.find('time').first();

    seen.add(full);
    jobs.push({
      title,
      url: full,
      location: location && location.length <= 120 ? location : null,
      department: department && department.length <= 80 ? department : null,
      jobType: squash(container.find('[class*="type"], [class*="commitment"], [class*="employment"]').first().text()).slice(0, 60) || null,
      postedAt: time.attr('datetime') ?? dateAfter(containerText, /(?:posted|date posted|published|posted on)\s*:?\s*([A-Za-z0-9\s,/.-]{4,30})/i),
      deadlineAt: dateAfter(containerText, /(?:deadline|closing date|apply by|apply before|expires|last date|application deadline)\s*:?\s*([A-Za-z0-9\s,/.-]{4,30})/i),
    });
  });

  return jobs;
}

/** Visible text of a page, used to decide whether it is an empty JavaScript shell. */
export function visibleTextLength(html: string): number {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, template').remove();
  return squash($('body').text()).length;
}

function htmlAdapter(id: string, label: string, extract: (html: string, pageUrl: string) => RawJob[]): SourceAdapter {
  return {
    id,
    label,
    kind: 'html',
    async fetchJobs({ url, html }): Promise<AdapterResult> {
      return { jobs: html ? extract(html, url) : [] };
    },
  };
}

export const structuredDataAdapter = htmlAdapter('structured_data', 'Structured data (JSON-LD)', extractJsonLdJobs);
export const embeddedJsonAdapter = htmlAdapter('embedded_json', 'Embedded page data', extractEmbeddedJsonJobs);
export const genericHtmlAdapter = htmlAdapter('generic_html', 'HTML page', extractGenericHtmlJobs);
/** Listed so the adapter name resolves in the UI; the JSON path is driven by extract.ts. */
export const jsonFeedAdapter: SourceAdapter = {
  id: 'json_feed',
  label: 'JSON feed',
  kind: 'api',
  async fetchJobs() {
    return { jobs: [] };
  },
};
