import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { listCollaborators, lists } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getAuthUser } from '@/lib/auth/guard';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const action = searchParams.get('action') || 'accept'; // 'accept' | 'decline'

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin || 'http://localhost:3000';

  if (!token) {
    return NextResponse.redirect(`${baseUrl}/dashboard?error=invalid_token`);
  }

  const [collab] = await db
    .select()
    .from(listCollaborators)
    .where(eq(listCollaborators.inviteToken, token));

  if (!collab) {
    return NextResponse.redirect(`${baseUrl}/dashboard?error=invite_not_found`);
  }

  if (action === 'decline') {
    await db.delete(listCollaborators).where(eq(listCollaborators.id, collab.id));
    return NextResponse.redirect(`${baseUrl}/dashboard?invite=declined`);
  }

  // Accept invitation
  await db
    .update(listCollaborators)
    .set({
      status: 'accepted',
      updatedAt: new Date(),
    })
    .where(eq(listCollaborators.id, collab.id));

  return NextResponse.redirect(`${baseUrl}/dashboard/lists/${collab.listId}?invite=accepted`);
}

// POST endpoint for dashboard buttons
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { collabId, action } = body; // action: 'accept' | 'decline'

  if (!collabId) {
    return NextResponse.json({ error: 'collabId is required' }, { status: 400 });
  }

  const [collab] = await db
    .select()
    .from(listCollaborators)
    .where(eq(listCollaborators.id, collabId));

  if (!collab) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
  }

  if (collab.userId !== user.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (action === 'decline') {
    await db.delete(listCollaborators).where(eq(listCollaborators.id, collabId));
    return NextResponse.json({ success: true, status: 'declined' });
  }

  await db
    .update(listCollaborators)
    .set({
      status: 'accepted',
      updatedAt: new Date(),
    })
    .where(eq(listCollaborators.id, collabId));

  return NextResponse.json({ success: true, status: 'accepted' });
}
