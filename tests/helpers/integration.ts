import { NextRequest } from 'next/server';
import { client, db } from '@/lib/db/client';
import { careerPages, listCareerPages, listSubscriptions, lists, users } from '@/lib/db/schema';
import { hashPassword } from '@/lib/auth/password';
import { createSession, invalidateSessionCache } from '@/lib/auth/session';
import { consoleOutbox } from '@/lib/email/send';
import { invalidateSettingsCache, setSetting } from '@/lib/settings/store';
import { resetRateLimits } from '@/lib/security/rateLimit';
import { setDnsLookupForTests } from '@/lib/security/ssrf';
import type { SettingKey } from '@/lib/settings/registry';

export const BASE_URL = 'http://localhost:3000';

/** Every hostname resolves publicly except *.internal-test.example. */
export function useFakeDns(): void {
  setDnsLookupForTests(async hostname => (hostname.endsWith('.internal-test.example') ? ['10.0.0.8'] : ['93.184.216.34']));
}

/** Empties every table (keeping the schema) and resets in-memory state. */
export async function resetData(): Promise<void> {
  const tables = await client<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'
  `;
  if (tables.length > 0) {
    await client.unsafe(`TRUNCATE ${tables.map(table => `"${table.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }
  invalidateSettingsCache();
  invalidateSessionCache();
  resetRateLimits();
  consoleOutbox().length = 0;
  useFakeDns();
}

export async function setSettings(values: Partial<Record<SettingKey, unknown>>): Promise<void> {
  for (const [key, value] of Object.entries(values)) await setSetting(key, value, null);
  invalidateSettingsCache();
}

let counter = 0;

export interface TestUser {
  id: string;
  email: string;
  password: string;
  token: string;
  cookie: string;
}

export async function createUser(options: { role?: string; verified?: boolean; password?: string; name?: string; email?: string; plan?: string } = {}): Promise<TestUser> {
  counter += 1;
  const email = options.email ?? `user${counter}-${Date.now()}@example.com`;
  const password = options.password ?? 'correct horse battery staple';
  const [row] = await db
    .insert(users)
    .values({
      email,
      name: options.name ?? `Test User ${counter}`,
      passwordHash: await hashPassword(password),
      emailVerified: options.verified ?? true,
      role: options.role ?? 'user',
      plan: options.plan ?? 'free',
      onboardingCompletedAt: new Date(),
    })
    .returning({ id: users.id });

  let token = '';
  if (options.verified !== false) {
    const session = await createSession(row.id, { headers: new Headers({ 'user-agent': 'node-test' }) });
    token = session.token;
  }
  return { id: row.id, email, password, token, cookie: token ? `jp_session=${token}` : '' };
}

export async function createSource(url: string, fields: Partial<typeof careerPages.$inferInsert> = {}) {
  const [row] = await db.insert(careerPages).values({ url, companyName: fields.companyName ?? 'Acme', ...fields }).returning();
  return row;
}

export async function createListWithCompany(ownerId: string, sourceId: string, options: { visibility?: 'private' | 'public'; keywords?: string[]; name?: string } = {}) {
  counter += 1;
  const [list] = await db
    .insert(lists)
    .values({ userId: ownerId, name: options.name ?? `List ${counter}`, slug: `list-${counter}-${Date.now()}`, visibility: options.visibility ?? 'private' })
    .returning();
  await db.insert(listCareerPages).values({ listId: list.id, careerPageId: sourceId });
  await db.insert(listSubscriptions).values({ userId: ownerId, listId: list.id, alertsEnabled: true, positiveKeywords: options.keywords ?? [] });
  return list;
}

export interface CallOptions {
  method?: string;
  url?: string;
  body?: unknown;
  cookie?: string;
  params?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface CallResult<T = unknown> {
  status: number;
  body: { data?: T; meta?: Record<string, unknown>; error?: { code: string; message: string; details?: unknown } };
  headers: Headers;
}

type Handler = (req: NextRequest, context: { params: Promise<Record<string, string | string[] | undefined>> }) => Promise<Response>;

/** Invokes a route handler directly, the way Next.js would. */
export async function call<T = unknown>(handler: Handler, options: CallOptions = {}): Promise<CallResult<T>> {
  const method = options.method ?? (options.body !== undefined ? 'POST' : 'GET');
  const headers: Record<string, string> = { origin: BASE_URL, 'user-agent': 'node-test', ...options.headers };
  if (options.cookie) headers.cookie = options.cookie;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const request = new NextRequest(new URL(options.url ?? '/api/test', BASE_URL), {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const response = await handler(request, { params: Promise.resolve(options.params ?? {}) });
  const text = await response.text();
  let body: CallResult<T>['body'] = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { data: text as unknown as T };
  }
  return { status: response.status, body, headers: response.headers };
}

/** The most recent email sent to an address in this process. */
export function lastEmailTo(address: string) {
  return [...consoleOutbox()].reverse().find(entry => entry.to === address);
}

export function sessionCookieFrom(headers: Headers): string | null {
  const raw = headers.getSetCookie?.() ?? [];
  for (const cookie of raw) {
    const match = /^jp_session=([a-f0-9]{64})/.exec(cookie);
    if (match) return `jp_session=${match[1]}`;
  }
  return null;
}
