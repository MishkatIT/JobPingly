/**
 * Errors that map cleanly onto an HTTP response. Throw these from anywhere
 * inside a route handler; the `route()` wrapper turns them into the standard
 * error envelope.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly headers?: Record<string, string>;

  constructor(status: number, code: string, message: string, details?: unknown, headers?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}

export const errors = {
  badRequest: (message = 'The request is invalid.', details?: unknown) =>
    new ApiError(400, 'bad_request', message, details),
  validation: (details: unknown, message = 'Some fields are invalid.') =>
    new ApiError(400, 'validation_error', message, details),
  unauthorized: (message = 'You need to sign in to do that.') => new ApiError(401, 'unauthorized', message),
  forbidden: (message = 'You do not have permission to do that.') => new ApiError(403, 'forbidden', message),
  notFound: (what = 'Resource') => new ApiError(404, 'not_found', `${what} was not found.`),
  conflict: (message: string, details?: unknown) => new ApiError(409, 'conflict', message, details),
  gone: (message: string) => new ApiError(410, 'gone', message),
  unprocessable: (message: string, details?: unknown) => new ApiError(422, 'unprocessable', message, details),
  limitReached: (message: string, details?: unknown) => new ApiError(403, 'limit_reached', message, details),
  tooManyRequests: (retryAfterSeconds: number, message?: string) =>
    new ApiError(
      429,
      'rate_limited',
      message ?? `Too many requests. Try again in ${retryAfterSeconds} seconds.`,
      { retryAfterSeconds },
      { 'Retry-After': String(retryAfterSeconds) },
    ),
  unavailable: (message = 'This feature is temporarily unavailable.') =>
    new ApiError(503, 'unavailable', message),
};
