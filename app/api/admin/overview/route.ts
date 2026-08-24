import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users, lists, careerPages, jobs, scrapeLogs, notificationQueue, emailApprovals } from '@/lib/db/schema';
import { eq, isNull } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const [allUsers, allLists, allPages, activeJobs, recentLogs, pendingNotifications, pendingApprovals] = await Promise.all([
    db.select({ emailVerified: users.emailVerified }).from(users),
    db.select({ visibility: lists.visibility }).from(lists),
    db.select({
      id: careerPages.id,
      url: careerPages.url,
      companyName: careerPages.companyName,
      status: careerPages.status,
      checkIntervalMinutes: careerPages.checkIntervalMinutes,
      lastScrapedAt: careerPages.lastScrapedAt,
      nextCheckAt: careerPages.nextCheckAt,
    }).from(careerPages),
    db.select({ id: jobs.id }).from(jobs).where(eq(jobs.status, 'active')),
    db.select({
      id: scrapeLogs.id,
      careerPageId: scrapeLogs.careerPageId,
      scrapedAt: scrapeLogs.scrapedAt,
      success: scrapeLogs.success,
      jobsFound: scrapeLogs.jobsFound,
      jobsAdded: scrapeLogs.jobsAdded,
      jobsRemoved: scrapeLogs.jobsRemoved,
      durationMs: scrapeLogs.durationMs,
      errorMessage: scrapeLogs.errorMessage,
    }).from(scrapeLogs).limit(50),
    db.select({ id: notificationQueue.id }).from(notificationQueue).where(isNull(notificationQueue.sentAt)),
    db.select({
      id: emailApprovals.id,
      email: emailApprovals.email,
      status: emailApprovals.status,
      userVerified: users.emailVerified,
    })
    .from(emailApprovals)
    .leftJoin(users, eq(emailApprovals.email, users.email))
    .where(eq(emailApprovals.status, 'pending')),
  ]);

  const totalScrapes = recentLogs.length;
  const successfulScrapes = recentLogs.filter(l => l.success).length;
  const successRate = totalScrapes > 0 ? Math.round((successfulScrapes / totalScrapes) * 100) : 100;
  const brokenPages = allPages.filter(p => p.status === 'broken' || p.status === 'degraded');
  const validPendingEmailApprovals = pendingApprovals.filter(r => r.userVerified !== false);

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
      pendingEmailsCount: validPendingEmailApprovals.length,
    },
    careerPages: allPages,
    recentScrapeLogs: recentLogs,
  });
}
