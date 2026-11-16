import type { AdapterMatch, SourceAdapter } from '../types';
import { aiAdapter } from './ai';
import { ashbyAdapter } from './ashby';
import { bambooHrAdapter } from './bamboohr';
import { greenhouseAdapter } from './greenhouse';
import { embeddedJsonAdapter, genericHtmlAdapter, jsonFeedAdapter, structuredDataAdapter } from './html';
import { leverAdapter } from './lever';
import { personioAdapter } from './personio';
import { pinpointAdapter } from './pinpoint';
import { recruiteeAdapter } from './recruitee';
import { smartRecruitersAdapter } from './smartrecruiters';
import { workableAdapter } from './workable';
import { workdayAdapter } from './workday';

/**
 * Adapter registry.
 *
 * To support a new ATS: add a file in this folder that exports a
 * SourceAdapter (see ../types.ts), then add it to API_ADAPTERS below. Nothing
 * else in the engine needs to change. An adapter needs:
 *   - matchUrl   to recognise the provider from a URL
 *   - matchHtml  (optional) to recognise it when embedded in a company site
 *   - fetchJobs  to return RawJob[] using the supplied HTTP client
 */

/** Providers with a public job-board API. Order matters only for HTML detection. */
export const API_ADAPTERS: SourceAdapter[] = [
  greenhouseAdapter,
  leverAdapter,
  ashbyAdapter,
  workdayAdapter,
  smartRecruitersAdapter,
  workableAdapter,
  recruiteeAdapter,
  bambooHrAdapter,
  personioAdapter,
  pinpointAdapter,
];

/** Page-based extractors, most reliable first. */
export const HTML_ADAPTERS: SourceAdapter[] = [structuredDataAdapter, embeddedJsonAdapter, genericHtmlAdapter];

const ALL: SourceAdapter[] = [...API_ADAPTERS, jsonFeedAdapter, ...HTML_ADAPTERS, aiAdapter];
const BY_ID = new Map(ALL.map(adapter => [adapter.id, adapter]));

export function getAdapter(id: string | null | undefined): SourceAdapter | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function listAdapters(): { id: string; label: string; kind: SourceAdapter['kind']; examples?: string[] }[] {
  return ALL.map(({ id, label, kind, examples }) => ({ id, label, kind, examples }));
}

export function adapterLabel(id: string | null | undefined): string {
  if (!id || id === 'unknown') return 'Not detected yet';
  if (id === 'browser') return 'Headless browser';
  return BY_ID.get(id)?.label ?? id;
}

export function detectFromUrl(rawUrl: string): AdapterMatch | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  for (const adapter of API_ADAPTERS) {
    const match = adapter.matchUrl?.(url);
    if (match) return match;
  }
  return null;
}

export function detectFromHtml(rawUrl: string, html: string): AdapterMatch | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  for (const adapter of API_ADAPTERS) {
    const match = adapter.matchHtml?.(url, html);
    if (match) return match;
  }
  return null;
}

/** Best-effort company name from a recognised ATS URL, e.g. "stripe" -> "Stripe". */
export function companyNameFromMatch(match: AdapterMatch | null): string | null {
  const slug = match?.meta?.tenant ?? match?.identifier?.split('/')[0];
  if (!slug || /^\d+$/.test(slug)) return null;
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
    .trim();
}
