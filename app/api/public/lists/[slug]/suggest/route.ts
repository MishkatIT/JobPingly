import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, listContributions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

function detectAtsType(url: string): string {
  const lowercase = url.toLowerCase();
  if (lowercase.includes('greenhouse.io')) return 'greenhouse';
  if (lowercase.includes('lever.co')) return 'lever';
  if (lowercase.includes('ashbyhq.com')) return 'ashby';
  if (lowercase.includes('workable.com')) return 'workable';
  return 'generic';
}

// POST suggest a company career page for a public list
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getAuthUser(req);

  const [list] = await db.select().from(lists).where(and(eq(lists.slug, params.slug), eq(lists.visibility, 'public')));
  if (!list) {
    return NextResponse.json({ error: 'Public list not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { url, companyName } = body;

  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return NextResponse.json({ error: 'Valid career page URL is required' }, { status: 400 });
  }

  const atsType = detectAtsType(url);

  const [contribution] = await db
    .insert(listContributions)
    .values({
      listId: list.id,
      contributorUserId: user ? user.userId : null,
      url: url.trim(),
      companyName: companyName ? companyName.trim() : null,
      atsType,
      status: 'pending',
    })
    .returning();

  return NextResponse.json({
    success: true,
    message: 'Suggestion submitted! The list owner will review your contribution.',
    contribution,
  });
}
