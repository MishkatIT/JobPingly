import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { errors } from '@/lib/api/errors';
import { AUDIT_ACTIONS, describeAuditAction, recordAudit, type AuditActor } from '@/lib/audit';
import { can, type Permission } from '@/lib/auth/rbac';
import { displayCompanyName } from '@/lib/companies/service';
import { client, db, pingDb } from '@/lib/db/client';
import { adminAuditLog, careerPages, monitorTasks, reportedIssues, users } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { isAiConfigured } from '@/lib/ai/client';
import { listAdapters } from '@/lib/monitoring/adapters';
import { describeErrorClass } from '@/lib/monitoring/errors';
import { SCANNER_VERSION } from '@/lib/monitoring/pipeline';
import { cancelQueuedTasks, cancelTask, getQueueStats, recoverExpiredLeases, retryTask } from '@/lib/monitoring/queue';
import { getWorkerHealth, runCycle } from '@/lib/monitoring/scheduler';
import { SETTINGS, SETTING_CATEGORIES, isSettingKey, type SettingDefinition, type SettingKey } from '@/lib/settings/registry';
import { getAllSettings, getSettingsMetadata, setSetting, SettingValidationError } from '@/lib/settings/store';
import { cleanText } from '@/lib/security/html';
import { toCsv } from '@/lib/jobs/tracker';

// ---------------------------------------------------------------------------
// Monitoring
// ---------------------------------------------------------------------------

export async function monitoringOverview() {
  const [queue, workers, settings] = await Promise.all([getQueueStats(), getWorkerHealth(), getAllSettings()]);

  const upcoming = await client<{ id: string; url: string; companyName: string | null; nextCheckAt: Date | null; status: string; priority: number }[]>`
    SELECT id, url, company_name AS "companyName", next_check_at AS "nextCheckAt", status, priority
    FROM career_pages WHERE status <> 'paused'
    ORDER BY next_check_at ASC NULLS FIRST LIMIT 15
  `;
  const failures = await client<{ errorClass: string; count: number; sources: number }[]>`
    SELECT coalesce(error_class, 'unknown') AS "errorClass", count(*)::int AS count, count(DISTINCT career_page_id)::int AS sources
    FROM scrape_logs WHERE scraped_at > now() - interval '24 hours' AND NOT success
    GROUP BY 1 ORDER BY 2 DESC
  `;
  const throughput = await client<{ hour: Date; succeeded: number; failed: number }[]>`
    WITH hours AS (
      SELECT generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') AS hour
    )
    SELECT h.hour,
      (SELECT count(*) FROM scrape_logs s WHERE s.scraped_at >= h.hour AND s.scraped_at < h.hour + interval '1 hour' AND s.success)::int AS succeeded,
      (SELECT count(*) FROM scrape_logs s WHERE s.scraped_at >= h.hour AND s.scraped_at < h.hour + interval '1 hour' AND NOT s.success)::int AS failed
    FROM hours h ORDER BY h.hour
  `;

  return {
    monitoringEnabled: settings['scraper.enabled'],
    intervalMinutes: settings['scraper.use_global_timer'] ? settings['scraper.global_check_interval_minutes'] : null,
    workerMode: env.worker.mode,
    queue,
    workers,
    upcoming: upcoming.map(row => ({ ...row, name: displayCompanyName(row.companyName, row.url) })),
    failures: failures.map(row => ({ ...row, ...describeErrorClass(row.errorClass) })),
    throughput,
  };
}

