import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { emailApprovals, users, adminAuditLog } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { sendWelcomeEmail } from '@/lib/email/brevo';

// GET list of email approvals with backend pagination + search + status filter
export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status');
  const search = searchParams.get('search');
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 10));

  let query = db.select({
    id: emailApprovals.id,
    email: emailApprovals.email,
    userId: emailApprovals.userId,
    userName: users.name,
    userVerified: users.emailVerified,
    status: emailApprovals.status,
    requestedAt: emailApprovals.requestedAt,
    approvedAt: emailApprovals.approvedAt,
  })
  .from(emailApprovals)
  .leftJoin(users, eq(emailApprovals.email, users.email))
  .orderBy(desc(emailApprovals.requestedAt));

  let results = await query;

  // Filter out any approval record belonging to an unverified user
  results = results.filter(r => r.userVerified !== false);

  if (statusFilter && statusFilter !== 'all') {
    results = results.filter(r => r.status === statusFilter);
  }

  if (search) {
    const s = search.toLowerCase();
    results = results.filter(r =>
      r.email.toLowerCase().includes(s) ||
      (r.userName && r.userName.toLowerCase().includes(s))
    );
  }

  const total = results.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const startIndex = (page - 1) * limit;
  const paginatedResults = results.slice(startIndex, startIndex + limit);

  // Total pending count across all emails regardless of current filter
  const pendingApprovals = await db.select({
    id: emailApprovals.id,
    userVerified: users.emailVerified,
  })
  .from(emailApprovals)
  .leftJoin(users, eq(emailApprovals.email, users.email))
  .where(eq(emailApprovals.status, 'pending'));

  const pendingCount = pendingApprovals.filter(r => r.userVerified !== false).length;

  return NextResponse.json({
    emailApprovals: paginatedResults,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    },
    pendingCount,
  });
}

// POST: Admin manually adds an email directly to approved list
export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const body = await req.json();
  const { email } = body;

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email address is required.' }, { status: 400 });
  }

  const cleanEmail = email.toLowerCase().trim();

  // Check if existing
  const [existing] = await db.select().from(emailApprovals).where(eq(emailApprovals.email, cleanEmail));

  let updatedRecord;
  let matchingUser;
  if (existing) {
    [updatedRecord] = await db.update(emailApprovals).set({
      status: 'approved',
      approvedAt: new Date(),
      approvedBy: adminUser.userId,
    }).where(eq(emailApprovals.id, existing.id)).returning();
  } else {
    // Check if user exists in users table
    [matchingUser] = await db.select().from(users).where(eq(users.email, cleanEmail));
    [updatedRecord] = await db.insert(emailApprovals).values({
      email: cleanEmail,
      userId: matchingUser?.id || null,
      status: 'approved',
      approvedAt: new Date(),
      approvedBy: adminUser.userId,
    }).returning();
  }

  // Send Welcome Email
  sendWelcomeEmail(cleanEmail, { userName: matchingUser?.name || undefined, senderId: adminUser.userId }).catch(err => {
    console.error('[Welcome Email Send Error - Manual Add]', err);
  });

  await db.insert(adminAuditLog).values({
    adminId: adminUser.userId,
    action: 'manually_add_approved_email',
    targetType: 'email_approval',
    targetId: cleanEmail,
    metadata: { email: cleanEmail },
  });

  return NextResponse.json({ emailApproval: updatedRecord });
}

// PUT: Single update status ('approved' | 'unapproved') OR bulk 'approve_all_pending'
export async function PUT(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const body = await req.json();
  const { action, emailId, newStatus } = body;

  if (action === 'approve_all_pending') {
    const pendingList = await db.select().from(emailApprovals).where(eq(emailApprovals.status, 'pending'));
    
    await db.update(emailApprovals).set({
      status: 'approved',
      approvedAt: new Date(),
      approvedBy: adminUser.userId,
    }).where(eq(emailApprovals.status, 'pending'));

    // Send Welcome Email to all approved users
    for (const item of pendingList) {
      sendWelcomeEmail(item.email, { senderId: adminUser.userId }).catch(err => {
        console.error(`[Welcome Email Send Error - Bulk Approve (${item.email})]`, err);
      });
    }

    await db.insert(adminAuditLog).values({
      adminId: adminUser.userId,
      action: 'approve_all_pending_emails',
      targetType: 'email_approval',
      metadata: { count: pendingList.length },
    });

    return NextResponse.json({ message: `Approved ${pendingList.length} pending email(s).`, approvedCount: pendingList.length });
  }

  if (!emailId || !newStatus) {
    return NextResponse.json({ error: 'emailId and newStatus are required.' }, { status: 400 });
  }

  const [updated] = await db.update(emailApprovals).set({
    status: newStatus,
    approvedAt: newStatus === 'approved' ? new Date() : null,
    approvedBy: adminUser.userId,
  }).where(eq(emailApprovals.id, emailId)).returning();

  if (updated && newStatus === 'approved') {
    // Lookup user name if available
    const [matchingUser] = await db.select().from(users).where(eq(users.email, updated.email.toLowerCase().trim()));
    sendWelcomeEmail(updated.email, { userName: matchingUser?.name || undefined, senderId: adminUser.userId }).catch(err => {
      console.error(`[Welcome Email Send Error - Single Approve (${updated.email})]`, err);
    });
  }

  await db.insert(adminAuditLog).values({
    adminId: adminUser.userId,
    action: newStatus === 'approved' ? 'approve_email' : 'unapprove_email',
    targetType: 'email_approval',
    targetId: emailId,
    metadata: { newStatus },
  });

  return NextResponse.json({ emailApproval: updated });
}

