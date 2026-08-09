import { NextRequest } from 'next/server';

/**
 * Dynamically determines the current hosted base URL (e.g., http://localhost:3000 or https://yourdomain.com).
 * Automatically detects request headers, local ports, Vercel deployments, or env variables.
 */
export function getBaseUrl(req?: NextRequest | Request): string {
  // 1. Check incoming HTTP request headers (Host & Protocol)
  if (req) {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    if (host && !host.includes('jobpingly.com')) {
      const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https');
      return `${proto}://${host.replace(/\/$/, '')}`;
    }
  }

  // 2. Check explicit NEXT_PUBLIC_APP_URL environment variable
  if (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('jobpingly.com')) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }

  // 3. Check Vercel deployment URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`;
  }

  // 4. Fallback to local dev server port (default: 3000)
  const port = process.env.PORT || '3000';
  return `http://localhost:${port}`;
}
