import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z, type ZodType } from 'zod';
import { can, isStaff, type Permission } from '@/lib/auth/rbac';
import { currentSessionToken, getSession, markCookieIssued, setSessionCookie, shouldRefreshCookie, type Session, type SessionUser } from '@/lib/auth/session';
import { getClientIp, rateLimit } from '@/lib/security/rateLimit';
import { getSetting } from '@/lib/settings/store';
import { ApiError, errors } from './errors';

/**
 * The single entry point for API route handlers.
 *
 *   export const POST = route(
 *     { permission: 'sources.manage', body: schema, rateLimit: {...} },
 *     async ({ user, body }) => { ...; return created(row); },
 *   );
 *
 * It provides, in order: rate limiting, authentication, authorisation,
 * maintenance-mode gating, input validation (params, query, JSON body) and a
 * uniform response envelope:
 *
 *   success  { "data": ..., "meta"?: ... }
 *   failure  { "error": { "code", "message", "details"? } }
 *
 * Handlers either return a plain value (wrapped as `data`) or a Response.
 */

export type AuthMode = 'public' | 'optional' | 'user';

type UserFor<A extends AuthMode> = A extends 'user' ? SessionUser : SessionUser | null;

export interface RateLimitRule {
  /** Stable name for the limit; combined with the subject to form the key. */
  name: string;
  limit: number;
  windowSeconds: number;
  /** What the limit is counted against. Defaults to 'ip'. */
  by?: 'ip' | 'user';
  distributed?: boolean;
}

export interface RouteConfig<B, Q, P, A extends AuthMode> {
  /** 'user' (default) requires a session; 'optional' loads one if present; 'public' skips the lookup. */
  auth?: A;
  /** Requires a session whose role grants this permission. */
  permission?: Permission;
  body?: ZodType<B>;
  query?: ZodType<Q>;
  params?: ZodType<P>;
  rateLimit?: RateLimitRule | RateLimitRule[];
  /** Maximum accepted JSON body size in bytes (default 100 KB). */
  maxBodyBytes?: number;
  /** Allow non-staff writes while maintenance mode is on (sign-in, sign-out). */
  allowInMaintenance?: boolean;
}

export interface RouteContext<B, Q, P, A extends AuthMode> {
  req: NextRequest;
  user: UserFor<A>;
  session: A extends 'user' ? Session : Session | null;
  body: B;
  query: Q;
  params: P;
  ip: string;
}

type NextRouteContext = { params: Promise<Record<string, string | string[] | undefined>> };

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function envelope(data: unknown, meta?: Record<string, unknown>) {
  return meta ? { data, meta } : { data };
}

export function ok<T>(data: T, meta?: Record<string, unknown>, init?: ResponseInit): NextResponse {
  return NextResponse.json(envelope(data, meta), init);
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json(envelope(data), { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

export function paginated<T>(items: T[], meta: PageMeta, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json(
    envelope(items, {
      page: meta.page,
      pageSize: meta.pageSize,
      total: meta.total,
      totalPages: Math.max(1, Math.ceil(meta.total / meta.pageSize)),
      ...extra,
    }),
  );
}

export function errorResponse(error: ApiError): NextResponse {
  return NextResponse.json(
    { error: { code: error.code, message: error.message, ...(error.details !== undefined ? { details: error.details } : {}) } },
    { status: error.status, headers: error.headers },
  );
}

function formatZodIssues(error: z.ZodError): { field: string; message: string }[] {
  return error.issues.slice(0, 20).map(issue => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/** Maps a thrown value onto an ApiError. Unknown errors become an opaque 500. */
function toApiError(error: unknown, requestId: string, label: string): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof z.ZodError) return errors.validation(formatZodIssues(error));

  const pg = error as { code?: string; message?: string; constraint_name?: string };
  switch (pg?.code) {
    case '22P02': // invalid text representation, e.g. a malformed uuid
    case '22003': // numeric value out of range
    case '22007': // invalid datetime format
      return errors.badRequest('One of the supplied values is not valid.');
    case '23505':
      return errors.conflict('That already exists.');
    case '23503':
      return errors.conflict('That record is referenced by other data, or refers to something that no longer exists.');
    case '23502':
    case '23514':
      return errors.badRequest('A required value is missing or invalid.');
    case '57014':
      return errors.unavailable('The request took too long. Please try again.');
  }

  console.error(`[api] ${label} failed (request ${requestId}):`, error);
  return new ApiError(500, 'internal_error', 'Something went wrong on our side. Please try again.', { requestId });
}

async function readJsonBody(req: NextRequest, maxBytes: number): Promise<unknown> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new ApiError(413, 'payload_too_large', 'The request body is too large.');

  const text = await req.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new ApiError(413, 'payload_too_large', 'The request body is too large.');
  }
  if (text.trim() === '') return {};
  try {
    return JSON.parse(text);
  } catch {
    throw errors.badRequest('The request body must be valid JSON.');
  }
}

function searchParamsToObject(params: URLSearchParams): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    result[key] = values.length > 1 ? values : values[0];
  }
  return result;
}

