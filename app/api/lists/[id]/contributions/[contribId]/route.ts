import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { lists, listContributions, listCollaborators, careerPages, listCareerPages } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

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

// POST approve or reject a contribution
export async function POST(req: NextRequest, { params }: { params: { id: string; contribId: string } }) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const allowed = await canManageList(user.userId, user.role, params.id);
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [contrib] = await db
    .select()
    .from(listContributions)
    .where(and(eq(listContributions.id, params.contribId), eq(listContributions.listId, params.id)));

  if (!contrib) {
    return NextResponse.json({ error: 'Contribution not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { action } = body; // 'approve' | 'reject'

  if (action === 'reject') {
    const [updated] = await db
      .update(listContributions)
      .set({ status: 'rejected', reviewedAt: new Date() })
      .where(eq(listContributions.id, contrib.id))
      .returning();

    return NextResponse.json({ success: true, contribution: updated });
  }

  if (action === 'approve') {
    // Check if career page exists or create it
    let [cPage] = await db.select().from(careerPages).where(eq(careerPages.url, contrib.url));
    if (!cPage) {
      [cPage] = await db
        .insert(careerPages)
        .values({
          url: contrib.url,
          companyName: contrib.companyName || 'Unknown Company',
          atsType: contrib.atsType || 'unknown',
          status: 'active',
        })
        .returning();
    }

    // Link to listCareerPages if not linked
    const [existingLink] = await db
      .select()
      .from(listCareerPages)
      .where(and(eq(listCareerPages.listId, params.id), eq(listCareerPages.careerPageId, cPage.id)));

    if (!existingLink) {
      await db.insert(listCareerPages).values({
        listId: params.id,
        careerPageId: cPage.id,
      });
    }

    // Update contribution status and increment contributionCount
    const [updated] = await db
      .update(listContributions)
      .set({ status: 'approved', reviewedAt: new Date() })
      .where(eq(listContributions.id, contrib.id))
      .returning();

    await db
      .update(lists)
      .set({ contributionCount: sql`${lists.contributionCount} + 1` })
      .where(eq(lists.id, params.id));

    return NextResponse.json({ success: true, contribution: updated, careerPage: cPage });
  }

  return NextResponse.json({ error: 'Invalid action. Must be approve or reject' }, { status: 400 });
}