export const TASK_STATUS_FILTERS = ['all', 'queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;

export async function listTasks(options: { status: (typeof TASK_STATUS_FILTERS)[number]; sourceId?: string; page: number; pageSize: number }) {
  const where = and(
    options.status !== 'all' ? eq(monitorTasks.status, options.status) : undefined,
    options.sourceId ? eq(monitorTasks.careerPageId, options.sourceId) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: monitorTasks.id,
        status: monitorTasks.status,
        trigger: monitorTasks.trigger,
        priority: monitorTasks.priority,
        force: monitorTasks.force,
        attempts: monitorTasks.attempts,
        enqueuedAt: monitorTasks.enqueuedAt,
        runAfter: monitorTasks.runAfter,
        startedAt: monitorTasks.startedAt,
        finishedAt: monitorTasks.finishedAt,
        lockedBy: monitorTasks.lockedBy,
        error: monitorTasks.error,
        errorClass: monitorTasks.errorClass,
        result: monitorTasks.result,
        sourceId: careerPages.id,
        sourceUrl: careerPages.url,
        companyName: careerPages.companyName,
        requestedBy: users.email,
      })
      .from(monitorTasks)
      .innerJoin(careerPages, eq(careerPages.id, monitorTasks.careerPageId))
      .leftJoin(users, eq(users.id, monitorTasks.requestedBy))
      .where(where)
      .orderBy(desc(sql`coalesce(${monitorTasks.finishedAt}, ${monitorTasks.startedAt}, ${monitorTasks.enqueuedAt})`))
      .limit(options.pageSize)
      .offset((options.page - 1) * options.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(monitorTasks).where(where),
  ]);
  return { total, items: rows.map(row => ({ ...row, company: displayCompanyName(row.companyName, row.sourceUrl) })) };
}

export type MonitoringAction = 'run_cycle' | 'pause' | 'resume' | 'cancel_queued' | 'recover';

export async function applyMonitoringAction(actor: AuditActor, action: MonitoringAction, req: { headers: Headers }) {
  switch (action) {
    case 'run_cycle': {
      const report = await runCycle({ mode: 'manual', workerId: `${env.worker.id}-manual`, budgetMs: 40_000, maxTasks: 10 });
      await recordAudit({ action: 'task.run_cycle', actor, metadata: { claimed: report.claimed, succeeded: report.succeeded, failed: report.failed }, req });
      return { report };
    }
    case 'pause':
    case 'resume':
      await setSetting('scraper.enabled', action === 'resume', actor.id);
      await recordAudit({ action: action === 'pause' ? 'monitoring.pause' : 'monitoring.resume', actor, req });
      return { monitoringEnabled: action === 'resume' };
    case 'cancel_queued': {
      const cancelled = await cancelQueuedTasks();
      await recordAudit({ action: 'task.cancel', actor, metadata: { cancelled, scope: 'all queued' }, req });
      return { cancelled };
    }
    case 'recover': {
      const recovered = await recoverExpiredLeases();
      await recordAudit({ action: 'task.recover', actor, metadata: { requeued: recovered.requeued, failed: recovered.failed }, req });
      return { recovered };
    }
  }
}

export async function applyTaskAction(actor: AuditActor, taskId: string, action: 'retry' | 'cancel', req: { headers: Headers }) {
  if (action === 'cancel') {
    const cancelled = await cancelTask(taskId);
    if (!cancelled) throw errors.conflict('Only queued tasks can be cancelled. A running scan finishes on its own.');
    await recordAudit({ action: 'task.cancel', actor, targetType: 'task', targetId: taskId, req });
    return { cancelled: true };
  }
  const result = await retryTask(taskId, actor.id);
  if (!result) throw errors.conflict('Only failed or cancelled tasks can be retried.');
  await recordAudit({ action: 'task.retry', actor, targetType: 'task', targetId: taskId, req });
  return { queued: !result.alreadyQueued, alreadyQueued: result.alreadyQueued };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function settingsForAdmin(role: string) {
  const [values, metadata] = await Promise.all([getAllSettings(), getSettingsMetadata()]);
  const editorIds = Array.from(new Set(Array.from(metadata.values()).map(item => item.updatedBy).filter((id): id is string => Boolean(id))));
  const editors = editorIds.length ? await db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, editorIds)) : [];
  const emailById = new Map(editors.map(editor => [editor.id, editor.email]));

  return {
    categories: SETTING_CATEGORIES,
    settings: (Object.values(SETTINGS) as SettingDefinition[]).map(definition => {
      const meta = metadata.get(definition.key);
      const permission = (definition.permission ?? 'settings.manage') as Permission;
      return {
        ...definition,
        value: values[definition.key as SettingKey],
        editable: can(role, permission),
        updatedAt: meta?.updatedAt ?? null,
        updatedBy: meta?.updatedBy ? (emailById.get(meta.updatedBy) ?? 'deleted user') : null,
      };
    }),
  };
}

