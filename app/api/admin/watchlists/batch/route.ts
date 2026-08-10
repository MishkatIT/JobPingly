import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, adminAuditLog } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';

// POST batch actions for watchlists (delete, make_public, make_private, make_canonical)
export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { action, listIds } = body;

  if (!Array.isArray(listIds) || listIds.length === 0) {
    return NextResponse.json({ error: 'No watch lists selected for batch action.' }, { status: 400 });
  }

  if (!['delete', 'make_public', 'make_private', 'make_canonical'].includes(action)) {
    return NextResponse.json({ error: 'Invalid batch action.' }, { status: 400 });
  }

  let message = '';

  if (action === 'delete') {
    await db.delete(lists).where(inArray(lists.id, listIds));
    message = `Successfully deleted ${listIds.length} watchlist(s).`;
  } else if (action === 'make_public') {
    await db
      .update(lists)
      .set({ visibility: 'public', updatedAt: new Date() })
      .where(inArray(lists.id, listIds));
    message = `Successfully changed ${listIds.length} watchlist(s) to public.`;
  } else if (action === 'make_private') {
    await db
      .update(lists)
      .set({ visibility: 'private', updatedAt: new Date() })
      .where(inArray(lists.id, listIds));
    message = `Successfully changed ${listIds.length} watchlist(s) to private.`;
  } else if (action === 'make_canonical') {
    await db
      .update(lists)
      .set({ isCanonical: true, updatedAt: new Date() })
      .where(inArray(lists.id, listIds));
    message = `Successfully set ${listIds.length} watchlist(s) as verified canonical.`;
  }

  // Audit log
  await db.insert(adminAuditLog).values({
    adminId: adminUser.userId,
    action: `admin_batch_${action}_watchlists`,
    targetType: 'watchlist',
    metadata: {
      count: listIds.length,
      listIds,
    },
  }).catch(() => null);

  return NextResponse.json({
    success: true,
    message,
    processedCount: listIds.length,
  });
}
