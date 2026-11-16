import type { EmploymentType, Seniority, WorkplaceType } from '@/lib/constants';

/**
 * Deterministic classifiers that turn free-form source text into the facets
 * users filter on. Each returns null when there is no clear signal: an
 * unknown facet is better than a wrong one (the old UI defaulted every job to
 * "Full-Time" and "Remote").
 */

export function classifyWorkplace(...texts: (string | null | undefined)[]): WorkplaceType | null {
  const text = texts.filter(Boolean).join(' | ').toLowerCase();
  if (!text) return null;
  if (/\bhybrid\b/.test(text)) return 'hybrid';
  if (/\b(remote|work from home|wfh|work-from-home|telecommute|distributed team|anywhere)\b/.test(text)) return 'remote';
  if (/\b(on-?site|in-?office|in office|on premise|onsite)\b/.test(text)) return 'onsite';
  return null;
}

export function classifyEmployment(...texts: (string | null | undefined)[]): EmploymentType | null {
  const text = texts.filter(Boolean).join(' | ').toLowerCase().replace(/[_-]+/g, ' ');
  if (!text) return null;
  if (/\b(intern|internship|trainee|apprentice|apprenticeship|working student|co op)\b/.test(text)) return 'internship';
  if (/\b(contract|contractor|freelance|freelancer|consultant|fixed term|c2c|1099)\b/.test(text)) return 'contract';
  if (/\b(temporary|temp|seasonal)\b/.test(text)) return 'temporary';
  if (/\bpart time\b|\bparttime\b/.test(text)) return 'part_time';
  if (/\bfull time\b|\bfulltime\b|\bpermanent\b|\bregular\b/.test(text)) return 'full_time';
  return null;
}

export function classifySeniority(title: string | null | undefined, extra?: string | null): Seniority | null {
  const text = `${title ?? ''} | ${extra ?? ''}`.toLowerCase();
  if (!text.trim()) return null;
  if (/\b(intern|internship|trainee|apprentice|working student)\b/.test(text)) return 'intern';
  if (/\b(chief|cto|ceo|cfo|coo|cmo|cpo|vp|svp|evp|vice president|director|head of|general manager)\b/.test(text)) return 'executive';
  // "Manager" is deliberately absent: Account Manager, Product Manager and
  // Office Manager say nothing about seniority.
  if (/\b(principal|staff|lead|architect|distinguished|fellow)\b/.test(text)) return 'lead';
  if (/\b(senior|sr\.?|snr|expert|specialist iii|iii|iv)\b/.test(text)) return 'senior';
  if (/\b(junior|jr\.?|entry[- ]level|entry|graduate|fresher|associate|new grad)\b/.test(text)) return 'junior';
  if (/\b(mid[- ]level|mid|intermediate|ii)\b/.test(text)) return 'mid';
  return null;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '৳': 'BDT',
  '₹': 'INR',
  '¥': 'JPY',
};

const CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'BDT', 'INR', 'CAD', 'AUD', 'SGD', 'AED', 'CHF', 'JPY', 'SEK', 'NOK', 'DKK', 'PLN', 'BRL', 'MXN', 'TK'];

export interface ParsedSalary {
  text: string | null;
  min: number | null;
  max: number | null;
  currency: string | null;
}

function parseAmount(raw: string): number | null {
  const match = /^([\d.,]+)\s*(k|m|lakh|lac)?$/i.exec(raw.trim());
  if (!match) return null;
  let digits = match[1];
  // "50,000" and "50.000" are thousands separators; "50.5" is a decimal.
  if (/^\d{1,3}([.,]\d{3})+$/.test(digits)) digits = digits.replace(/[.,]/g, '');
  else digits = digits.replace(/,/g, '');
  let value = Number(digits);
  if (!Number.isFinite(value)) return null;
  const suffix = match[2]?.toLowerCase();
  if (suffix === 'k') value *= 1_000;
  else if (suffix === 'm') value *= 1_000_000;
  else if (suffix === 'lakh' || suffix === 'lac') value *= 100_000;
  return value > 0 && value < 2_000_000_000 ? Math.round(value) : null;
}

/**
 * Extracts a salary range from text such as "$120k - $150k", "BDT 50,000-70,000 /month"
 * or "€65.000". Returns the cleaned text even when no numbers can be parsed.
 */
export function parseSalary(input: string | null | undefined): ParsedSalary {
  const empty: ParsedSalary = { text: null, min: null, max: null, currency: null };
  if (!input) return empty;
  const text = input.replace(/\s+/g, ' ').trim().slice(0, 160);
  if (!text || /^(negotiable|competitive|n\/?a|not specified|tbd|-+)$/i.test(text)) {
    return { ...empty, text: text && !/^(n\/?a|not specified|-+)$/i.test(text) ? text : null };
  }

  let currency: string | null = null;
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (text.includes(symbol)) {
      currency = code;
      break;
    }
  }
  if (!currency) {
    const code = CURRENCY_CODES.find(candidate => new RegExp(`\\b${candidate}\\b`, 'i').test(text));
    if (code) currency = code.toUpperCase() === 'TK' ? 'BDT' : code.toUpperCase();
  }

  const amounts = Array.from(text.matchAll(/(\d[\d.,]*\s*(?:k|m|lakh|lac)?)(?![\d%])/gi))
    .map(match => parseAmount(match[1]))
    .filter((value): value is number => value !== null && value >= 100);

  if (amounts.length === 0) return { text, min: null, max: null, currency };
  const min = Math.min(...amounts.slice(0, 2));
  const max = Math.max(...amounts.slice(0, 2));
  return { text, min, max: amounts.length > 1 ? max : null, currency };
}

/** Parses a date from the many shapes sources use. Rejects implausible results. */
export function parseDate(input: unknown): Date | null {
  if (input === null || input === undefined || input === '') return null;

  let date: Date;
  if (input instanceof Date) {
    date = input;
  } else if (typeof input === 'number') {
    date = new Date(input < 1e12 ? input * 1000 : input);
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (/^\d{10}$/.test(trimmed)) date = new Date(Number(trimmed) * 1000);
    else if (/^\d{13}$/.test(trimmed)) date = new Date(Number(trimmed));
    else {
      const cleaned = trimmed
        .replace(/(\d+)(st|nd|rd|th)\b/gi, '$1')
        .replace(/^(posted|published|deadline|apply by|closing date)\s*(on)?\s*:?\s*/i, '');
      date = new Date(cleaned);
    }
  } else {
    return null;
  }

  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const thisYear = new Date().getUTCFullYear();
  // A posting date decades away is a parsing accident, not a fact.
  if (year < 2000 || year > thisYear + 3) return null;
  return date;
}

/** Deadlines with no time component mean "until the end of that day". */
export function endOfDayIfDateOnly(input: unknown, parsed: Date | null): Date | null {
  if (!parsed) return null;
  if (typeof input === 'string' && !/[T ]\d{1,2}:\d{2}/.test(input)) {
    const end = new Date(parsed);
    end.setUTCHours(23, 59, 59, 999);
    return end;
  }
  return parsed;
}
