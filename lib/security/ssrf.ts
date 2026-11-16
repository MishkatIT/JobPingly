import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * SSRF protection for every URL that originates from a user or from scraped
 * content.
 *
 * Two layers:
 *  1. `checkUrlSyntax`   - cheap, synchronous checks on the URL text. Used when
 *                          a user submits a URL, to give immediate feedback.
 *  2. `assertPublicUrl`  - resolves the hostname and rejects it if ANY resolved
 *                          address is private, loopback, link-local, or
 *                          otherwise non-routable. Used immediately before every
 *                          outbound request, and again for every redirect hop
 *                          (see lib/monitoring/http.ts).
 *
 * The second layer is what actually stops SSRF: a hostname such as
 * `internal.attacker.example` passes any text check and then resolves to
 * 169.254.169.254.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'metadata.azure.com',
  'instance-data',
  'kubernetes.default',
  'kubernetes.default.svc',
]);

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home', '.corp', '.cluster.local'];

const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);

const TRACKING_PARAMS = new Set(['ref', 'fbclid', 'gclid', 'mc_eid', 'mc_cid', '_ga', '_gl', 'msclkid', 'igshid']);

export interface UrlCheck {
  safe: boolean;
  reason?: string;
  normalizedUrl?: string;
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function inRange(ip: number, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ip & mask) === (ipv4ToInt(base) & mask);
}

const BLOCKED_V4_RANGES: [string, number][] = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
];

export function isPrivateIPv4(ip: string): boolean {
  if (net.isIPv4(ip) === false) return true;
  const value = ipv4ToInt(ip);
  return BLOCKED_V4_RANGES.some(([base, bits]) => inRange(value, base, bits));
}

export function isPrivateIPv6(input: string): boolean {
  const ip = input.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (!net.isIPv6(ip)) return true;
  if (ip === '::' || ip === '::1') return true;

  // IPv4-mapped (::ffff:a.b.c.d or ::ffff:hhhh:hhhh) and IPv4-compatible forms.
  const mappedDotted = ip.match(/^::(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mappedDotted) return isPrivateIPv4(mappedDotted[1]);
  const mappedHex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const high = parseInt(mappedHex[1], 16);
    const low = parseInt(mappedHex[2], 16);
    return isPrivateIPv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }

  const firstGroup = parseInt(ip.split(':')[0] || '0', 16);
  if ((firstGroup & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((firstGroup & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((firstGroup & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (ip.startsWith('64:ff9b:')) return true; // NAT64
  if (ip.startsWith('2001:db8:')) return true; // documentation
  if (firstGroup === 0x2002) return true; // 6to4, can embed private v4
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  return isPrivateIPv6(ip);
}

/**
 * Canonical form used to deduplicate career pages: https, lower-case host,
 * no fragment, no tracking parameters, no trailing slash.
 */
export function normalizeCompanyUrl(inputUrl: string): string {
  let raw = (inputUrl || '').trim();
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  const parsed = new URL(raw);
  parsed.protocol = 'https:';
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = '';
  parsed.username = '';
  parsed.password = '';
  if (parsed.port === '443' || parsed.port === '80') parsed.port = '';

  let pathname = parsed.pathname.replace(/\/+/g, '/');
  if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);
  parsed.pathname = pathname;

  const params = new URLSearchParams(parsed.search);
  for (const key of Array.from(params.keys())) {
    if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMS.has(key.toLowerCase())) params.delete(key);
  }
  const query = params.toString();
  parsed.search = query ? `?${query}` : '';

  let result = parsed.toString();
  if (parsed.pathname === '/' && !query && result.endsWith('/')) result = result.slice(0, -1);
  return result;
}

/** Synchronous checks on the URL text. Does not resolve DNS. */
export function checkUrlSyntax(inputUrl: string): UrlCheck {
  let raw = (inputUrl || '').trim();
  if (!raw) return { safe: false, reason: 'Enter a URL.' };
  if (raw.length > 2048) return { safe: false, reason: 'That URL is too long.' };
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) {
    return { safe: false, reason: 'Only http and https URLs are supported.' };
  }
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { safe: false, reason: 'That does not look like a valid URL.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: 'Only http and https URLs are supported.' };
  }
  if (parsed.username || parsed.password) {
    return { safe: false, reason: 'URLs containing credentials are not allowed.' };
  }
  if (!ALLOWED_PORTS.has(parsed.port)) {
    return { safe: false, reason: `Port ${parsed.port} is not allowed.` };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const bareHost = hostname.replace(/^\[|\]$/g, '');

  if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_SUFFIXES.some(suffix => hostname.endsWith(suffix))) {
    return { safe: false, reason: 'That host is not publicly reachable.' };
  }

  // WHATWG URL parsing has already canonicalised decimal, octal and hex IPv4
  // forms (e.g. 2130706433, 0x7f.1) into dotted quads, so this covers them.
  if (net.isIP(bareHost)) {
    if (isPrivateAddress(bareHost)) return { safe: false, reason: 'Private and internal addresses are not allowed.' };
  } else if (!hostname.includes('.')) {
    return { safe: false, reason: 'Enter a full domain name, for example company.com/careers.' };
  }

  try {
    return { safe: true, normalizedUrl: normalizeCompanyUrl(raw) };
  } catch {
    return { safe: false, reason: 'That does not look like a valid URL.' };
  }
}

/** @deprecated Name kept for existing callers; identical to checkUrlSyntax. */
export const isUrlSafe = checkUrlSyntax;

export type DnsLookup = (hostname: string) => Promise<string[]>;

const systemLookup: DnsLookup = async hostname => {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  return records.map(record => record.address);
};

let lookupOverride: DnsLookup | null = null;

/**
 * Replaces DNS resolution for the URL checks. Only the test suite uses this,
 * so tests never depend on the network. Pass null to restore system DNS.
 */
export function setDnsLookupForTests(lookup: DnsLookup | null): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('setDnsLookupForTests is only available in tests.');
  lookupOverride = lookup;
}

const defaultLookup: DnsLookup = hostname => (lookupOverride ?? systemLookup)(hostname);

/**
 * Throws UnsafeUrlError unless the URL is http(s) and every address its
 * hostname resolves to is publicly routable. Returns the resolved addresses.
 */
export async function assertPublicUrl(inputUrl: string, lookup: DnsLookup = defaultLookup): Promise<string[]> {
  const syntax = checkUrlSyntax(inputUrl);
  if (!syntax.safe) throw new UnsafeUrlError(syntax.reason || 'URL is not allowed.');

  const hostname = new URL(/^https?:\/\//i.test(inputUrl) ? inputUrl : `https://${inputUrl}`).hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(hostname)) return [hostname];

  let addresses: string[];
  try {
    addresses = await lookup(hostname);
  } catch {
    throw new UnsafeUrlError(`Could not resolve ${hostname}.`);
  }
  if (addresses.length === 0) throw new UnsafeUrlError(`Could not resolve ${hostname}.`);

  const blocked = addresses.find(isPrivateAddress);
  if (blocked) throw new UnsafeUrlError(`${hostname} resolves to a private or internal address.`);
  return addresses;
}

/** True for a URL that is safe to render as a link (blocks javascript:, data:, etc.). */
export function isSafeHref(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
