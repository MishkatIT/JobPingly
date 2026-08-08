import crypto from 'crypto';
import { NormalizedJob } from './types';
import { ExtractedJob } from './aiExtractor';

function sha256Hash(input: string): string {
  return crypto.createHash('sha256').update(input.toLowerCase().trim()).digest('hex').substring(0, 24);
}

export function generateJobFingerprint(job: NormalizedJob | ExtractedJob | any, pageUrl?: string): string {
  const jobId = job.externalId || job.jobId;
  const appUrl = job.url || job.applicationUrl;
  const company = job.company || '';
  const title = job.title || job.jobTitle || '';
  const location = job.location || '';

  // Priority 1: company/source + jobId
  if (jobId && String(jobId).trim().length > 0) {
    const raw = `${company}|${String(jobId).trim()}`;
    return `ext:${sha256Hash(raw)}`;
  }

  // Priority 2: normalized applicationUrl (skip if generic main page URL or root path)
  if (appUrl && String(appUrl).trim().length > 0) {
    try {
      const parsed = new URL(String(appUrl).trim());
      parsed.searchParams.forEach((_, key) => {
        if (key.startsWith('utm_')) parsed.searchParams.delete(key);
      });
      const cleanUrl = parsed.origin + parsed.pathname + (parsed.search ? parsed.search : '');

      const normalizedClean = cleanUrl.replace(/\/$/, '');
      const normalizedPage = pageUrl ? pageUrl.replace(/\/$/, '') : '';

      const isGenericRootUrl = parsed.pathname === '/' || parsed.pathname === '';
      const matchesPageUrl = normalizedPage && normalizedClean === normalizedPage;

      if (!isGenericRootUrl && !matchesPageUrl) {
        return `url:${sha256Hash(cleanUrl)}`;
      }
    } catch {
      // Fall through if URL parsing fails
    }
  }

  // Priority 3: company + normalized job title + location
  if (title && (location || company)) {
    const combined = `${company}|${title.trim()}|${location.trim()}`;
    return `titleloc:${sha256Hash(combined)}`;
  }

  // Priority 4: Title only
  return `title:${sha256Hash(String(title).trim())}`;
}
