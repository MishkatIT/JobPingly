import type { MetadataRoute } from 'next';
import { client } from '@/lib/db/client';

const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://jobpingly.onrender.com').replace(/\/+$/, '');

// Built per request (crawlers fetch it rarely), never at build time, which may have no database.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = ['', '/discover', '/pricing', '/help', '/bot', '/privacy', '/terms'].map(path => ({
    url: `${appUrl}${path}`,
    changeFrequency: path === '' || path === '/discover' ? 'daily' : 'monthly',
    priority: path === '' ? 1 : path === '/discover' ? 0.8 : 0.4,
  }));

  try {
    // Public watchlists that have at least one company, most followed first.
    const lists = await client<{ slug: string; updatedAt: Date }[]>`
      SELECT l.slug, l.updated_at AS "updatedAt"
      FROM lists l
      WHERE l.visibility = 'public' AND l.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM list_career_pages x WHERE x.list_id = l.id)
      ORDER BY l.follower_count DESC, l.updated_at DESC
      LIMIT 5000
    `;
    for (const list of lists) {
      pages.push({ url: `${appUrl}/lists/${encodeURIComponent(list.slug)}`, lastModified: list.updatedAt, changeFrequency: 'daily', priority: 0.6 });
    }
  } catch (error) {
    // The static pages are still worth serving if the database is unavailable.
    console.error('[sitemap] Could not load public watchlists:', (error as Error).message);
  }
  return pages;
}
