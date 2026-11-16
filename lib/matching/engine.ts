import type { MatchField, MatchRules } from './rules';

/**
 * Deterministic job matching.
 *
 * Matching is done on whole words, not substrings: the keyword "java" does
 * not match "JavaScript" and "intern" does not match "International". Word
 * comparison is tolerant of the ways people actually write technology names:
 *
 *   "frontend"  matches  "Front-end", "Front End", "frontend"
 *   "node.js"   matches  "NodeJS", "Node JS", "node.js"
 *   "engineer"  matches  "Engineers"
 *   "c++", "c#" are kept intact
 *
 * Every match records which term was found in which field, so the product can
 * always explain why a job was (or was not) sent to a user.
 */

export interface MatchableJob {
  title: string;
  department?: string | null;
  location?: string | null;
  description?: string | null;
  workplaceType?: string | null;
  employmentType?: string | null;
  seniority?: string | null;
}

export interface MatchReason {
  kind: 'keyword' | 'workplace' | 'employment' | 'seniority' | 'location' | 'all';
  term?: string;
  field?: MatchField;
}

export interface MatchResult {
  matched: boolean;
  /** Distinct include terms that were found. `['*']` when there are no keyword rules. */
  terms: string[];
  reasons: MatchReason[];
  /** Why the job was rejected, when it was. */
  rejectedBy?: string;
}

/** Splits text into comparable word tokens. `+` and `#` are kept so C++ and C# survive. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .split(/[^a-z0-9+#]+/)
    .filter(Boolean);
}

/** Folds simple plurals so "engineer" and "engineers" compare equal. */
function stem(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss') && !/[+#]/.test(token)) return token.slice(0, -1);
  return token;
}

interface PreparedText {
  tokens: string[];
  compact: string;
}

function prepare(text: string | null | undefined): PreparedText {
  const tokens = tokenize(text ?? '').map(stem);
  return { tokens, compact: tokens.join('') };
}

const MAX_JOINED_TOKENS = 4;

function containsTerm(text: PreparedText, term: string, wholeWord: boolean): boolean {
  const termTokens = tokenize(term).map(stem);
  if (termTokens.length === 0) return false;
  const termCompact = termTokens.join('');

  if (!wholeWord) return text.compact.includes(termCompact);

  const { tokens } = text;
  for (let start = 0; start < tokens.length; start++) {
    // Exact phrase: the term's words appear consecutively.
    let phrase = true;
    for (let offset = 0; offset < termTokens.length; offset++) {
      if (tokens[start + offset] !== termTokens[offset]) {
        phrase = false;
        break;
      }
    }
    if (phrase) return true;

    // Spacing variants: "frontend" vs "front end", "nodejs" vs "node js".
    let joined = '';
    for (let length = 1; length <= MAX_JOINED_TOKENS && start + length <= tokens.length; length++) {
      joined += tokens[start + length - 1];
      if (joined.length > termCompact.length) break;
      if (joined === termCompact) return true;
    }
  }
  return false;
}

function facetPasses(allowed: string[], value: string | null | undefined, includeUnknown: boolean): boolean {
  if (allowed.length === 0) return true;
  if (!value) return includeUnknown;
  return allowed.includes(value);
}

