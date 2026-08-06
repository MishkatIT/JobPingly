export type NormalizedJob = {
  externalId?: string;
  title: string;
  url?: string;
  location?: string;
  jobType?: string;
  department?: string;
  rawData?: unknown;
};

export interface ATSAdapter {
  name: string;
  detect(url: string, html: string): boolean;
  extractJobs(url: string, html: string): Promise<NormalizedJob[]>;
}

export type DiffResult = {
  newJobs: NormalizedJob[];
  removedJobs: { fingerprint: string; externalId?: string; title: string }[];
  unchangedJobs: { fingerprint: string; externalId?: string; title: string; rawData?: unknown }[];
  isSuspicious: boolean;
};