export function route<B = undefined, Q = undefined, P = undefined, A extends AuthMode = 'user'>(
  config: RouteConfig<B, Q, P, A>,
  handler: (context: RouteContext<B, Q, P, A>) => Promise<unknown> | unknown,
) {
  const authMode: AuthMode = config.permission ? 'user' : (config.auth ?? 'user');
  const limits = config.rateLimit ? (Array.isArray(config.rateLimit) ? config.rateLimit : [config.rateLimit]) : [];

  return async function routeHandler(req: NextRequest, nextContext: NextRouteContext): Promise<Response> {
    const requestId = crypto.randomBytes(6).toString('hex');
    const label = `${req.method} ${req.nextUrl.pathname}`;

    try {
      const ip = getClientIp(req);

      for (const rule of limits.filter(rule => (rule.by ?? 'ip') === 'ip')) {
        const result = await rateLimit({
          key: `${rule.name}:ip:${ip}`,
          limit: rule.limit,
          windowSeconds: rule.windowSeconds,
          distributed: rule.distributed,
        });
        if (!result.allowed) throw errors.tooManyRequests(result.retryAfterSeconds);
      }

      const session = authMode === 'public' ? null : await getSession(req);
      if (authMode === 'user' && !session) throw errors.unauthorized();
      if (config.permission && !can(session!.user.role, config.permission)) throw errors.forbidden();

      for (const rule of limits.filter(rule => rule.by === 'user')) {
        const subject = session?.user.id ?? `ip:${ip}`;
        const result = await rateLimit({
          key: `${rule.name}:user:${subject}`,
          limit: rule.limit,
          windowSeconds: rule.windowSeconds,
          distributed: rule.distributed,
        });
        if (!result.allowed) throw errors.tooManyRequests(result.retryAfterSeconds);
      }

      if (!SAFE_METHODS.has(req.method) && !config.allowInMaintenance && !isStaff(session?.user.role)) {
        if (await getSetting('platform.maintenance_mode')) {
          throw errors.unavailable(await getSetting('platform.maintenance_message'));
        }
      }

      const rawParams = nextContext?.params ? await nextContext.params : {};
      const params = config.params ? config.params.parse(rawParams) : (rawParams as P);
      const query = config.query ? config.query.parse(searchParamsToObject(req.nextUrl.searchParams)) : (undefined as Q);
      const body = config.body
        ? config.body.parse(await readJsonBody(req, config.maxBodyBytes ?? 100 * 1024))
        : (undefined as B);

      const result = await handler({
        req,
        user: (session?.user ?? null) as UserFor<A>,
        session: session as RouteContext<B, Q, P, A>['session'],
        body,
        query,
        params,
        ip,
      });

      const response =
        result instanceof Response
          ? (result as NextResponse)
          : result === undefined
            ? noContent()
            : NextResponse.json(envelope(result));

      // Keep the cookie's expiry in step with the sliding session, and move
      // pre-v2 cookies over to the current cookie name.
      if (session && response instanceof NextResponse && !response.headers.has('set-cookie') && shouldRefreshCookie(session)) {
        const token = currentSessionToken(req);
        if (token) {
          setSessionCookie(response, token, session.expiresAt);
          markCookieIssued(session.id);
        }
      }
      // API responses are private unless a handler opts into caching.
      if (!response.headers.has('cache-control')) response.headers.set('cache-control', 'no-store');
      return response;
    } catch (error) {
      const failure = errorResponse(toApiError(error, requestId, label));
      failure.headers.set('cache-control', 'no-store');
      return failure;
    }
  };
}

// ---------------------------------------------------------------------------
// Shared validation building blocks
// ---------------------------------------------------------------------------

export const idParams = z.object({ id: z.uuid('That id is not valid.') });

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** A trimmed search string, or undefined when empty. */
export const searchString = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform(value => (value ? value : undefined));

/** Accepts "true"/"false"/"1"/"0" from a query string. */
export const queryBoolean = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform(value => (value === undefined ? undefined : value === 'true' || value === '1'));

export function sortQuery<T extends readonly [string, ...string[]]>(fields: T, fallback: T[number]) {
  return z.object({
    sort: z.enum(fields).default(fallback as never),
    order: z.enum(['asc', 'desc']).default('desc'),
  });
}

/** Escapes LIKE wildcards so user input is matched literally. */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, char => `\\${char}`)}%`;
}

export function offsetOf(query: { page: number; pageSize: number }): number {
  return (query.page - 1) * query.pageSize;
}
