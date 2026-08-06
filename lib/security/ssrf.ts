import { URL } from 'url';

const BLOCKED_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '169.254.169.254', // AWS/GCP metadata
  'metadata.google.internal',
];

export function isUrlSafe(inputUrl: string): { safe: boolean; reason?: string; normalizedUrl?: string } {
  try {
    const parsed = new URL(inputUrl);

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

    // Normalize URL
    parsed.hostname = hostname;

    // Trailing slash normalization
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    // Strip tracking query parameters
    const searchParams = new URLSearchParams(parsed.search);
    const keysToDelete: string[] = [];
    searchParams.forEach((_, key) => {
      if (key.startsWith('utm_') || key === 'ref' || key === 'fbclid' || key === 'gclid') {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => searchParams.delete(key));

    parsed.search = searchParams.toString() ? `?${searchParams.toString()}` : '';

    return { safe: true, normalizedUrl: parsed.toString() };
  } catch (err: any) {
    return { safe: false, reason: 'Invalid URL format.' };
  }
}
