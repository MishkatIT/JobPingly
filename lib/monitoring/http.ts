import dns from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { assertPublicUrl, isPrivateAddress, type DnsLookup } from '@/lib/security/ssrf';
import { ScanError, classForStatus, toScanError } from './errors';

/**
 * The only way the monitoring engine talks to the internet.
 *
 * Guarantees for every request:
 *  - SSRF: the target, and every redirect hop, is resolved and rejected if it
 *    points at a private or internal address. The check is repeated inside
 *    the socket's own DNS lookup, so the address that was vetted is the
 *    address that is connected to (no DNS-rebinding window).
 *  - Bounded: a hard timeout and a response-size cap, so one slow or huge page
 *    cannot stall or exhaust a worker.
 *  - Polite: requests to the same host are spaced out and limited in
 *    parallelism; the bot identifies itself honestly.
 *  - Resilient: transient failures (network errors, 5xx, 429) are retried
 *    with exponential backoff and jitter, honouring Retry-After.
 */

export const BOT_USER_AGENT = 'JobPinglyBot/2.0 (+https://jobpingly.onrender.com/bot; job-alert monitor)';

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const PER_HOST_CONCURRENCY = 2;
const PER_HOST_MIN_GAP_MS = 400;

export interface HttpRequest {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  /** Number of retries for transient failures (default 2). */
  retries?: number;
  /** Treat these statuses as a normal response instead of throwing. */
  acceptStatuses?: number[];
}

export interface HttpResponse {
  status: number;
  url: string;
  headers: Headers;
  text: string;
  bytes: number;
  durationMs: number;
}

export interface HttpClient {
  request(url: string, options?: HttpRequest): Promise<HttpResponse>;
  getText(url: string, options?: HttpRequest): Promise<HttpResponse>;
  getJson<T = unknown>(url: string, options?: HttpRequest): Promise<{ data: T; response: HttpResponse }>;
  postJson<T = unknown>(url: string, body: unknown, options?: HttpRequest): Promise<{ data: T; response: HttpResponse }>;
  /** Number of network requests made through this client. */
  readonly requestCount: number;
}

export interface HttpClientOptions {
  fetchImpl?: typeof fetch;
  lookup?: DnsLookup;
  /** Disable host spacing (tests). */
  polite?: boolean;
  sleep?: (ms: number) => Promise<void>;
  /** Hard ceiling on requests for one scan, so a misbehaving adapter cannot loop. */
  maxRequests?: number;
}

// --- Connection-level SSRF guard --------------------------------------------

type LookupCallback = (error: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void;

/**
 * DNS lookup used by the socket itself. Rejecting private addresses here means
 * a hostname cannot pass the pre-flight check and then resolve somewhere else
 * when the connection is actually opened.
 */
function guardedLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some(entry => isPrivateAddress(entry.address))) {
      const blocked: NodeJS.ErrnoException = new Error(`${hostname} resolves to a private or internal address.`);
      blocked.code = 'ESSRF';
      return callback(blocked);
    }
    if (options.all) callback(null, list);
    else callback(null, list[0].address, list[0].family);
  });
}

declare global {
  // eslint-disable-next-line no-var
  var __jpScanAgent: Agent | undefined;
}

function scanAgent(): Agent {
  return (globalThis.__jpScanAgent ??= new Agent({
    connect: { lookup: guardedLookup as never, timeout: 10_000 },
    headersTimeout: 30_000,
    bodyTimeout: 30_000,
    keepAliveTimeout: 10_000,
    connections: 8,
  }));
}

const guardedFetch: typeof fetch = ((input: string, init?: RequestInit) =>
  undiciFetch(input, { ...(init as object), dispatcher: scanAgent() } as never)) as never;

// --- Per-host politeness ----------------------------------------------------

interface HostState {
  active: number;
  lastStart: number;
  queue: (() => void)[];
}

declare global {
  // eslint-disable-next-line no-var
  var __jpHostStates: Map<string, HostState> | undefined;
}

const hostStates: Map<string, HostState> = (globalThis.__jpHostStates ??= new Map());

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function acquireHost(host: string, sleep: (ms: number) => Promise<void>): Promise<() => void> {
  let state = hostStates.get(host);
  if (!state) {
    state = { active: 0, lastStart: 0, queue: [] };
    hostStates.set(host, state);
  }
  const current = state;

  if (current.active >= PER_HOST_CONCURRENCY) {
    await new Promise<void>(resolve => current.queue.push(resolve));
  }
  current.active += 1;

  const wait = current.lastStart + PER_HOST_MIN_GAP_MS - Date.now();
  current.lastStart = Math.max(Date.now(), current.lastStart + PER_HOST_MIN_GAP_MS);
  if (wait > 0) await sleep(wait);

  return () => {
    current.active -= 1;
    const next = current.queue.shift();
    if (next) next();
    else if (current.active === 0 && hostStates.size > 500) hostStates.delete(host);
  };
}

// --- Body reading with a size cap -------------------------------------------

async function readCapped(response: Response, maxBytes: number): Promise<{ text: string; bytes: number }> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new ScanError('too_large', `Response is ${declared} bytes; the limit is ${maxBytes}.`);
  }
  if (!response.body) return { text: '', bytes: 0 };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ScanError('too_large', `Response exceeded the ${maxBytes}-byte limit.`);
    }
    chunks.push(value);
  }

  const buffer = Buffer.concat(chunks);
  const charset = /charset=([^;]+)/i.exec(response.headers.get('content-type') ?? '')?.[1]?.trim().toLowerCase();
  try {
    return { text: new TextDecoder(charset || 'utf-8').decode(buffer), bytes };
  } catch {
    return { text: buffer.toString('utf8'), bytes };
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(seconds, 3600));
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, Math.min((date - Date.now()) / 1000, 3600));
  return undefined;
}

