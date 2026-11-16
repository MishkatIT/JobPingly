import { createHttpClient, type HttpClient } from '@/lib/monitoring/http';

/**
 * A scripted web for tests: maps URLs (or URL prefixes) to responses, so the
 * monitoring engine can be exercised end to end without any network access.
 */

export type FakeRoute =
  | { status?: number; json: unknown; headers?: Record<string, string> }
  | { status?: number; body: string; headers?: Record<string, string> }
  | ((request: { url: string; method: string; body: string | null }) => FakeRoute)
  | Error;

export interface FakeWeb {
  routes: Map<string, FakeRoute>;
  requests: { url: string; method: string }[];
  set(url: string, route: FakeRoute): void;
  client(): HttpClient;
}

function toResponse(route: Exclude<FakeRoute, Error | ((...args: never[]) => unknown)>): Response {
  const status = route.status ?? 200;
  if ('json' in route) {
    return new Response(JSON.stringify(route.json), { status, headers: { 'content-type': 'application/json', ...route.headers } });
  }
  return new Response(route.body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...route.headers } });
}

export function fakeWeb(initial: Record<string, FakeRoute> = {}): FakeWeb {
  const routes = new Map(Object.entries(initial));
  const requests: { url: string; method: string }[] = [];

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? 'GET';
    requests.push({ url, method });

    let route = routes.get(url);
    if (!route) {
      // Fall back to the longest matching prefix, so tests can stub API bases.
      const prefix = Array.from(routes.keys())
        .filter(key => key.endsWith('*') && url.startsWith(key.slice(0, -1)))
        .sort((a, b) => b.length - a.length)[0];
      route = prefix ? routes.get(prefix) : undefined;
    }
    if (!route) return new Response('Not found', { status: 404 });
    if (route instanceof Error) throw route;
    if (typeof route === 'function') {
      const resolved = route({ url, method, body: typeof init?.body === 'string' ? init.body : null });
      if (resolved instanceof Error) throw resolved;
      return toResponse(resolved as Exclude<FakeRoute, Error | ((...args: never[]) => unknown)>);
    }
    return toResponse(route);
  }) as typeof fetch;

  return {
    routes,
    requests,
    set(url, route) {
      routes.set(url, route);
    },
    client() {
      return createHttpClient({
        fetchImpl,
        // Every hostname in tests resolves to a public documentation-safe address,
        // except names under .internal-test which resolve to a private one.
        lookup: async hostname => (hostname.endsWith('.internal-test.example') ? ['10.0.0.8'] : ['93.184.216.34']),
        polite: false,
        sleep: async () => {},
      });
    },
  };
}
