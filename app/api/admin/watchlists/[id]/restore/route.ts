import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, adminAuditLog } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// POST /api/admin/watchlists/[id]/restore - Restore a soft-deleted watchlist
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const listId = params.id;
  const [existing] = await db.select().from(lists).where(eq(lists.id, listId));
  if (!existing) {
    return NextResponse.json({ error: 'Watchlist not found.' }, { status: 404 });
  }

  if (!existing.deletedAt) {
    return NextResponse.json({ message: 'Watchlist is already active (not deleted).' }, { status: 200 });
  }

  const [restoredList] = await db
    .update(lists)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(lists.id, listId))
    .returning();

  // Audit log
  await db.insert(adminAuditLog).values({
    adminId: adminUser.userId,
    action: 'admin_restore_watchlist',
    targetType: 'watchlist',
    targetId: listId,
    metadata: {
      listName: existing.name,
      listSlug: existing.slug,
      userId: existing.userId,
    },
  }).catch(() => null);

  return NextResponse.json({
    success: true,
    message: `Watchlist "${existing.name}" restored successfully.`,
    list: restoredList,
  });
}