export async function updateSettingAsAdmin(actor: AuditActor & { role: string }, key: string, value: unknown, req: { headers: Headers }) {
  if (!isSettingKey(key)) throw errors.validation([{ field: 'key', message: 'Unknown setting.' }]);
  const definition = SETTINGS[key] as SettingDefinition;
  if (!can(actor.role, (definition.permission ?? 'settings.manage') as Permission)) {
    throw errors.forbidden('Your role cannot change this setting.');
  }
  try {
    const result = await setSetting(key, value, actor.id);
    await recordAudit({
      action: key === 'banner.config' ? 'banner.update' : 'settings.update',
      actor,
      targetType: 'setting',
      targetId: key,
      metadata: { from: result.previous, to: result.value },
      req,
    });
    return result;
  } catch (error) {
    if (error instanceof SettingValidationError) throw errors.validation([{ field: 'value', message: error.message }], error.message);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export async function listAudit(options: { action?: string; actor?: string; targetType?: string; targetId?: string; from?: Date; to?: Date; page: number; pageSize: number }) {
  const where = and(
    options.action ? eq(adminAuditLog.action, options.action) : undefined,
    options.actor ? ilike(adminAuditLog.actorEmail, `%${options.actor.replace(/[\\%_]/g, char => `\\${char}`)}%`) : undefined,
    options.targetType ? eq(adminAuditLog.targetType, options.targetType) : undefined,
    options.targetId ? eq(adminAuditLog.targetId, options.targetId) : undefined,
    options.from ? gte(adminAuditLog.createdAt, options.from) : undefined,
    options.to ? lte(adminAuditLog.createdAt, options.to) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: adminAuditLog.id,
        action: adminAuditLog.action,
        actorEmail: sql<string | null>`coalesce(${adminAuditLog.actorEmail}, ${users.email})`,
        actorRole: adminAuditLog.actorRole,
        targetType: adminAuditLog.targetType,
        targetId: adminAuditLog.targetId,
        metadata: adminAuditLog.metadata,
        ipAddress: adminAuditLog.ipAddress,
        createdAt: adminAuditLog.createdAt,
      })
      .from(adminAuditLog)
      .leftJoin(users, eq(users.id, adminAuditLog.adminId))
      .where(where)
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(options.pageSize)
      .offset((options.page - 1) * options.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(adminAuditLog).where(where),
  ]);
  return { total, items: rows.map(row => ({ ...row, label: describeAuditAction(row.action) })) };
}

export async function auditCsv(options: Parameters<typeof listAudit>[0]) {
  const { items } = await listAudit({ ...options, page: 1, pageSize: 10_000 });
  return toCsv(
    ['Time (UTC)', 'Action', 'Description', 'Actor', 'Role', 'Target type', 'Target id', 'IP', 'Details'],
    items.map(item => [item.createdAt, item.action, item.label, item.actorEmail, item.actorRole, item.targetType, item.targetId, item.ipAddress, item.metadata ? JSON.stringify(item.metadata) : '']),
  );
}

export function auditActionOptions() {
  return Object.entries(AUDIT_ACTIONS).map(([value, label]) => ({ value, label }));
}

// ---------------------------------------------------------------------------
// Reported issues
// ---------------------------------------------------------------------------

