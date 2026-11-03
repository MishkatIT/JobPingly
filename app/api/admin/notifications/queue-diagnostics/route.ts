import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { notificationQueue, users, jobs, careerPages, emailApprovals, listSubscriptions, lists } from '@/lib/db/schema';
import { eq, isNull, inArray, desc, and } from 'drizzle-orm';
import { getTodaySentEmailCount } from '@/lib/email/brevo';
import { sendEmailDigest } from '@/packages/notifications/src/sender';
import { loadNotificationPolicy, shouldDeferForCohort } from '@/packages/notifications/src/policy';
import { resolveEffectiveFrequency } from '@/lib/utils/frequency';
import { evaluateDigestSchedule, describeDigestSchedule } from '@/lib/utils/digestSchedule';

export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }


  const { searchParams } = new URL(req.url);
  const brevoLimitParam = Number(searchParams.get('brevoLimit'));
  const safetyBufferParam = Number(searchParams.get('safetyBuffer'));
  const filterReason = searchParams.get('reason');

  const now = new Date();
  // Loaded through the shared policy module so this panel always reports the same
  // decisions the worker will make. It previously recomputed the cohort day with a
  // hard-coded 3-day cycle and ignored the cohort-grouping toggle entirely.
  const policy = await loadNotificationPolicy({
    now,
    brevoLimit: Number.isFinite(brevoLimitParam) && brevoLimitParam > 0 ? brevoLimitParam : undefined,
    safetyBuffer: Number.isFinite(safetyBufferParam) && safetyBufferParam >= 0 ? safetyBufferParam : undefined,
  });

  const notificationsEnabled = policy.notificationsEnabled;
  const globalPolicyEnforced = policy.globalPolicyEnforced;
  const enforcedFrequencyValue = policy.enforcedFrequencyValue;

  // Fetch today's sent email count
  const todayStats = await getTodaySentEmailCount();
  const effectiveLimit = policy.effectiveDigestLimit;
  const quotaReached = todayStats.sentToday >= effectiveLimit;
  const todayCohort = policy.todayCohort;

  // 1. Fetch pending queue items inner joined with users, jobs, career pages and
  //    the list subscription that matched (for per-list frequency).
  const pendingItems = await db.select({
    id: notificationQueue.id,
    userId: notificationQueue.userId,
    jobId: notificationQueue.jobId,
    listId: notificationQueue.listId,
    eventType: notificationQueue.eventType,
    createdAt: notificationQueue.createdAt,
    userEmail: users.email,
    userName: users.name,
    isBlocked: users.isBlocked,
    emailNotificationsEnabled: users.emailNotificationsEnabled,
    notificationPreference: users.notificationPreference,
    digestHour: users.digestHour,
    digestMinute: users.digestMinute,
    timezone: users.timezone,
    lastDigestSentAt: users.lastDigestSentAt,
    quotaExempt: users.quotaExempt,
    frequencyEnforcementExempt: users.frequencyEnforcementExempt,
    dispatchGroup: users.dispatchGroup,
    listDigestFrequency: listSubscriptions.digestFrequency,
    listName: lists.name,
    jobTitle: jobs.title,
    companyName: careerPages.companyName,
  })
  .from(notificationQueue)
  .innerJoin(users, eq(notificationQueue.userId, users.id))
  .innerJoin(jobs, eq(notificationQueue.jobId, jobs.id))
  .innerJoin(careerPages, eq(jobs.careerPageId, careerPages.id))
  .leftJoin(lists, eq(notificationQueue.listId, lists.id))
  .leftJoin(
    listSubscriptions,
    and(
      eq(listSubscriptions.listId, notificationQueue.listId),
      eq(listSubscriptions.userId, notificationQueue.userId),
    ),
  )
  .where(isNull(notificationQueue.sentAt))
  .orderBy(desc(notificationQueue.createdAt));

  // Oldest pending item per delivery channel, so the schedule verdict matches the
  // worker's (a slot only counts if it is at or after the item's arrival).
  const oldestPerChannel = new Map<string, Date>();
  for (const item of pendingItems) {
    const key = `${item.userId}::${item.listId || '__account__'}`;
    const created = new Date(item.createdAt);
    const existing = oldestPerChannel.get(key);
    if (!existing || created < existing) oldestPerChannel.set(key, created);
  }

  // 2. Fetch email approvals list
  const approvalsList = await db.select().from(emailApprovals);
  const approvalMap = new Map<string, string>();
  for (const app of approvalsList) {
    approvalMap.set(app.email.toLowerCase(), app.status);
  }

  // Diagnostic Categorization
  const categorizedItems = pendingItems.map(item => {
    const email = item.userEmail.toLowerCase();
    const appStatus = approvalMap.get(email);

    let reasonKey = 'ready_to_send';
    let reasonLabel = 'Ready to Send';

    const isEnforced = globalPolicyEnforced && !item.frequencyEnforcementExempt;
    // Precedence matches the worker: enforced policy > per-list > account default.
    const effectivePref = resolveEffectiveFrequency({
      isEnforced,
      enforcedFrequency: enforcedFrequencyValue,
      listFrequency: item.listDigestFrequency,
      accountFrequency: item.notificationPreference,
    });

    const hourPinned = isEnforced && policy.enforcedDigestHour !== null;
    const clockHour = hourPinned ? policy.enforcedDigestHour : item.digestHour;
    const clockMinute = hourPinned ? (policy.enforcedDigestMinute ?? 0) : item.digestMinute;

    const schedule = evaluateDigestSchedule({
      frequency: effectivePref,
      now,
      lastSentAt: item.lastDigestSentAt,
      timezone: item.timezone,
      hour: clockHour,
      minute: clockMinute,
      oldestPendingAt: oldestPerChannel.get(`${item.userId}::${item.listId || '__account__'}`) || item.createdAt,
    });

    const cohort = shouldDeferForCohort({
      policy,
      dispatchGroup: item.dispatchGroup,
      sentToday: todayStats.sentToday,
      isRealtime: schedule.kind === 'realtime',
      isQuotaExempt: Boolean(item.quotaExempt),
    });

    if (!notificationsEnabled) {
      reasonKey = 'feature_flag_disabled';
      reasonLabel = 'Notifications Feature Flag Disabled';
    } else if (item.isBlocked || !item.emailNotificationsEnabled) {
      reasonKey = 'email_disabled_or_blocked';
      reasonLabel = item.isBlocked ? 'User Account Blocked' : 'User Disabled Email Notifications';
    } else if (appStatus && appStatus !== 'approved') {
      reasonKey = 'pending_admin_approval';
      reasonLabel = `Admin Approval Pending (${appStatus})`;
    } else if (!schedule.due) {
      reasonKey = 'frequency_digest_window';
      reasonLabel = `Waiting for ${isEnforced ? 'enforced ' : ''}digest slot${schedule.nextDueAt ? ` (next ${schedule.nextDueAt.toISOString()})` : ''}`;
    } else if (quotaReached && !item.quotaExempt) {
      reasonKey = 'brevo_daily_quota_reached';
      reasonLabel = `Daily Email Allowance Reached (${todayStats.sentToday}/${effectiveLimit})`;
    } else if (cohort.defer) {
      reasonKey = 'staggered_cohort_waiting';
      reasonLabel = `Waiting Cohort Day (Group ${cohort.userGroup}, Today is Group ${todayCohort})`;
    }

    return {
      ...item,
      reasonKey,
      reasonLabel,
      effectiveFrequency: effectivePref,
      scheduleLabel: describeDigestSchedule(effectivePref, clockHour, clockMinute, item.timezone),
      scheduleReason: schedule.reason,
      nextDueAt: schedule.nextDueAt,
      cohortGroup: cohort.userGroup,
    };
  });

  // Reason summary breakdown counts
  const reasonCounts: Record<string, number> = {
    ready_to_send: 0,
    brevo_daily_quota_reached: 0,
    staggered_cohort_waiting: 0,
    pending_admin_approval: 0,
    email_disabled_or_blocked: 0,
    frequency_digest_window: 0,
    feature_flag_disabled: 0,
  };

  categorizedItems.forEach(item => {
    reasonCounts[item.reasonKey] = (reasonCounts[item.reasonKey] || 0) + 1;
  });

  let filtered = categorizedItems;
  if (filterReason && filterReason !== 'all') {
    filtered = filtered.filter(item => item.reasonKey === filterReason);
  }

  return NextResponse.json({
    totalPending: pendingItems.length,
    reasonCounts,
    todayCohort,
    todaySentStats: todayStats,
    effectiveLimit,
    policy: {
      cohortGroupingEnabled: policy.cohortGroupingEnabled,
      cycleDays: policy.cycleDays,
      cohortPressureThreshold: policy.cohortPressureThreshold,
      globalPolicyEnforced: policy.globalPolicyEnforced,
      enforcedFrequencyValue: policy.enforcedFrequencyValue,
      enforcedDigestHour: policy.enforcedDigestHour,
      enforcedDigestMinute: policy.enforcedDigestMinute,
    },
    queueItems: filtered,
  });
}

