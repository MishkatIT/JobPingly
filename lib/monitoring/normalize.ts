import { cleanText, htmlToText } from '@/lib/security/html';
import { isSafeHref } from '@/lib/security/ssrf';
import {
  classifyEmployment,
  classifySeniority,
  classifyWorkplace,
  endOfDayIfDateOnly,
  parseDate,
  parseSalary,
} from './classify';
import { buildJobKeys, contentHashOf } from './fingerprint';
import type { NormalizedJob, RawJob } from './types';

const MAX_DESCRIPTION_LENGTH = 12_000;
const MAX_JOBS_PER_SOURCE = 5_000;

const NON_JOB_TITLES = new Set([
  'home', 'about', 'about us', 'careers', 'career', 'jobs', 'job', 'roles', 'login', 'log in', 'sign in', 'sign up',
  'contact', 'contact us', 'privacy', 'privacy policy', 'terms', 'terms of service', 'cookie policy', 'see open roles',
  'find your role', 'view all jobs', 'view all', 'open positions', 'join us', 'join our team', 'apply', 'apply now',
  'learn more', 'read more', 'all rights reserved', 'benefits', 'our team', 'our culture', 'life at', 'search jobs',
  'job alerts', 'talent network', 'general application', 'untitled position',
]);

function cleanTitle(title: unknown): string {
  return cleanText(title, 200)
    .replace(/\s*[-|–]\s*(apply now|apply|more details|view details|details|read more|new)$/i, '')
    .replace(/\s+(apply now|more details|view details|read more)$/i, '')
    .trim();
}

function resolveUrl(url: unknown, pageUrl: string): string | null {
  if (typeof url !== 'string' || !url.trim()) return null;
  try {
    const resolved = new URL(url.trim(), pageUrl).toString();
    // Scraped pages can contain javascript: or data: links; never store them.
    return isSafeHref(resolved) ? resolved.slice(0, 2000) : null;
  } catch {
    return null;
  }
}

/**
 * Turns one adapter result into a clean, classified, keyed job, or null when
 * the entry is not a real posting.
 */
export function normalizeJob(raw: RawJob, pageUrl: string): NormalizedJob | null {
  const title = cleanTitle(raw.title);
  if (title.length < 3 || NON_JOB_TITLES.has(title.toLowerCase())) return null;

  const location = cleanText(raw.location, 200) || null;
  const department = cleanText(raw.department, 120) || null;
  const jobType = cleanText(raw.jobType, 80) || null;
  const url = resolveUrl(raw.url, pageUrl);
  const externalId = raw.externalId !== null && raw.externalId !== undefined && String(raw.externalId).trim()
    ? String(raw.externalId).trim().slice(0, 200)
    : null;

  const description = raw.description ? htmlToText(raw.description, MAX_DESCRIPTION_LENGTH) || null : null;

  const salary =
    raw.salaryMin || raw.salaryMax
      ? {
          text: cleanText(raw.salaryText, 160) || null,
          min: raw.salaryMin ?? null,
          max: raw.salaryMax ?? null,
          currency: raw.salaryCurrency ? String(raw.salaryCurrency).toUpperCase().slice(0, 6) : null,
        }
      : parseSalary(raw.salaryText);

  const postedAt = parseDate(raw.postedAt);
  const deadlineAt = endOfDayIfDateOnly(raw.deadlineAt, parseDate(raw.deadlineAt));

  const workplaceType = raw.workplaceType ?? classifyWorkplace(location, title, jobType);
  const employmentType = classifyEmployment(jobType, title);
  const seniority = classifySeniority(title);

  const keys = buildJobKeys({ externalId, url, title, location }, pageUrl);

  // The description is hashed, not compared, so a reworded posting registers
  // as "description changed" without us storing every revision.
  const contentHash = contentHashOf({
    title,
    location,
    department,
    workplaceType,
    employmentType,
    salary: salary.text ?? (salary.min ? `${salary.min}-${salary.max ?? ''}` : ''),
    deadline: deadlineAt ? deadlineAt.toISOString().slice(0, 10) : '',
    description: description ? contentHashOf({ d: description }) : '',
  });

  return {
    externalId,
    title,
    url,
    location,
    department,
    jobType,
    workplaceType,
    employmentType,
    seniority,
    salaryText: salary.text,
    salaryMin: salary.min,
    salaryMax: salary.max,
    salaryCurrency: salary.currency,
    description,
    postedAt,
    deadlineAt,
    rawData: raw.extra && Object.keys(raw.extra).length > 0 ? raw.extra : null,
    keys,
    contentHash,
  };
}

/** Normalises a whole result set and removes duplicates within it. */
export function normalizeJobs(rawJobs: RawJob[], pageUrl: string): NormalizedJob[] {
  const seen = new Set<string>();
  const result: NormalizedJob[] = [];

  for (const raw of rawJobs.slice(0, MAX_JOBS_PER_SOURCE)) {
    if (!raw || typeof raw.title !== 'string') continue;
    const job = normalizeJob(raw, pageUrl);
    if (!job) continue;
    if (seen.has(job.keys.primary)) continue;
    seen.add(job.keys.primary);
    result.push(job);
  }
  return result;
}