export function evaluateJob(job: MatchableJob, rules: MatchRules): MatchResult {
  const title = prepare(job.title);

  // Exclusions look at the title only. Applying them to descriptions would
  // reject a job for mentioning "senior leadership" when the user excluded "senior".
  for (const term of rules.exclude) {
    if (containsTerm(title, term, rules.wholeWord)) {
      return { matched: false, terms: [], reasons: [], rejectedBy: `Excluded keyword "${term}" in the title` };
    }
  }

  if (!facetPasses(rules.workplace, job.workplaceType, rules.includeUnknown)) {
    return { matched: false, terms: [], reasons: [], rejectedBy: 'Workplace type does not match' };
  }
  if (!facetPasses(rules.employment, job.employmentType, rules.includeUnknown)) {
    return { matched: false, terms: [], reasons: [], rejectedBy: 'Employment type does not match' };
  }
  if (!facetPasses(rules.seniority, job.seniority, rules.includeUnknown)) {
    return { matched: false, terms: [], reasons: [], rejectedBy: 'Seniority does not match' };
  }

  const reasons: MatchReason[] = [];

  if (rules.locations.length > 0) {
    const location = prepare(job.location);
    const hit = rules.locations.find(term => containsTerm(location, term, rules.wholeWord));
    if (hit) reasons.push({ kind: 'location', term: hit });
    else if (job.location || !rules.includeUnknown) {
      // A remote job satisfies a location preference only if "remote" was listed.
      return { matched: false, terms: [], reasons: [], rejectedBy: 'Location does not match' };
    }
  }

  const terms: string[] = [];
  if (rules.include.length > 0) {
    const prepared: Record<MatchField, PreparedText> = {
      title,
      department: prepare(job.department),
      location: prepare(job.location),
      description: rules.fields.includes('description') ? prepare(job.description) : { tokens: [], compact: '' },
    };

    for (const group of rules.include) {
      let groupMatched = false;
      for (const term of group) {
        const field = rules.fields.find(candidate => containsTerm(prepared[candidate], term, rules.wholeWord));
        if (field) {
          groupMatched = true;
          if (!terms.includes(term)) terms.push(term);
          reasons.push({ kind: 'keyword', term, field });
        }
      }
      if (!groupMatched) {
        return { matched: false, terms: [], reasons: [], rejectedBy: `None of: ${group.join(', ')}` };
      }
    }
  }

  if (rules.workplace.length > 0 && job.workplaceType) reasons.push({ kind: 'workplace', term: job.workplaceType });
  if (rules.employment.length > 0 && job.employmentType) reasons.push({ kind: 'employment', term: job.employmentType });
  if (rules.seniority.length > 0 && job.seniority) reasons.push({ kind: 'seniority', term: job.seniority });
  if (reasons.length === 0) reasons.push({ kind: 'all' });

  return { matched: true, terms: terms.length > 0 ? terms : ['*'], reasons };
}

const FIELD_LABELS: Record<MatchField, string> = {
  title: 'title',
  department: 'department',
  location: 'location',
  description: 'description',
};

/** Human-readable explanation, e.g. `"react" in the title · Remote`. */
export function explainMatch(reasons: MatchReason[] | null | undefined): string {
  if (!reasons || reasons.length === 0) return 'Matches your alert';
  const parts = reasons.map(reason => {
    switch (reason.kind) {
      case 'keyword':
        return `"${reason.term}" in the ${FIELD_LABELS[reason.field ?? 'title']}`;
      case 'location':
        return `location "${reason.term}"`;
      case 'workplace':
      case 'employment':
      case 'seniority':
        return String(reason.term).replace(/_/g, ' ');
      case 'all':
        return 'this alert has no keyword filter';
    }
  });
  return Array.from(new Set(parts)).join(' · ');
}

/**
 * Compatibility wrapper for the pre-v2 signature. Returns a match when any
 * keyword is found in the title, department or location.
 */
export function matchKeywords(
  keywords: string[] | null,
  title: string,
  department = '',
  location = '',
): { isMatch: boolean; matchedKeywords: string[] } {
  const include = (keywords ?? []).map(keyword => keyword.trim()).filter(Boolean);
  const result = evaluateJob(
    { title, department, location },
    {
      include: include.length ? [include] : [],
      exclude: [],
      fields: ['title', 'department', 'location'],
      wholeWord: true,
      workplace: [],
      employment: [],
      seniority: [],
      locations: [],
      includeUnknown: true,
    },
  );
  return { isMatch: result.matched, matchedKeywords: result.terms };
}
