import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { reportedIssues, users } from '@/lib/db/schema';
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimit';
import { eq } from 'drizzle-orm';

// POST submit a new issue or feedback report
export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const rateLimit = checkRateLimit({
      key: `issue-submit:${clientIp}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: `Too many reports submitted. Please try again in ${rateLimit.resetInSeconds} seconds.` },
        { status: 429 }
      );
    }

    const authUser = await getAuthUser(req);
    const body = await req.json();
    const { category, subject, description, targetUrl, email, name } = body;

    if (!subject || !subject.trim() || !description || !description.trim()) {
      return NextResponse.json(
        { error: 'Subject and detailed description are required.' },
        { status: 400 }
      );
    }

    let reporterEmail = email?.toLowerCase().trim();
    let reporterName = name?.trim();
    let userId: string | null = null;

    if (authUser) {
      userId = authUser.userId;
      const [u] = await db.select().from(users).where(eq(users.id, authUser.userId));
      if (u) {
        reporterEmail = u.email;
        reporterName = u.name || reporterName || u.email.split('@')[0];
      }
    }

    if (!reporterEmail || !reporterEmail.includes('@')) {
      return NextResponse.json(
        { error: 'Valid email address is required to submit a report.' },
        { status: 400 }
      );
    }

    const validCategory = ['jobs_not_loading', 'broken_url', 'scraper_bug', 'ui_bug', 'feature_request', 'general'].includes(category)
      ? category
      : 'general';

    const [created] = await db.insert(reportedIssues).values({
      userId,
      reporterEmail,
      reporterName: reporterName || null,
      category: validCategory,
      subject: subject.trim(),
      description: description.trim(),
      targetUrl: targetUrl ? targetUrl.trim() : null,
      status: 'open',
      priority: validCategory === 'broken_url' || validCategory === 'jobs_not_loading' || validCategory === 'scraper_bug' ? 'high' : 'medium',
    }).returning();

    return NextResponse.json({
      success: true,
      issue: created,
      message: 'Thank you! Your issue report has been submitted to system administrators.',
    }, { status: 201 });
  } catch (err: any) {
    console.error('[Submit Issue Error]', err);
    return NextResponse.json({ error: err.message || 'Failed to submit issue report.' }, { status: 500 });
  }
}
