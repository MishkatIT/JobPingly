import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { careerPages, adminAuditLog } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { pageIds, action } = body;

    if (!Array.isArray(pageIds) || pageIds.length === 0) {
      return NextResponse.json({ error: 'No career page IDs provided.' }, { status: 400 });
    }

    if (action !== 'delete') {
      return NextResponse.json({ error: 'Invalid action specified.' }, { status: 400 });
    }

    const pagesToDelete = await db.select().from(careerPages).where(inArray(careerPages.id, pageIds));

    await db.delete(careerPages).where(inArray(careerPages.id, pageIds));

    await db.insert(adminAuditLog).values({
      adminId: adminUser.userId,
      action: 'batch_delete_career_pages',
      targetType: 'career_page',
      targetId: 'batch',
      metadata: { deletedCount: pageIds.length, deletedPages: pagesToDelete.map(p => ({ id: p.id, name: p.companyName, url: p.url })) },
    });

    return NextResponse.json({
      success: true,
      processedCount: pageIds.length,
      message: `Successfully deleted ${pageIds.length} company career page(s).`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Batch delete failed.' }, { status: 500 });
  }
}
