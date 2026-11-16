import type { MetadataRoute } from 'next';

const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://jobpingly.onrender.com').replace(/\/+$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/dashboard', '/admin', '/onboarding', '/invite/', '/unsubscribe', '/verify', '/reset-password'],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
