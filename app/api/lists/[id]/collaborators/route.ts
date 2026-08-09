import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, listCollaborators, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { sendCollaboratorInviteEmail } from '@/lib/email/brevo';

import { getBaseUrl } from '@/lib/utils/url';

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
      status: listCollaborators.status,
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
      status: 'pending',
      invitedBy: user.userId,
    })
    .returning();

  // Fetch inviter user details for email template
  const [inviterUser] = await db.select().from(users).where(eq(users.id, user.userId));

  // Send email notification to added collaborator with 1-click accept token
  sendCollaboratorInviteEmail({
    toEmail: targetUser.email,
    toName: targetUser.name || targetUser.email.split('@')[0],
    inviterName: inviterUser?.name || inviterUser?.email || 'A list owner',
    listName: list.name,
    listId: params.id,
    listSlug: list.slug,
    role: collab.role,
    inviteToken: collab.inviteToken,
    baseUrl: getBaseUrl(req),
  }).catch(err => console.error('[Brevo Collaborator Invite Error]', err));

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

  const { searchParams } = new URL(req.url);
  const targetUserId = searchParams.get('userId') || user.userId;

  const isOwner = list.userId === user.userId;
  const isAdmin = user.role === 'admin';
  const isSelf = targetUserId === user.userId;

  if (!isOwner && !isAdmin && !isSelf) {
    return NextResponse.json({ error: 'Only the list owner, admin, or collaborator themselves can leave/remove collaboration' }, { status: 403 });
  }

  await db
    .delete(listCollaborators)
    .where(and(eq(listCollaborators.listId, params.id), eq(listCollaborators.userId, targetUserId)));

  return NextResponse.json({ success: true, message: isSelf ? 'You have left the watch list' : 'Collaborator removed' });
}
