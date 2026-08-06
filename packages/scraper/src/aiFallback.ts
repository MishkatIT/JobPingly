import { NormalizedJob } from './types';

/**
 * Stage 5: AI & Heuristic Fallback Normalizer
 * Normalizes raw/unstructured job elements, cleans titles, extracts locations,
 * and builds fallback schema objects.
 */
export function aiFallbackNormalize(rawItems: any[], pageUrl: string): NormalizedJob[] {
  const normalized: NormalizedJob[] = [];
  const seenFingerprints = new Set<string>();

  for (const item of rawItems) {
    if (!item) continue;

    let title = typeof item === 'string' ? item : (item.title || item.name || item.text || item.heading || '');
    title = String(title).trim().replace(/\s+/g, ' ');

    if (!title || title.length < 3 || title.length > 150) continue;

    // Filter out common non-job header texts
    const lowerTitle = title.toLowerCase();
    if ([
      'home', 'about us', 'careers', 'jobs', 'join our team', 'all rights reserved',
      'privacy policy', 'terms of service', 'contact us', 'cookie policy', 'login', 'sign up'
    ].includes(lowerTitle)) {
      continue;
    }

    let url = item.url || item.href || pageUrl;
    try {
      if (url && !url.startsWith('http')) {
        url = new URL(url, pageUrl).toString();
      }
    } catch {
      url = pageUrl;
    }

    const location = item.location || item.city || item.address || item.region || undefined;
    const department = item.department || item.category || item.team || undefined;
    const jobType = item.jobType || item.employmentType || item.commitment || undefined;
    const externalId = item.externalId || item.id || undefined;

    const dedupKey = `${title.toLowerCase()}|${(location || '').toLowerCase()}`;
    if (seenFingerprints.has(dedupKey)) continue;
    seenFingerprints.add(dedupKey);

    normalized.push({
      externalId: externalId ? String(externalId) : undefined,
      title,
      url,
      location: location ? String(location).trim() : undefined,
      department: department ? String(department).trim() : undefined,
      jobType: jobType ? String(jobType).trim() : undefined,
      rawData: typeof item === 'object' ? item : { text: item },
    });
  }

  return normalized;
}
