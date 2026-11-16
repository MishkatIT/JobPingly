import type { EmploymentType, Seniority, WorkplaceType } from '@/lib/constants';
import type { HttpClient } from './http';

/** What an adapter returns for one posting: source vocabulary, minimally processed. */
export interface RawJob {
  externalId?: string | null;
  title: string;
  url?: string | null;
  location?: string | null;
  department?: string | null;
  /** Employment type exactly as the source words it ("Full-time", "Contractor", ...). */
  jobType?: string | null;
  /** Explicit workplace signal from the source, when it has one. */
  workplaceType?: WorkplaceType | null;
  /** Plain text or HTML; normalised to text downstream. */
  description?: string | null;
  salaryText?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  postedAt?: string | number | Date | null;
  deadlineAt?: string | number | Date | null;
  /** Small, source-specific extras worth keeping for debugging. Never the full payload. */
  extra?: Record<string, unknown>;
}

/** A posting after normalisation, classification and key generation. */
export interface NormalizedJob {
  externalId: string | null;
  title: string;
  url: string | null;
  location: string | null;
  department: string | null;
  jobType: string | null;
  workplaceType: WorkplaceType | null;
  employmentType: EmploymentType | null;
  seniority: Seniority | null;
  salaryText: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  description: string | null;
  postedAt: Date | null;
  deadlineAt: Date | null;
  rawData: Record<string, unknown> | null;
  /** Identity keys, strongest first. */
  keys: JobKeys;
  contentHash: string;
}

export interface JobKeys {
  /** The strongest available key; stored as jobs.fingerprint. */
  primary: string;
  ext: string | null;
  url: string | null;
  titleLocation: string;
}

export type AdapterKind = 'api' | 'html' | 'ai' | 'browser';

export interface AdapterMatch {
  adapterId: string;
  /** Board token, tenant, company slug, etc. */
  identifier?: string;
  meta?: Record<string, string>;
}

export interface AdapterContext {
  /** The career page URL as stored. */
  url: string;
  match: AdapterMatch;
  /** Page HTML, when the pipeline has already fetched it. */
  html?: string;
  http: HttpClient;
  companyName?: string | null;
  /** Stop paginating after this many pages (used for quick previews). */
  maxPages?: number;
}

export interface AdapterResult {
  jobs: RawJob[];
  /**
   * True when the adapter knows it did not see every posting (pagination cap,
   * a failed page). The pipeline then refuses to close jobs it did not see.
   */
  truncated?: boolean;
  /** Company name reported by the source, used when the page has none. */
  companyName?: string | null;
  httpStatus?: number;
}

export interface SourceAdapter {
  id: string;
  label: string;
  kind: AdapterKind;
  /** Example URLs shown in the admin UI and used in tests. */
  examples?: string[];
  /** Recognise the source from its URL alone, without any network request. */
  matchUrl?(url: URL): AdapterMatch | null;
  /** Recognise an ATS embedded in a company's own careers page. */
  matchHtml?(url: URL, html: string): AdapterMatch | null;
  fetchJobs(context: AdapterContext): Promise<AdapterResult>;
}

export interface ScanResult {
  outcome: 'success' | 'unchanged' | 'suspicious' | 'failed' | 'skipped';
  adapter: string | null;
  jobsFound: number;
  jobsAdded: number;
  jobsRemoved: number;
  jobsUpdated: number;
  jobsReopened: number;
  durationMs: number;
  httpStatus?: number | null;
  errorClass?: string | null;
  errorMessage?: string | null;
  notificationsQueued?: number;
}
