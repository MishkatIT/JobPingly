import { UnsafeUrlError } from '@/lib/security/ssrf';

/**
 * Failure taxonomy for scans. Every failed scan is stored with one of these
 * classes so the admin panel can group failures by cause and so the scheduler
 * can tell a blip (retry soon) from a dead end (stop trying).
 */
export const ERROR_CLASSES = {
  timeout: { label: 'Timed out', retryable: true, hint: 'The site was too slow to respond. It will be retried automatically.' },
  dns: { label: 'Domain not found', retryable: true, hint: 'The domain did not resolve. Check the URL for typos.' },
  network: { label: 'Connection failed', retryable: true, hint: 'The connection was refused or reset.' },
  tls: { label: 'Certificate problem', retryable: true, hint: 'The site has an invalid or expired TLS certificate.' },
  http_404: { label: 'Page not found (404)', retryable: false, hint: 'The careers page has moved. Update the URL.' },
  http_403: { label: 'Access denied (403)', retryable: true, hint: 'The site is blocking automated requests.' },
  http_429: { label: 'Rate limited (429)', retryable: true, hint: 'The site asked us to slow down. The next scan is delayed.' },
  http_4xx: { label: 'Request rejected (4xx)', retryable: false, hint: 'The site rejected the request.' },
  http_5xx: { label: 'Site error (5xx)', retryable: true, hint: 'The site returned a server error.' },
  blocked: { label: 'Bot protection', retryable: true, hint: 'A bot-protection challenge was served instead of the page.' },
  unsafe_url: { label: 'Unsafe URL', retryable: false, hint: 'The URL points to a private or internal address and will not be fetched.' },
  robots_disallowed: { label: 'Disallowed by robots.txt', retryable: false, hint: 'The site asks crawlers not to fetch this page.' },
  too_large: { label: 'Response too large', retryable: false, hint: 'The page exceeded the size limit.' },
  redirect_loop: { label: 'Too many redirects', retryable: false, hint: 'The URL redirects in a loop.' },
  parse: { label: 'Could not read the response', retryable: true, hint: 'The response was not in the expected format. The site may have changed.' },
  ai_failed: { label: 'AI extraction failed', retryable: true, hint: 'The language model did not return a usable answer.' },
  js_rendered: { label: 'JavaScript-rendered page', retryable: false, hint: 'The page builds its job list in the browser. Use the company\'s ATS job-board URL instead.' },
  not_found_on_ats: { label: 'Job board not found', retryable: false, hint: 'The ATS reports that this job board does not exist. Check the board name in the URL.' },
  unknown: { label: 'Unexpected error', retryable: true, hint: 'An unexpected error occurred.' },
} as const;

export type ErrorClass = keyof typeof ERROR_CLASSES;

export class ScanError extends Error {
  readonly errorClass: ErrorClass;
  readonly httpStatus?: number;
  readonly retryAfterSeconds?: number;

  constructor(errorClass: ErrorClass, message: string, options: { httpStatus?: number; retryAfterSeconds?: number; cause?: unknown } = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ScanError';
    this.errorClass = errorClass;
    this.httpStatus = options.httpStatus;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  get retryable(): boolean {
    return ERROR_CLASSES[this.errorClass].retryable;
  }
}

export function classForStatus(status: number): ErrorClass {
  if (status === 404 || status === 410) return 'http_404';
  if (status === 401 || status === 403) return 'http_403';
  if (status === 429) return 'http_429';
  if (status >= 500) return 'http_5xx';
  return 'http_4xx';
}

/** Converts any thrown value into a ScanError. */
export function toScanError(error: unknown): ScanError {
  if (error instanceof ScanError) return error;
  if (error instanceof UnsafeUrlError) return new ScanError('unsafe_url', error.message, { cause: error });

  const err = error as { name?: string; code?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = err?.code ?? err?.cause?.code ?? '';
  const message = err?.message ?? String(error);
  const causeMessage = err?.cause?.message ? `${message}: ${err.cause.message}` : message;

  if (code === 'ESSRF') {
    return new ScanError('unsafe_url', err?.cause?.message ?? message, { cause: error });
  }
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'UND_ERR_HEADERS_TIMEOUT' || code === 'UND_ERR_BODY_TIMEOUT' || code === 'ETIMEDOUT') {
    return new ScanError('timeout', 'The request timed out.', { cause: error });
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'EAI_NODATA') {
    return new ScanError('dns', 'The domain could not be resolved.', { cause: error });
  }
  if (['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_SOCKET'].includes(code)) {
    return new ScanError('network', 'The connection failed.', { cause: error });
  }
  if (code.startsWith('ERR_TLS') || code.startsWith('CERT_') || code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || /certificate/i.test(causeMessage)) {
    return new ScanError('tls', 'The site has a TLS certificate problem.', { cause: error });
  }
  if (err?.name === 'SyntaxError') {
    return new ScanError('parse', 'The response could not be parsed.', { cause: error });
  }
  if (message === 'fetch failed') {
    return new ScanError('network', causeMessage.slice(0, 200), { cause: error });
  }
  return new ScanError('unknown', message.slice(0, 300), { cause: error });
}

export function describeErrorClass(errorClass: string | null | undefined): { label: string; hint: string } {
  if (errorClass && errorClass in ERROR_CLASSES) {
    const { label, hint } = ERROR_CLASSES[errorClass as ErrorClass];
    return { label, hint };
  }
  return { label: 'Error', hint: '' };
}
