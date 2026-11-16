import { z } from 'zod';
import {
  EMPLOYMENT_TYPES,
  SENIORITY_LEVELS,
  WORKPLACE_TYPES,
  type EmploymentType,
  type Seniority,
  type WorkplaceType,
} from '@/lib/constants';

/**
 * Alert rules for one watchlist subscription.
 *
 * Keyword logic: `include` is a list of groups. A job matches when EVERY
 * group has at least one term present (AND across groups, OR within a group).
 * An empty `include` means "every job". Any `exclude` term in the title
 * rejects the job.
 *
 *   include: [["react", "vue"], ["senior", "lead"]]
 *   -> (react OR vue) AND (senior OR lead)
 *
 * Facet filters (workplace, employment, seniority, locations) are optional.
 * A job whose facet is unknown passes a facet filter when `includeUnknown`
 * is true, because most postings do not state every facet.
 */

export const MATCH_FIELDS = ['title', 'department', 'location', 'description'] as const;
export type MatchField = (typeof MATCH_FIELDS)[number];

export interface MatchRules {
  include: string[][];
  exclude: string[];
  fields: MatchField[];
  wholeWord: boolean;
  workplace: WorkplaceType[];
  employment: EmploymentType[];
  seniority: Seniority[];
  locations: string[];
  includeUnknown: boolean;
}

export const DEFAULT_MATCH_FIELDS: MatchField[] = ['title', 'department', 'location'];

export const EMPTY_RULES: MatchRules = {
  include: [],
  exclude: [],
  fields: DEFAULT_MATCH_FIELDS,
  wholeWord: true,
  workplace: [],
  employment: [],
  seniority: [],
  locations: [],
  includeUnknown: true,
};

const term = z.string().trim().min(1).max(60);

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

/** Validates rules arriving from the client. `maxTerms` comes from the platform limit. */
export function matchRulesSchema(maxTerms = 20) {
  return z
    .object({
      include: z.array(z.array(term).max(maxTerms)).max(5).default([]),
      exclude: z.array(term).max(maxTerms).default([]),
      fields: z.array(z.enum(MATCH_FIELDS)).min(1).max(4).default(DEFAULT_MATCH_FIELDS),
      wholeWord: z.boolean().default(true),
      workplace: z.array(z.enum(WORKPLACE_TYPES)).max(3).default([]),
      employment: z.array(z.enum(EMPLOYMENT_TYPES)).max(5).default([]),
      seniority: z.array(z.enum(SENIORITY_LEVELS)).max(6).default([]),
      locations: z.array(term).max(maxTerms).default([]),
      includeUnknown: z.boolean().default(true),
    })
    .transform((rules): MatchRules => ({
      ...rules,
      include: rules.include.map(dedupe).filter(group => group.length > 0),
      exclude: dedupe(rules.exclude),
      locations: dedupe(rules.locations),
      fields: Array.from(new Set(rules.fields)),
    }));
}

function cleanTerms(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return dedupe(
    values
      .filter((value): value is string => typeof value === 'string')
      .map(value => value.trim())
      .filter(value => value.length > 0 && value.length <= 60),
  );
}

/**
 * Builds the effective rules for a subscription row. Advanced rules win when
 * present; otherwise the simple include/exclude keyword lists are used, which
 * is how every subscription created before v2 is stored.
 */
export function rulesFromSubscription(subscription: {
  matchRules?: unknown;
  positiveKeywords?: string[] | null;
  negativeKeywords?: string[] | null;
}): MatchRules {
  if (subscription.matchRules && typeof subscription.matchRules === 'object') {
    const parsed = matchRulesSchema(500).safeParse(subscription.matchRules);
    if (parsed.success) return parsed.data;
  }
  const include = cleanTerms(subscription.positiveKeywords);
  return {
    ...EMPTY_RULES,
    include: include.length > 0 ? [include] : [],
    exclude: cleanTerms(subscription.negativeKeywords),
  };
}

/** True when the rules impose no restriction at all. */
export function matchesEverything(rules: MatchRules): boolean {
  return (
    rules.include.length === 0 &&
    rules.exclude.length === 0 &&
    rules.workplace.length === 0 &&
    rules.employment.length === 0 &&
    rules.seniority.length === 0 &&
    rules.locations.length === 0
  );
}

/** Flat lists for the legacy keyword columns, kept in sync for older readers. */
export function flattenForLegacyColumns(rules: MatchRules): { positiveKeywords: string[]; negativeKeywords: string[] } {
  return { positiveKeywords: dedupe(rules.include.flat()), negativeKeywords: rules.exclude };
}

/** One-line summary for the UI, e.g. `react or vue · and senior · not intern · Remote`. */
export function describeRules(rules: MatchRules): string {
  if (matchesEverything(rules)) return 'All new jobs';
  const parts: string[] = [];
  rules.include.forEach((group, index) => parts.push(`${index > 0 ? 'and ' : ''}${group.join(' or ')}`));
  if (rules.exclude.length) parts.push(`not ${rules.exclude.join(', ')}`);
  if (rules.workplace.length) parts.push(rules.workplace.join(' / '));
  if (rules.employment.length) parts.push(rules.employment.map(value => value.replace('_', '-')).join(' / '));
  if (rules.seniority.length) parts.push(rules.seniority.join(' / '));
  if (rules.locations.length) parts.push(`in ${rules.locations.join(' or ')}`);
  return parts.join(' · ');
}
