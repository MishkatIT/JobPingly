/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== 'production';

// Google Identity Services is the only third-party origin the app loads code from.
const GOOGLE = 'https://accounts.google.com';

// A nonce-based policy would force every page to render dynamically, which
// would cost the public pages their static caching. 'unsafe-inline' is
// therefore allowed for scripts; the app never renders user-supplied HTML
// (no dangerouslySetInnerHTML outside the static theme bootstrap), and the
// remaining directives still block framing, plugin content, cross-origin
// form posts and data exfiltration to arbitrary hosts.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval' " : ''}${GOOGLE}`,
  `style-src 'self' 'unsafe-inline' ${GOOGLE}`,
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${GOOGLE}${isDev ? ' ws: wss:' : ''}`,
  `frame-src ${GOOGLE}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]),
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // Keep heavy server-only parsers out of the bundler; they are loaded from
  // node_modules at runtime.
  serverExternalPackages: ['cheerio', 'postgres', 'bcryptjs'],
  images: {
    // Company logos and avatars are small and arrive from arbitrary hosts;
    // they are rendered with plain <img>, so the optimizer endpoint is not
    // needed and stays closed to remote sources.
    remotePatterns: [],
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  async headers() {
    // API caching is decided per response (see lib/api/route.ts).
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async redirects() {
    // Addresses used by v1 that may still be bookmarked or sitting in old emails.
    return [
      { source: '/dashboard/lists', destination: '/dashboard/watchlists', permanent: true },
      { source: '/dashboard/lists/:id', destination: '/dashboard/watchlists/:id', permanent: true },
      {
        source: '/api/collaborators/accept',
        has: [{ type: 'query', key: 'token', value: '(?<token>[0-9a-fA-F-]{36})' }],
        destination: '/invite/:token',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
