import { NormalizedJob, DiffResult } from './types';
import { generateJobFingerprint } from './fingerprint';

export interface StoredJob {
  id: string;
  fingerprint: string;
  externalId?: string | null;
  title: string;
  status: string;
  missedScrapes: number;
  rawData?: any;
}

export function diffJobs(
  scrapedJobs: NormalizedJob[],
  storedJobs: StoredJob[],
  pageUrl?: string
): DiffResult {
  const activeStoredJobs = storedJobs.filter(j => j.status === 'active');
  const storedByFingerprint = new Map<string, StoredJob>();
  activeStoredJobs.forEach(j => storedByFingerprint.set(j.fingerprint, j));

  const scrapedMap = new Map<string, NormalizedJob>();
  scrapedJobs.forEach(j => {
    const fp = generateJobFingerprint(j, pageUrl);
    scrapedMap.set(fp, j);
  });

  const newJobs: NormalizedJob[] = [];
  const unchangedJobs: { fingerprint: string; externalId?: string; title: string; rawData?: any }[] = [];
  const removedJobs: { fingerprint: string; externalId?: string; title: string }[] = [];

  // Identify NEW and UNCHANGED jobs
  scrapedMap.forEach((job, fp) => {
    if (storedByFingerprint.has(fp)) {
      const existing = storedByFingerprint.get(fp)!;
      unchangedJobs.push({
        fingerprint: fp,
        externalId: existing.externalId || undefined,
        title: existing.title,
        rawData: existing.rawData,
      });
    } else {
      newJobs.push(job);
    }
  });

  // Identify MISSING / REMOVED jobs
  storedByFingerprint.forEach((existing, fp) => {
    if (!scrapedMap.has(fp)) {
      removedJobs.push({
        fingerprint: fp,
        externalId: existing.externalId || undefined,
        title: existing.title,
      });
    }
  });

  // Anti-Spike Protection Check (> 80% sudden drop on 5+ stored active jobs)
  let isSuspicious = false;
  if (activeStoredJobs.length >= 5 && removedJobs.length / activeStoredJobs.length > 0.8) {
    isSuspicious = true;
  }

  return {
    newJobs,
    removedJobs,
    unchangedJobs,
    isSuspicious,
  };
}
