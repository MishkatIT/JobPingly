import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users, lists, careerPages, jobs, scrapeLogs, notificationQueue } from '@/lib/db/schema';
import { eq, isNull } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const [allUsers, allLists, allPages, activeJobs, recentLogs, pendingNotifications] = await Promise.all([
    db.select().from(users),
    db.select().from(lists),
    db.select().from(careerPages),
    db.select().from(jobs).where(eq(jobs.status, 'active')),
    db.select().from(scrapeLogs).limit(50),
    db.select().from(notificationQueue).where(isNull(notificationQueue.sentAt)),
  ]);

  const totalScrapes = recentLogs.length;
  const successfulScrapes = recentLogs.filter(l => l.success).length;
  const successRate = totalScrapes > 0 ? Math.round((successfulScrapes / totalScrapes) * 100) : 100;
  const brokenPages = allPages.filter(p => p.status === 'broken' || p.status === 'degraded');

  return NextResponse.json({
    metrics: {
      totalUsers: allUsers.filter(u => u.emailVerified).length,
      totalLists: allLists.length,
      publicLists: allLists.filter(l => l.visibility === 'public').length,
      totalCareerPages: allPages.length,
      activeJobs: activeJobs.length,
      scrapeSuccessRate: successRate,
      brokenPagesCount: brokenPages.length,
      pendingNotificationsCount: pendingNotifications.length,
    },
    careerPages: allPages,
    recentScrapeLogs: recentLogs,
  });
}
