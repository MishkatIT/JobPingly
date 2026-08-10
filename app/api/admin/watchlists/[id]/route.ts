import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, adminAuditLog } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// PATCH update watchlist details (admin)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const listId = params.id;
  const [existing] = await db.select().from(lists).where(eq(lists.id, listId));
  if (!existing) {
    return NextResponse.json({ error: 'Watchlist not found.' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { name, description, visibility, isCanonical, slug } = body;

  const updateData: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (typeof name === 'string' && name.trim()) {
    updateData.name = name.trim();
  }
  if (description !== undefined) {
    updateData.description = typeof description === 'string' ? description.trim() : null;
  }
  if (visibility === 'public' || visibility === 'private') {
    updateData.visibility = visibility;
  }
  if (typeof isCanonical === 'boolean') {
    updateData.isCanonical = isCanonical;
  }
  if (typeof slug === 'string' && slug.trim()) {
    updateData.slug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }

  const [updatedList] = await db
    .update(lists)
    .set(updateData)
    .where(eq(lists.id, listId))
    .returning();

  // Record Admin Audit Log
  await db.insert(adminAuditLog).values({
    adminId: adminUser.userId,
    action: 'admin_update_watchlist',
    targetType: 'watchlist',
    targetId: listId,
    metadata: {
      previousName: existing.name,
      updatedFields: updateData,
    },
  }).catch(() => null);

  return NextResponse.json({
    success: true,
    message: 'Watchlist updated successfully',
    list: updatedList,
  });
}

// DELETE watchlist (admin)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const listId = params.id;
  const [existing] = await db.select().from(lists).where(eq(lists.id, listId));
  if (!existing) {
    return NextResponse.json({ error: 'Watchlist not found.' }, { status: 404 });
  }

  await db.delete(lists).where(eq(lists.id, listId));

  // Record Admin Audit Log
  await db.insert(adminAuditLog).values({
    adminId: adminUser.userId,
    action: 'admin_delete_watchlist',
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
    message: `Watchlist "${existing.name}" deleted successfully.`,
  });
}
