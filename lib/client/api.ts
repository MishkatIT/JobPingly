/**
 * Browser-side API client.
 *
 * Every endpoint answers with the same envelope:
 *   success  { data, meta? }
 *   failure  { error: { code, message, details? } }
 *
 * `api()` unwraps the envelope and throws an `ApiClientError` on failure, so
 * callers never have to inspect status codes or guess at error shapes.
 */

export interface ApiMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  [key: string]: unknown;
}

export interface ApiResult<T> {
  data: T;
  meta?: ApiMeta;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Per-field messages from a validation error, keyed by field name. */
  get fieldErrors(): Record<string, string> {
    if (this.code !== 'validation_error' || !Array.isArray(this.details)) return {};
    const result: Record<string, string> = {};
    for (const item of this.details as { field?: string; message?: string }[]) {
      if (item?.field && item.message && !result[item.field]) result[item.field] = item.message;
    }
    return result;
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiRaw<T>(path: string, options: ApiOptions = {}): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
      signal: options.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiClientError(0, 'network_error', 'Could not reach JobPingly. Check your connection and try again.');
  }

  if (response.status === 204) return { data: undefined as T };

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiClientError(
      response.status,
      error?.code ?? 'http_error',
      error?.message ?? (response.status >= 500 ? 'Something went wrong on our side. Please try again.' : 'The request could not be completed.'),
      error?.details,
    );
  }

  return (payload ?? { data: undefined }) as ApiResult<T>;
}

/** Calls the API and returns just the `data` payload. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  return (await apiRaw<T>(path, options)).data;
}

/** SWR fetcher that keeps `meta` alongside `data`. */
export const swrFetcher = <T>(path: string): Promise<ApiResult<T>> => apiRaw<T>(path);

/** Builds a query string, skipping empty values. */
export function qs(params: Record<string, string | number | boolean | null | undefined | string[]>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(','));
      continue;
    }
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
