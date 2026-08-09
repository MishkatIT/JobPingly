import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, listContributions, listCollaborators } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

async function canManageList(userId: string, userRole: string, listId: string) {
  if (userRole === 'admin') return true;
  const [list] = await db.select().from(lists).where(eq(lists.id, listId));
  if (!list) return false;
  if (list.userId === userId) return true;

  const [collab] = await db
    .select()
    .from(listCollaborators)
    .where(and(eq(listCollaborators.listId, listId), eq(listCollaborators.userId, userId)));

  return !!collab;
}

// GET list contributions (maintainer view)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const allowed = await canManageList(user.userId, user.role, params.id);
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const contributions = await db
    .select()
    .from(listContributions)
    .where(eq(listContributions.listId, params.id));

  return NextResponse.json({ contributions });
}
