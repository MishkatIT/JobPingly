import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, listCareerPages, careerPages, jobs, subscriptions } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  const listId = params.id;

  const [list] = await db.select().from(lists).where(eq(lists.id, listId));
  if (!list) {
    return NextResponse.json({ error: 'Watch list not found' }, { status: 404 });
  }

  // Check authorization if private
  if (list.visibility === 'private') {
    if (!user || user.userId !== list.userId) {
      return NextResponse.json({ error: 'Access denied to private list.' }, { status: 403 });
    }
  }

  // Fetch associated career pages
  const listPages = await db.select()
    .from(listCareerPages)
    .where(eq(listCareerPages.listId, listId));

  const pageIds = listPages.map(p => p.careerPageId);
  const pages = pageIds.length > 0
    ? await db.select().from(careerPages).where(inArray(careerPages.id, pageIds))
    : [];

  // Fetch active jobs for these pages
  const activeJobs = pageIds.length > 0
    ? await db.select().from(jobs).where(and(inArray(jobs.careerPageId, pageIds), eq(jobs.status, 'active')))
    : [];

  // Map companyName from career pages onto job objects
  const pageMap = new Map(pages.map(p => [p.id, p]));
  const jobsWithCompany = activeJobs.map(j => {
    const parentPage = pageMap.get(j.careerPageId);
    return {
      ...j,
      companyName: parentPage?.companyName || (j.rawData as any)?.company || null,
    };
  });

  return NextResponse.json({
    list,
    pages,
    jobs: jobsWithCompany,
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const listId = params.id;
  const body = await req.json();
  const { name, description, visibility } = body;

  const [updated] = await db.update(lists).set({
    name,
    description,
    visibility,
    updatedAt: new Date(),
  }).where(and(eq(lists.id, listId), eq(lists.userId, user.userId))).returning();

  if (!updated) {
    return NextResponse.json({ error: 'List not found or unauthorized' }, { status: 404 });
  }

  return NextResponse.json({ list: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const listId = params.id;
  await db.delete(lists).where(and(eq(lists.id, listId), eq(lists.userId, user.userId)));

  return NextResponse.json({ success: true });
}