export async function listIssues(options: { status?: string; category?: string; q?: string; page: number; pageSize: number }) {
  const pattern = options.q ? `%${options.q.replace(/[\\%_]/g, char => `\\${char}`)}%` : null;
  const where = and(
    options.status && options.status !== 'all' ? eq(reportedIssues.status, options.status) : undefined,
    options.category ? eq(reportedIssues.category, options.category) : undefined,
    pattern ? or(ilike(reportedIssues.subject, pattern), ilike(reportedIssues.reporterEmail, pattern), ilike(reportedIssues.description, pattern)) : undefined,
  );
  const [rows, [{ total }], counts] = await Promise.all([
    db.select().from(reportedIssues).where(where).orderBy(desc(reportedIssues.createdAt)).limit(options.pageSize).offset((options.page - 1) * options.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(reportedIssues).where(where),
    db.select({ status: reportedIssues.status, n: sql<number>`count(*)::int` }).from(reportedIssues).groupBy(reportedIssues.status),
  ]);
  return { total, items: rows, counts: Object.fromEntries(counts.map(row => [row.status, row.n])) };
}

export async function updateIssue(actor: AuditActor, id: string, patch: { status?: string; priority?: string; adminNotes?: string | null }, req: { headers: Headers }) {
  const changes: Partial<typeof reportedIssues.$inferInsert> = {};
  if (patch.status) {
    changes.status = patch.status;
    if (patch.status === 'resolved' || patch.status === 'closed') {
      changes.resolvedAt = new Date();
      changes.resolvedBy = actor.id;
    } else {
      // Reopened: it is no longer resolved.
      changes.resolvedAt = null;
      changes.resolvedBy = null;
    }
  }
  if (patch.priority) changes.priority = patch.priority;
  if (patch.adminNotes !== undefined) changes.adminNotes = patch.adminNotes ? patch.adminNotes.slice(0, 5000) : null;
  const [row] = await db.update(reportedIssues).set(changes).where(eq(reportedIssues.id, id)).returning();
  if (!row) throw errors.notFound('Issue');
  await recordAudit({ action: 'issue.update', actor, targetType: 'issue', targetId: id, metadata: { ...patch, adminNotes: patch.adminNotes ? '(updated)' : undefined }, req });
  return row;
}

export async function deleteIssue(actor: AuditActor, id: string, req: { headers: Headers }) {
  const [row] = await db.delete(reportedIssues).where(eq(reportedIssues.id, id)).returning({ id: reportedIssues.id, subject: reportedIssues.subject });
  if (!row) throw errors.notFound('Issue');
  await recordAudit({ action: 'issue.delete', actor, targetType: 'issue', targetId: id, metadata: { subject: cleanText(row.subject, 140) }, req });
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

export async function systemStatus() {
  const database = await pingDb();
  const [db_] = database.ok
    ? await client<{ bytes: number; version: string; connections: number; maxConnections: number }[]>`
        SELECT pg_database_size(current_database())::bigint AS bytes, split_part(version(), ' ', 2) AS version,
          (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database())::int AS connections,
          current_setting('max_connections')::int AS "maxConnections"
      `
    : [];
  const migrations = database.ok
    ? await client<{ name: string; appliedAt: Date }[]>`SELECT name, applied_at AS "appliedAt" FROM schema_migrations ORDER BY name`.catch(() => [])
    : [];
  const tables = database.ok
    ? await client<{ table: string; rows: number; bytes: number }[]>`
        SELECT relname AS table, n_live_tup::bigint AS rows, pg_total_relation_size(relid)::bigint AS bytes
        FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 12
      `.catch(() => [])
    : [];

  return {
    services: [
      {
        id: 'database',
        label: 'Database',
        status: database.ok ? 'ok' : 'down',
        detail: database.ok ? `Responded in ${database.latencyMs} ms` : 'Not reachable',
      },
      {
        id: 'email',
        label: 'Email delivery',
        status: env.email.provider === 'brevo' ? 'ok' : 'warning',
        detail: env.email.provider === 'brevo' ? `Brevo, sending as ${env.email.senderEmail}` : 'Console mode: emails are logged, not delivered (BREVO_API_KEY not set)',
      },
      {
        id: 'ai',
        label: 'AI extraction',
        status: isAiConfigured() ? 'ok' : 'off',
        detail: isAiConfigured() ? 'A language model provider is configured' : 'Not configured; pages that need it are read with HTML parsing only',
      },
      {
        id: 'redis',
        label: 'Shared rate limits (Upstash)',
        status: env.redis.url && env.redis.token ? 'ok' : 'off',
        detail: env.redis.url && env.redis.token ? 'Configured' : 'Not configured; rate limits are kept in memory',
      },
      {
        id: 'cron',
        label: 'Cron endpoint',
        status: env.cronSecret ? 'ok' : 'off',
        detail: env.cronSecret ? 'POST /api/cron/tick is enabled' : 'Disabled (CRON_SECRET not set)',
      },
      {
        id: 'google',
        label: 'Google sign-in',
        status: env.google.clientId ? 'ok' : 'off',
        detail: env.google.clientId ? 'Configured' : 'Not configured',
      },
    ],
    database: db_ ? { ...db_, bytes: Number(db_.bytes) } : null,
    tables: tables.map(table => ({ ...table, rows: Number(table.rows), bytes: Number(table.bytes) })),
    migrations,
    runtime: {
      node: process.version,
      environment: process.env.NODE_ENV ?? 'development',
      scannerVersion: SCANNER_VERSION,
      workerMode: env.worker.mode,
      appUrl: env.appUrl,
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    adapters: listAdapters(),
  };
}
