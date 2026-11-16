import type { HttpClient } from './http';

/**
 * robots.txt support for pages fetched from a company's own site.
 *
 * Official ATS job-board APIs are not subject to this check: they are
 * published specifically so that third parties can read the postings.
 */

const BOT_TOKEN = 'jobpinglybot';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface Rule {
  allow: boolean;
  pattern: RegExp;
  length: number;
}

interface RobotsPolicy {
  rules: Rule[];
  crawlDelaySeconds: number | null;
  fetchedAt: number;
}

declare global {
  var __jpRobotsCache: Map<string, RobotsPolicy> | undefined;
}

const cache: Map<string, RobotsPolicy> = (globalThis.__jpRobotsCache ??= new Map());

function toPattern(path: string): RegExp {
  const anchored = path.endsWith('$');
  const body = (anchored ? path.slice(0, -1) : path)
    .split('*')
    .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/** Parses robots.txt into the rule group that applies to this bot. */
export function parseRobots(text: string): { rules: Rule[]; crawlDelaySeconds: number | null } {
  const groups: { agents: string[]; rules: Rule[]; crawlDelay: number | null }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/).slice(0, 5000)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;

    if (field === 'allow' || field === 'disallow') {
      // "Disallow:" with an empty value means "allow everything".
      if (!value) continue;
      current.rules.push({ allow: field === 'allow', pattern: toPattern(value), length: value.length });
    } else if (field === 'crawl-delay') {
      const delay = Number(value);
      if (Number.isFinite(delay) && delay >= 0) current.crawlDelay = Math.min(delay, 60);
    }
  }

  const specific = groups.filter(group => group.agents.some(agent => agent !== '*' && BOT_TOKEN.includes(agent)));
  const chosen = specific.length > 0 ? specific : groups.filter(group => group.agents.includes('*'));
  return {
    rules: chosen.flatMap(group => group.rules),
    crawlDelaySeconds: chosen.map(group => group.crawlDelay).find(delay => delay !== null) ?? null,
  };
}

/** Longest matching rule wins; ties go to Allow (RFC 9309). */
export function isPathAllowed(rules: Rule[], path: string): boolean {
  let best: Rule | null = null;
  for (const rule of rules) {
    if (!rule.pattern.test(path)) continue;
    if (!best || rule.length > best.length || (rule.length === best.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}

export interface RobotsDecision {
  allowed: boolean;
  crawlDelaySeconds: number | null;
}

export async function checkRobots(pageUrl: string, http: HttpClient): Promise<RobotsDecision> {
  const url = new URL(pageUrl);
  const origin = url.origin;
  let policy = cache.get(origin);

  if (!policy || Date.now() - policy.fetchedAt > CACHE_TTL_MS) {
    try {
      const response = await http.request(`${origin}/robots.txt`, {
        timeoutMs: 8000,
        maxBytes: 512 * 1024,
        retries: 0,
        acceptStatuses: [400, 401, 403, 404, 410],
        headers: { Accept: 'text/plain,*/*' },
      });
      // No robots.txt (4xx) means no restrictions. An HTML error page served
      // with 200 is not a robots file either.
      const usable = response.status === 200 && !/^\s*<(!doctype|html)/i.test(response.text);
      const parsed = usable ? parseRobots(response.text) : { rules: [], crawlDelaySeconds: null };
      policy = { ...parsed, fetchedAt: Date.now() };
    } catch {
      // Unreachable robots.txt: do not block monitoring on it, but retry soon.
      policy = { rules: [], crawlDelaySeconds: null, fetchedAt: Date.now() - CACHE_TTL_MS + 30 * 60 * 1000 };
    }
    if (cache.size > 2000) cache.clear();
    cache.set(origin, policy);
  }

  return {
    allowed: isPathAllowed(policy.rules, `${url.pathname}${url.search}`),
    crawlDelaySeconds: policy.crawlDelaySeconds,
  };
}

export function clearRobotsCache(): void {
  cache.clear();
}
