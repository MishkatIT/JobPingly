import { URL } from 'url';

const BLOCKED_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '169.254.169.254', // AWS/GCP metadata
  'metadata.google.internal',
];

export function normalizeCompanyUrl(inputUrl: string): string {
  let raw = (inputUrl || '').trim();
  if (!raw) return '';

  // If missing protocol, prepend https://
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }

  const parsed = new URL(raw);

  // Standardize http:// -> https:// for canonical company uniqueness unless standard non-http/https
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    parsed.protocol = 'https:';
  }

  parsed.hostname = parsed.hostname.toLowerCase();

  // Strip hash fragment
  parsed.hash = '';

  // Collapse multiple consecutive slashes in pathname
  let cleanPathname = parsed.pathname.replace(/\/+/g, '/');

  // Strip trailing slash if pathname has path segments
  if (cleanPathname.length > 1 && cleanPathname.endsWith('/')) {
    cleanPathname = cleanPathname.slice(0, -1);
  }
  parsed.pathname = cleanPathname;

  // Strip tracking query parameters
  const searchParams = new URLSearchParams(parsed.search);
  const keysToDelete: string[] = [];
  searchParams.forEach((_, key) => {
    if (
      key.startsWith('utm_') ||
      key === 'ref' ||
      key === 'fbclid' ||
      key === 'gclid' ||
      key === 'mc_eid' ||
      key === '_ga'
    ) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(key => searchParams.delete(key));

  parsed.search = searchParams.toString() ? `?${searchParams.toString()}` : '';

  let result = parsed.toString();

  // If root domain ends with trailing slash (e.g. 'https://company.com/'), trim it to 'https://company.com'
  if (result.endsWith('/') && parsed.pathname === '/') {
    result = result.slice(0, -1);
  }

  return result;
}

export function isUrlSafe(inputUrl: string): { safe: boolean; reason?: string; normalizedUrl?: string } {
  try {
    let raw = (inputUrl || '').trim();
    if (!raw) {
      return { safe: false, reason: 'Invalid or empty URL format.' };
    }
    if (!/^https?:\/\//i.test(raw)) {
      raw = `https://${raw}`;
    }

    const parsed = new URL(raw);

    // Protocol check
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { safe: false, reason: 'Only http and https protocols are allowed.' };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Blocked hostname check
    if (BLOCKED_HOSTNAMES.includes(hostname)) {
      return { safe: false, reason: `Access to target host '${hostname}' is restricted.` };
    }

    // IP address format check
    const ipMatch = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipMatch) {
      const [, p1, p2] = ipMatch.map(Number);

      // Loopback 127.0.0.0/8
      if (p1 === 127) return { safe: false, reason: 'Private IP addresses are not permitted.' };
      // Private 10.0.0.0/8
      if (p1 === 10) return { safe: false, reason: 'Private IP addresses are not permitted.' };
      // Private 172.16.0.0/12
      if (p1 === 172 && p2 >= 16 && p2 <= 31) return { safe: false, reason: 'Private IP addresses are not permitted.' };
      // Private 192.168.0.0/16
      if (p1 === 192 && p2 === 168) return { safe: false, reason: 'Private IP addresses are not permitted.' };
      // Link-local / AWS metadata 169.254.0.0/16
      if (p1 === 169 && p2 === 254) return { safe: false, reason: 'Link-local addresses are not permitted.' };
    }

    const normalizedUrl = normalizeCompanyUrl(raw);

    return { safe: true, normalizedUrl };
  } catch (err: any) {
    return { safe: false, reason: 'Invalid URL format.' };
  }
}
