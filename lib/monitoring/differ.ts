import { externalIdKey, titleLocationKey, urlKey } from './fingerprint';
import type { NormalizedJob } from './types';

/**
 * Compares a fresh scan with what is stored for a source.
 *
 * Matching is attempted in order of key strength (fingerprint, external id,
 * URL, then title + location). The title + location fallback is only used
 * when it is unambiguous on both sides: if a company has two open
 * "Software Engineer - Dhaka" requisitions they are different jobs and must
 * not be merged.
 */

export interface StoredJob {
  id: string;
  fingerprint: string;
  externalId: string | null;
  url: string | null;
  title: string;
  location: string | null;
  status: string;
  missedScrapes: number;
  contentHash: string | null;
  hiddenAt: Date | null;
  closedAt: Date | null;
  // Present so a changed job can report what changed.
  department?: string | null;
  workplaceType?: string | null;
  employmentType?: string | null;
  salaryText?: string | null;
  deadlineAt?: Date | null;
}

export type MatchedBy = 'fingerprint' | 'external_id' | 'url' | 'title_location';

export interface JobMatch {
  stored: StoredJob;
  scraped: NormalizedJob;
  matchedBy: MatchedBy;
  /** The stored job was closed and has reappeared. */
  reopened: boolean;
  /** Content differs from what is stored. */
  changed: boolean;
}

export interface DiffResult {
  newJobs: NormalizedJob[];
  matched: JobMatch[];
  /** Active stored jobs that the scan did not contain. */
  missing: StoredJob[];
  /** Share of previously active jobs that are missing (0..1). */
  dropRatio: number;
  /** True when so many jobs vanished at once that the scan is more likely broken than accurate. */
  isSuspicious: boolean;
}

export interface DiffOptions {
  pageUrl?: string | null;
  /** Minimum number of active jobs before the anti-spike guard applies. */
  spikeMinJobs?: number;
  /** Drop ratio above which a scan is treated as suspicious. */
  spikeRatio?: number;
}

function indexBy<T>(items: T[], keyOf: (item: T) => string | null): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (!key) continue;
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}

export function diffJobs(scraped: NormalizedJob[], stored: StoredJob[], options: DiffOptions = {}): DiffResult {
  const pageUrl = options.pageUrl ?? null;
  const spikeMinJobs = options.spikeMinJobs ?? 5;
  const spikeRatio = options.spikeRatio ?? 0.8;

  const byFingerprint = new Map(stored.map(job => [job.fingerprint, job]));
  const byExt = indexBy(stored, job => externalIdKey(job.externalId));
  const byUrl = indexBy(stored, job => urlKey(job.url, pageUrl));
  const byTitleLocation = indexBy(stored, job => titleLocationKey(job.title, job.location));
  const scrapedTitleLocationCounts = new Map<string, number>();
  for (const job of scraped) {
    scrapedTitleLocationCounts.set(job.keys.titleLocation, (scrapedTitleLocationCounts.get(job.keys.titleLocation) ?? 0) + 1);
  }

  const claimed = new Set<string>();
  const matched: JobMatch[] = [];
  const unmatched: NormalizedJob[] = [];

  const claim = (job: NormalizedJob, candidate: StoredJob | undefined, matchedBy: MatchedBy): boolean => {
    if (!candidate || claimed.has(candidate.id)) return false;
    claimed.add(candidate.id);
    matched.push({
      stored: candidate,
      scraped: job,
      matchedBy,
      reopened: candidate.status !== 'active',
      changed: candidate.contentHash !== null && candidate.contentHash !== job.contentHash,
    });
    return true;
  };

  // Pass 1: strong keys. Done for every scraped job before any weak matching,
  // so a weak match can never steal a stored job that has an exact match.
  for (const job of scraped) {
    if (claim(job, byFingerprint.get(job.keys.primary), 'fingerprint')) continue;
    const extCandidates = job.keys.ext ? byExt.get(job.keys.ext) : undefined;
    if (extCandidates && claim(job, extCandidates.find(c => !claimed.has(c.id)), 'external_id')) continue;
    const urlCandidates = job.keys.url ? byUrl.get(job.keys.url) : undefined;
    if (urlCandidates && claim(job, urlCandidates.find(c => !claimed.has(c.id)), 'url')) continue;
    unmatched.push(job);
  }

  // Pass 2: title + location, only when exactly one candidate exists on each side.
  const newJobs: NormalizedJob[] = [];
  for (const job of unmatched) {
    const candidates = (byTitleLocation.get(job.keys.titleLocation) ?? []).filter(c => !claimed.has(c.id));
    const uniqueInScan = scrapedTitleLocationCounts.get(job.keys.titleLocation) === 1;
    if (uniqueInScan && candidates.length === 1 && claim(job, candidates[0], 'title_location')) continue;
    newJobs.push(job);
  }

  const active = stored.filter(job => job.status === 'active' && !job.hiddenAt);
  const missing = active.filter(job => !claimed.has(job.id));
  const dropRatio = active.length > 0 ? missing.length / active.length : 0;
  const isSuspicious = active.length >= spikeMinJobs && dropRatio > spikeRatio;

  return { newJobs, matched, missing, dropRatio, isSuspicious };
}

const TRACKED_FIELDS = ['title', 'location', 'department', 'workplaceType', 'employmentType', 'salaryText'] as const;

/** Field-level description of what changed, for the job's history. */
export function describeChanges(stored: StoredJob, scraped: NormalizedJob): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of TRACKED_FIELDS) {
    const before = (stored[field] ?? null) as unknown;
    const after = (scraped[field] ?? null) as unknown;
    if (before !== after && !(before === null && after === null)) changes[field] = { from: before, to: after };
  }
  const beforeDeadline = stored.deadlineAt ? stored.deadlineAt.toISOString().slice(0, 10) : null;
  const afterDeadline = scraped.deadlineAt ? scraped.deadlineAt.toISOString().slice(0, 10) : null;
  if (beforeDeadline !== afterDeadline) changes.deadline = { from: beforeDeadline, to: afterDeadline };
  if (Object.keys(changes).length === 0) changes.description = { from: null, to: 'updated' };
  return changes;
}