/** Detects the common "prove you are human" interstitials served with a 200 or 403. */
function looksLikeBotChallenge(status: number, text: string, headers: Headers): boolean {
  if (status !== 403 && status !== 503 && status !== 200) return false;
  if (headers.get('cf-mitigated') === 'challenge') return true;
  if (text.length > 60_000) return false;
  return /just a moment\.\.\.|cf-browser-verification|challenge-platform|attention required! \| cloudflare|px-captcha|perimeterx|datadome|incapsula incident|access denied<\/title>|are you a robot/i.test(text);
}

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const fetchImpl = options.fetchImpl ?? guardedFetch;
  const sleep = options.sleep ?? defaultSleep;
  const polite = options.polite ?? true;
  const maxRequests = options.maxRequests ?? 150;
  let requestCount = 0;

  async function once(inputUrl: string, request: HttpRequest): Promise<HttpResponse> {
    const started = Date.now();
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBytes = request.maxBytes ?? DEFAULT_MAX_BYTES;
    const deadline = AbortSignal.timeout(timeoutMs);

    let currentUrl = inputUrl;
    let method = request.method ?? 'GET';
    let body = request.body;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // Resolve and vet the target on every hop: a public page may redirect
      // to an internal address.
      await assertPublicUrl(currentUrl, options.lookup);

      if (++requestCount > maxRequests) {
        throw new ScanError('unknown', `Scan exceeded the limit of ${maxRequests} requests.`);
      }

      const host = new URL(currentUrl).host;
      const release = polite ? await acquireHost(host, sleep) : () => {};
      let response: Response;
      try {
        response = await fetchImpl(currentUrl, {
          method,
          body,
          redirect: 'manual',
          signal: deadline,
          headers: {
            'User-Agent': BOT_USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            ...request.headers,
          },
        });
      } finally {
        release();
      }

      if (response.status >= 300 && response.status < 400 && response.status !== 304) {
        const location = response.headers.get('location');
        await response.body?.cancel().catch(() => {});
        if (!location) throw new ScanError('http_4xx', `Redirect (${response.status}) without a Location header.`, { httpStatus: response.status });
        currentUrl = new URL(location, currentUrl).toString();
        // Per the Fetch standard, 303 always becomes GET, and 301/302 do for POST.
        if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
          method = 'GET';
          body = undefined;
        }
        continue;
      }

      const { text, bytes } = await readCapped(response, maxBytes);
      const result: HttpResponse = {
        status: response.status,
        url: currentUrl,
        headers: response.headers,
        text,
        bytes,
        durationMs: Date.now() - started,
      };

      if (looksLikeBotChallenge(response.status, text, response.headers)) {
        throw new ScanError('blocked', 'The site served a bot-protection challenge.', { httpStatus: response.status });
      }
      if (response.ok || request.acceptStatuses?.includes(response.status)) return result;

      throw new ScanError(classForStatus(response.status), `The site responded with HTTP ${response.status}.`, {
        httpStatus: response.status,
        retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after')),
      });
    }

    throw new ScanError('redirect_loop', `More than ${MAX_REDIRECTS} redirects.`);
  }

  async function request(url: string, requestOptions: HttpRequest = {}): Promise<HttpResponse> {
    const retries = requestOptions.retries ?? 2;
    let lastError: ScanError | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await once(url, requestOptions);
      } catch (error) {
        lastError = toScanError(error);
        const transient = ['timeout', 'network', 'http_5xx', 'http_429', 'dns'].includes(lastError.errorClass);
        if (!transient || attempt === retries) throw lastError;

        const backoff = Math.min(8000, 600 * 2 ** attempt) * (0.75 + Math.random() * 0.5);
        const retryAfter = lastError.retryAfterSeconds !== undefined ? lastError.retryAfterSeconds * 1000 : 0;
        // A long Retry-After is the site telling us to go away; do not hold a worker for it.
        if (retryAfter > 15_000) throw lastError;
        await sleep(Math.max(backoff, retryAfter));
      }
    }
    throw lastError ?? new ScanError('unknown', 'Request failed.');
  }

  function parseJson<T>(response: HttpResponse): T {
    try {
      return JSON.parse(response.text) as T;
    } catch {
      throw new ScanError('parse', 'Expected JSON but received something else.', { httpStatus: response.status });
    }
  }

  return {
    request,
    getText: (url, requestOptions) => request(url, { ...requestOptions, method: 'GET' }),
    async getJson<T>(url: string, requestOptions?: HttpRequest) {
      const response = await request(url, {
        ...requestOptions,
        method: 'GET',
        headers: { Accept: 'application/json', ...requestOptions?.headers },
      });
      return { data: parseJson<T>(response), response };
    },
    async postJson<T>(url: string, body: unknown, requestOptions?: HttpRequest) {
      const response = await request(url, {
        ...requestOptions,
        method: 'POST',
        body: JSON.stringify(body),
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...requestOptions?.headers },
      });
      return { data: parseJson<T>(response), response };
    },
    get requestCount() {
      return requestCount;
    },
  };
}