export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const body = await req.json();
  const { action, queueIds, brevoLimit = 300, safetyBuffer = 50 } = body;

  if (action === 'dry_run_simulation') {
    // Perform dry run simulation
    const pendingItems = await db.select({
      id: notificationQueue.id,
      userId: notificationQueue.userId,
      userEmail: users.email,
      userName: users.name,
      quotaExempt: users.quotaExempt,
      dispatchGroup: users.dispatchGroup,
      jobTitle: jobs.title,
      companyName: careerPages.companyName,
    })
    .from(notificationQueue)
    .innerJoin(users, eq(notificationQueue.userId, users.id))
    .innerJoin(jobs, eq(notificationQueue.jobId, jobs.id))
    .innerJoin(careerPages, eq(jobs.careerPageId, careerPages.id))
    .where(isNull(notificationQueue.sentAt));

    const todayStats = await getTodaySentEmailCount();
    const effectiveLimit = Math.max(1, brevoLimit - safetyBuffer);
    const availableQuota = Math.max(0, effectiveLimit - todayStats.sentToday);

    // Group pending by user
    const userMap = new Map<string, any[]>();
    pendingItems.forEach(item => {
      const list = userMap.get(item.userId) || [];
      list.push(item);
      userMap.set(item.userId, list);
    });

    const userList = Array.from(userMap.values());
    const simulatedSends: any[] = [];
    const simulatedDeferred: any[] = [];

    let quotaUsedInSim = 0;
    for (const items of userList) {
      const first = items[0];
      if (first.quotaExempt || quotaUsedInSim < availableQuota) {
        simulatedSends.push({
          userId: first.userId,
          userEmail: first.userEmail,
          userName: first.userName,
          jobCount: items.length,
          exempt: first.quotaExempt,
        });
        if (!first.quotaExempt) quotaUsedInSim++;
      } else {
        simulatedDeferred.push({
          userId: first.userId,
          userEmail: first.userEmail,
          userName: first.userName,
          jobCount: items.length,
          reason: 'Brevo Daily Quota Exceeded in Simulation',
        });
      }
    }

    return NextResponse.json({
      dryRun: true,
      todaySent: todayStats.sentToday,
      effectiveLimit,
      availableQuota,
      simulatedSendsCount: simulatedSends.length,
      simulatedDeferredCount: simulatedDeferred.length,
      simulatedSends,
      simulatedDeferred,
    });
  }

  if (action === 'force_flush') {
    // Force dispatch selected or all pending items
    const query = db.select({
      id: notificationQueue.id,
      userId: notificationQueue.userId,
      jobId: notificationQueue.jobId,
      userEmail: users.email,
      userName: users.name,
      jobTitle: jobs.title,
      jobUrl: jobs.url,
      companyName: careerPages.companyName,
    })
    .from(notificationQueue)
    .innerJoin(users, eq(notificationQueue.userId, users.id))
    .innerJoin(jobs, eq(notificationQueue.jobId, jobs.id))
    .innerJoin(careerPages, eq(jobs.careerPageId, careerPages.id))
    .where(isNull(notificationQueue.sentAt));

    let itemsToProcess = await query;
    if (Array.isArray(queueIds) && queueIds.length > 0) {
      const qSet = new Set(queueIds);
      itemsToProcess = itemsToProcess.filter(i => qSet.has(i.id));
    }

    if (itemsToProcess.length === 0) {
      return NextResponse.json({ error: 'No matching pending queue items to flush.' }, { status: 400 });
    }

    // Group items by user
    const userMap = new Map<string, typeof itemsToProcess>();
    for (const item of itemsToProcess) {
      const list = userMap.get(item.userId) || [];
      list.push(item);
      userMap.set(item.userId, list);
    }

    let sentCount = 0;
    let failedCount = 0;
    for (const [userId, items] of userMap.entries()) {
      const first = items[0];
      const qIds = items.map(i => i.id);

      const jobListings = Array.from(new Set(items.map(i => i.jobId))).map(jId => {
        const matching = items.find(i => i.jobId === jId);
        return {
          companyName: matching?.companyName || 'Unknown Company',
          title: matching?.jobTitle || 'Job Opening',
          url: matching?.jobUrl || undefined,
        };
      });

      try {
        const result = await sendEmailDigest(
          first.userEmail,
          first.userName || first.userEmail.split('@')[0],
          jobListings,
          { senderId: adminUser.userId }
        );

        if (result.success || result.mocked || result.unapproved || result.disabled) {
          await db.update(notificationQueue)
            .set({ sentAt: new Date() })
            .where(inArray(notificationQueue.id, qIds));
          if (result.success || result.mocked) {
            // Keep the schedule window honest: a forced flush counts as a delivery.
            await db.update(users)
              .set({ lastDigestSentAt: new Date() })
              .where(eq(users.id, userId));
          }
          sentCount++;
        } else {
          failedCount++;
        }
      } catch (err) {
        failedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      flushedUsersCount: userMap.size,
      sentCount,
      failedCount,
    });
  }

  if (action === 'clear_queue') {
    if (!Array.isArray(queueIds) || queueIds.length === 0) {
      return NextResponse.json({ error: 'queueIds array required to clear queue items.' }, { status: 400 });
    }

    await db.update(notificationQueue)
      .set({ sentAt: new Date() })
      .where(inArray(notificationQueue.id, queueIds));

    return NextResponse.json({
      success: true,
      clearedCount: queueIds.length,
    });
  }

  return NextResponse.json({ error: 'Invalid action parameter.' }, { status: 400 });
}
