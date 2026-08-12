import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, listCareerPages, careerPages, jobs, listCollaborators } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

import { users } from '@/lib/db/schema';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  const listId = params.id;

  const [listData] = await db
    .select({
      id: lists.id,
      name: lists.name,
      slug: lists.slug,
      description: lists.description,
      visibility: lists.visibility,
      userId: lists.userId,
      isCanonical: lists.isCanonical,
      followerCount: lists.followerCount,
      createdAt: lists.createdAt,
      updatedAt: lists.updatedAt,
      userName: users.name,
      userEmail: users.email,
      userAvatarUrl: users.avatarUrl,
    })
    .from(lists)
    .leftJoin(users, eq(lists.userId, users.id))
    .where(eq(lists.id, listId));

  if (!listData) {
    return NextResponse.json({ error: 'Watch list not found' }, { status: 404 });
  }

  const list = {
    ...listData,
    userName: listData.userName || listData.userEmail?.split('@')[0] || 'Curator',
    userAvatarUrl: listData.userAvatarUrl || null,
  };

  // Check authorization if private (Owner, Admin, or Accepted Collaborators allowed)
  if (list.visibility === 'private') {
    const isOwnerOrAdmin = user && (user.role === 'admin' || user.userId === list.userId);
    let isAcceptedCollab = false;

    if (user && !isOwnerOrAdmin) {
      const [collab] = await db
        .select()
        .from(listCollaborators)
        .where(and(
          eq(listCollaborators.listId, listId),
          eq(listCollaborators.userId, user.userId),
          eq(listCollaborators.status, 'accepted')
        ));
      isAcceptedCollab = !!collab;
    }

    if (!isOwnerOrAdmin && !isAcceptedCollab) {
      return NextResponse.json({ error: 'Access denied to private list.' }, { status: 403 });
    }
  }

  // Fetch associated career pages
  const listPages = await db.select()
    .from(listCareerPages)
    .where(eq(listCareerPages.listId, listId));

  const listPageMap = new Map(listPages.map(lp => [lp.careerPageId, lp]));
  const allPageIds = listPages.map(p => p.careerPageId);
  const activePageIdsForList = listPages.filter(p => !p.isPaused).map(p => p.careerPageId);

  const pages = allPageIds.length > 0
    ? await db.select().from(careerPages).where(inArray(careerPages.id, allPageIds))
    : [];

  const pagesWithListStatus = pages.map(p => ({
    ...p,
    isPaused: listPageMap.get(p.id)?.isPaused || false,
  }));

  // Fetch active jobs ONLY for unpaused pages on this list
  const activeJobs = activePageIdsForList.length > 0
    ? await db.select().from(jobs).where(and(inArray(jobs.careerPageId, activePageIdsForList), eq(jobs.status, 'active')))
    : [];

  const pageMap = new Map(pagesWithListStatus.map(p => [p.id, p]));
  const jobsWithCompany = activeJobs.map(j => {
    const parentPage = pageMap.get(j.careerPageId);
    return {
      ...j,
      companyName: parentPage?.companyName || (j.rawData as any)?.company || null,
    };
  });

  return NextResponse.json({
    list,
    pages: pagesWithListStatus,
    jobs: jobsWithCompany,
  });
}

async function canModifyList(userId: string, userRole: string, listId: string) {
  if (userRole === 'admin') return true;
  const [list] = await db.select().from(lists).where(eq(lists.id, listId));
  if (!list) return false;
  if (list.userId === userId) return true;

  const [collab] = await db
    .select()
    .from(listCollaborators)
    .where(and(
      eq(listCollaborators.listId, listId),
      eq(listCollaborators.userId, userId),
      eq(listCollaborators.status, 'accepted')
    ));

  return !!collab;
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const listId = params.id;
  const allowed = await canModifyList(user.userId, user.role, listId);
  if (!allowed) {
    return NextResponse.json({ error: 'Watch list not found or unauthorized' }, { status: 404 });
  }

  const body = await req.json();
  const { name, description, visibility } = body;

  const updateData: any = {
    updatedAt: new Date(),
  };

  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (visibility !== undefined) updateData.visibility = visibility;

  const [updated] = await db.update(lists).set(updateData).where(eq(lists.id, listId)).returning();

  if (!updated) {
    return NextResponse.json({ error: 'List not found' }, { status: 404 });
  }

  return NextResponse.json({ list: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const listId = params.id;
  const isAdmin = user.role === 'admin';
  const condition = isAdmin ? eq(lists.id, listId) : and(eq(lists.id, listId), eq(lists.userId, user.userId));

  await db.delete(lists).where(condition);

  return NextResponse.json({ success: true });
}
