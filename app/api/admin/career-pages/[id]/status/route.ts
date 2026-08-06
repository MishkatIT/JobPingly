import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { careerPages, adminAuditLog } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const { id } = params;
  const body = await req.json();
  const { status, checkIntervalMinutes } = body;

  const [existing] = await db.select().from(careerPages).where(eq(careerPages.id, id));
  if (!existing) {
    return NextResponse.json({ error: 'Career page not found.' }, { status: 404 });
  }

  const newStatus = status || existing.status;
  const newInterval = checkIntervalMinutes ? Number(checkIntervalMinutes) : existing.checkIntervalMinutes;

  const nextCheckAt = newStatus === 'active'
    ? new Date(Date.now() + newInterval * 60 * 1000)
    : null;

  const [updated] = await db.update(careerPages).set({
    status: newStatus,
    checkIntervalMinutes: newInterval,
    nextCheckAt,
  }).where(eq(careerPages.id, id)).returning();

  await db.insert(adminAuditLog).values({
    adminId: adminUser.userId,
    action: 'update_career_page_monitoring',
    targetType: 'career_page',
    targetId: id,
    metadata: { status: newStatus, checkIntervalMinutes: newInterval },
  });

  return NextResponse.json({ careerPage: updated });
}
