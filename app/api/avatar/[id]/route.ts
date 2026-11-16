import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { parseAvatarDataUrl } from '@/lib/users/avatar';

/**
 * Serves uploaded profile pictures as real image responses, so pages
 * reference a small cacheable URL instead of embedding the image in JSON.
 */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });

  const [row] = await db.select({ avatarUrl: users.avatarUrl, isBlocked: users.isBlocked }).from(users).where(eq(users.id, id));
  if (!row?.avatarUrl || row.isBlocked) return new NextResponse(null, { status: 404 });

  if (!row.avatarUrl.startsWith('data:')) {
    return NextResponse.redirect(row.avatarUrl, { status: 302, headers: { 'Cache-Control': 'public, max-age=3600' } });
  }

  const parsed = parseAvatarDataUrl(row.avatarUrl);
  if (!parsed) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(parsed.bytes), {
    headers: {
      'Content-Type': parsed.mime,
      // The URL carries a content hash, so it can be cached for a long time.
      'Cache-Control': 'public, max-age=604800, immutable',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
