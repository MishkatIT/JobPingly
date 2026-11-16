import { isAiConfigured } from '@/lib/ai/client';
import { API_ADAPTERS, HTML_ADAPTERS, companyNameFromMatch, detectFromHtml, detectFromUrl, getAdapter } from './adapters';
import { cleanPageForAi, extractJobsWithAi, pageContentHash } from './adapters/ai';
import { extractJobsFromJson, findReferencedJobEndpoints, visibleTextLength } from './adapters/html';
import { ScanError } from './errors';
import type { HttpClient } from './http';
import { checkRobots } from './robots';
import type { AdapterKind, AdapterMatch, RawJob } from './types';

/**
 * Network half of a scan: given a career page, work out how to read it and
 * return the postings. It never touches the database, which makes it usable
 * both by the pipeline and by the admin "test this URL" tool, and easy to
 * test with a fake HTTP client.
 *
 * Strategy, cheapest and most reliable first:
 *   1. An admin override, if one is set.
 *   2. A recognised ATS, identified from the URL alone. The official API is
 *      queried directly; the HTML page is never fetched.
 *   3. Fetch the page. If it embeds a recognised ATS, use that API.
 *   4. schema.org JobPosting data, then embedded JSON, then HTML heuristics.
 *   5. AI extraction, only when enabled, configured and the page has changed.
 */

export interface ExtractionInput {
  url: string;
  adapterOverride?: string | null;
  /** Value stored from the previous scan (`p:<hash>` when the AI path was used). */
  lastContentHash?: string | null;
  allowAi: boolean;
  respectRobots: boolean;
  /** Ignore the unchanged-page shortcut. */
  force?: boolean;
  http: HttpClient;
  /** Limit pagination (previews). */
  maxPages?: number;
}

export interface ExtractionResult {
  adapter: string;
  kind: AdapterKind;
  jobs: RawJob[];
  truncated: boolean;
  /** The AI path found the page unchanged; the stored jobs are still current. */
  unchanged: boolean;
  /** Hash of the page text when the AI path was used; store it for next time. */
  pageHash: string | null;
  httpStatus: number | null;
  companyName: string | null;
  robotsAllowed: boolean | null;
  detection: { fromUrl: string | null; fromHtml: string | null; override: string | null };
}

async function runApiAdapter(match: AdapterMatch, input: ExtractionInput, html?: string) {
  const adapter = getAdapter(match.adapterId)!;
  try {
    return await adapter.fetchJobs({ url: input.url, match, html, http: input.http, maxPages: input.maxPages });
  } catch (error) {
    // A 404 from an ATS API means the board name is wrong or was removed,
    // which is more actionable than a bare "page not found".
    if (error instanceof ScanError && error.errorClass === 'http_404') {
      throw new ScanError('not_found_on_ats', `${adapter.label} has no job board named "${match.identifier}".`, { httpStatus: 404 });
    }
    throw error;
  }
}

