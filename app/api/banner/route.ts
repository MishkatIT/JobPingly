import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/settings/store';
import { isSafeHref } from '@/lib/security/ssrf';

export const dynamic = 'force-dynamic';

/** The site-wide announcement, if one is active. Cached briefly at the edge. */
export async function GET() {
  let banner: Record<string, unknown> = {};
  try {
    banner = await getSetting('banner.config');
  } catch {
    banner = {};
  }
  const enabled = banner.enabled === true && typeof banner.message === 'string' && banner.message.trim().length > 0;
  const data = enabled
    ? {
        enabled: true,
        id: String(banner.bannerId ?? ''),
        tone: ['info', 'success', 'warning'].includes(String(banner.type)) ? String(banner.type) : 'info',
        message: String(banner.message).slice(0, 300),
        linkUrl: isSafeHref(banner.linkUrl) || (typeof banner.linkUrl === 'string' && banner.linkUrl.startsWith('/')) ? banner.linkUrl : null,
        linkText: typeof banner.linkText === 'string' ? banner.linkText.slice(0, 40) : null,
      }
    : { enabled: false };
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } });
}
