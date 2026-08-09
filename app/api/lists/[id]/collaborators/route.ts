import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, listCollaborators, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

// GET list collaborators (owner or collaborator)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [list] = await db.select().from(lists).where(eq(lists.id, params.id));
  if (!list) {
    return NextResponse.json({ error: 'List not found' }, { status: 404 });
  }

  const collaborators = await db
    .select({
      id: listCollaborators.id,
      userId: listCollaborators.userId,
      role: listCollaborators.role,
      createdAt: listCollaborators.createdAt,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
    })
    .from(listCollaborators)
    .leftJoin(users, eq(listCollaborators.userId, users.id))
    .where(eq(listCollaborators.listId, params.id));

  return NextResponse.json({ collaborators });
}

// POST invite/add collaborator (owner only)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [list] = await db.select().from(lists).where(eq(lists.id, params.id));
  if (!list) {
    return NextResponse.json({ error: 'List not found' }, { status: 404 });
  }

  if (user.role !== 'admin' && list.userId !== user.userId) {
    return NextResponse.json({ error: 'Only the list owner or admin can add collaborators' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { email, role } = body;

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Collaborator email is required' }, { status: 400 });
  }

  const [targetUser] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
  if (!targetUser) {
    return NextResponse.json({ error: 'User with this email not found' }, { status: 404 });
  }

  if (targetUser.id === user.userId) {
    return NextResponse.json({ error: 'You are already the list owner' }, { status: 400 });
  }

  const [existingCollab] = await db
    .select()
    .from(listCollaborators)
    .where(and(eq(listCollaborators.listId, params.id), eq(listCollaborators.userId, targetUser.id)));

  if (existingCollab) {
    return NextResponse.json({ error: 'User is already a collaborator' }, { status: 400 });
  }

  const [collab] = await db
    .insert(listCollaborators)
    .values({
      listId: params.id,
      userId: targetUser.id,
      role: role === 'moderator' ? 'moderator' : 'editor',
      invitedBy: user.userId,
    })
    .returning();

  return NextResponse.json({ success: true, collaborator: collab });
}

// DELETE remove collaborator (owner only)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [list] = await db.select().from(lists).where(eq(lists.id, params.id));
  if (!list) {
    return NextResponse.json({ error: 'List not found' }, { status: 404 });
  }

  if (user.role !== 'admin' && list.userId !== user.userId) {
    return NextResponse.json({ error: 'Only list owner or admin can remove collaborators' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const targetUserId = searchParams.get('userId');

  if (!targetUserId) {
    return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
  }

  await db
    .delete(listCollaborators)
    .where(and(eq(listCollaborators.listId, params.id), eq(listCollaborators.userId, targetUserId)));

  return NextResponse.json({ success: true });
}