export async function extractSource(input: ExtractionInput): Promise<ExtractionResult> {
  const override = input.adapterOverride?.trim() || null;
  const urlMatch = detectFromUrl(input.url);
  const detection = { fromUrl: urlMatch?.adapterId ?? null, fromHtml: null as string | null, override };

  const base = {
    truncated: false,
    unchanged: false,
    pageHash: null as string | null,
    httpStatus: null as number | null,
    companyName: null as string | null,
    robotsAllowed: null as boolean | null,
    detection,
  };

  // 1 & 2: an ATS we can identify without fetching the page.
  const overrideIsApi = override ? API_ADAPTERS.some(adapter => adapter.id === override) : false;
  const directMatch = override ? (overrideIsApi && urlMatch?.adapterId === override ? urlMatch : null) : urlMatch;
  if (directMatch) {
    const result = await runApiAdapter(directMatch, input);
    return {
      ...base,
      adapter: directMatch.adapterId,
      kind: 'api',
      jobs: result.jobs,
      truncated: Boolean(result.truncated),
      httpStatus: result.httpStatus ?? null,
      companyName: result.companyName ?? companyNameFromMatch(directMatch),
    };
  }

  // Everything below reads the company's own page.
  if (input.respectRobots) {
    const robots = await checkRobots(input.url, input.http);
    base.robotsAllowed = robots.allowed;
    if (!robots.allowed) throw new ScanError('robots_disallowed', 'robots.txt disallows fetching this page.');
  }

  const page = await input.http.getText(input.url.split('#')[0]);
  const html = page.text;
  base.httpStatus = page.status;

  // The URL is itself a JSON document: a feed, or a site's jobs endpoint that
  // someone added directly.
  const looksJson = /json/i.test(page.headers.get('content-type') ?? '') || /^\s*[[{]/.test(html);
  if (looksJson && (!override || override === 'json_feed')) {
    let document: unknown;
    try {
      document = JSON.parse(html);
    } catch {
      document = undefined;
    }
    if (document !== undefined) {
      return { ...base, adapter: 'json_feed', kind: 'api', jobs: extractJobsFromJson(document, input.url, new URL(input.url).pathname) };
    }
  }

  // 3: an ATS embedded in the page (or forced by an admin).
  const htmlMatch = detectFromHtml(input.url, html);
  detection.fromHtml = htmlMatch?.adapterId ?? null;
  const embedded = override ? (overrideIsApi && htmlMatch?.adapterId === override ? htmlMatch : null) : htmlMatch;
  if (overrideIsApi && !embedded) {
    throw new ScanError('parse', `This page is set to use the ${getAdapter(override)?.label} adapter, but no ${getAdapter(override)?.label} board could be identified from its URL or content.`);
  }
  if (embedded) {
    try {
      const result = await runApiAdapter(embedded, input, html);
      if (result.jobs.length > 0 || override) {
        return {
          ...base,
          adapter: embedded.adapterId,
          kind: 'api',
          jobs: result.jobs,
          truncated: Boolean(result.truncated),
          companyName: result.companyName ?? null,
        };
      }
    } catch (error) {
      // A page may merely mention an ATS; if its API has nothing for us and
      // no override demands it, fall through to reading the page itself.
      if (override) throw error;
    }
  }

  // 4: deterministic page extractors.
  const htmlAdapters = override && !overrideIsApi && override !== 'ai' ? HTML_ADAPTERS.filter(adapter => adapter.id === override) : HTML_ADAPTERS;
  if (override !== 'ai') {
    for (const adapter of htmlAdapters) {
      const result = await adapter.fetchJobs({ url: input.url, match: { adapterId: adapter.id }, html, http: input.http });
      if (result.jobs.length > 0) {
        return { ...base, adapter: adapter.id, kind: 'html', jobs: result.jobs };
      }
    }
  }

  // 4b: a jobs endpoint that the page's own code points at. Nothing is
  // guessed: only URLs that appear in the page source are tried.
  if (!override) {
    for (const endpoint of findReferencedJobEndpoints(html, input.url)) {
      try {
        const { data } = await input.http.getJson(endpoint, { retries: 0, timeoutMs: 10_000 });
        const jobs = extractJobsFromJson(data, input.url, new URL(endpoint).pathname);
        if (jobs.length > 0) return { ...base, adapter: 'json_feed', kind: 'api', jobs };
      } catch {
        // An endpoint that does not answer with JSON is simply not a job feed.
      }
    }
  }

  // 5: AI, gated on the page actually having changed.
  const aiUsable = input.allowAi && isAiConfigured() && (!override || override === 'ai');
  if (aiUsable) {
    const cleaned = cleanPageForAi(html);
    if (cleaned.length >= 200) {
      const hash = `p:${pageContentHash(cleaned)}`;
      if (!input.force && input.lastContentHash === hash) {
        return { ...base, adapter: 'ai', kind: 'ai', jobs: [], unchanged: true, pageHash: hash };
      }
      const { jobs } = await extractJobsWithAi(cleaned, input.url);
      return { ...base, adapter: 'ai', kind: 'ai', jobs, pageHash: hash };
    }
  }

  // Nothing found. Distinguish "no openings right now" from "we cannot read this page".
  if (visibleTextLength(html) < 250) {
    throw new ScanError(
      'js_rendered',
      'This page builds its job list in the browser and exposes no data that can be read directly. Use the company\'s job-board URL instead (for example boards.greenhouse.io/company or jobs.lever.co/company).',
      { httpStatus: page.status },
    );
  }

  return { ...base, adapter: override && !overrideIsApi ? override : 'generic_html', kind: 'html', jobs: [] };
}
