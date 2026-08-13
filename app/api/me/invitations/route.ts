import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { listCollaborators, lists, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

export async function GET(req: NextRequest) {
  const tTotalStart = performance.now();

  const tAuthStart = performance.now();
  const user = await getAuthUser(req);
  const tAuthEnd = performance.now();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const inviterUser = alias(users, 'inviter_user');

  const tQueryStart = performance.now();
  const pendingInvitations = await db
    .select({
      id: listCollaborators.id,
      listId: listCollaborators.listId,
      role: listCollaborators.role,
      status: listCollaborators.status,
      inviteToken: listCollaborators.inviteToken,
      createdAt: listCollaborators.createdAt,
      listName: lists.name,
      listDescription: lists.description,
      inviterName: inviterUser.name,
      inviterEmail: inviterUser.email,
    })
    .from(listCollaborators)
    .innerJoin(lists, eq(listCollaborators.listId, lists.id))
    .leftJoin(inviterUser, eq(listCollaborators.invitedBy, inviterUser.id))
    .where(and(eq(listCollaborators.userId, user.userId), eq(listCollaborators.status, 'pending')));
  const tQueryEnd = performance.now();

  const tTotalEnd = performance.now();
  console.log(`[PERF /api/me/invitations] Total: ${(tTotalEnd - tTotalStart).toFixed(2)}ms | Auth: ${(tAuthEnd - tAuthStart).toFixed(2)}ms | Query: ${(tQueryEnd - tQueryStart).toFixed(2)}ms`);

  return NextResponse.json({ invitations: pendingInvitations });
}
