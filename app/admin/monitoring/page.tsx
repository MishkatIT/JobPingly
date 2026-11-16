'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ChevronDown, Pause, Play, RotateCcw, Square, Wrench, X, Zap } from 'lucide-react';
import { Can, RequirePermission, nextSearch } from '@/components/admin/bits';
import { TaskStatusBadge, formatSeconds, triggerLabel } from '@/components/admin/monitoring-bits';
import { TimeAgo } from '@/components/app/bits';
import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { BarChart } from '@/components/ui/chart';
import { Dropdown, Pagination, Tabs, useConfirm } from '@/components/ui/overlay';
import { Badge, Callout, Card, CardBody, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, SkeletonRows, StatCell, StatGrid, StatusDot, Table, TableWrap, Td, Th, Tr } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage, qs } from '@/lib/client/api';
import { formatDateTime, formatDuration, formatInterval, formatNumber, plural } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';

interface QueueStats {
  queued: number;
  running: number;
  dueNow: number;
  succeeded24h: number;
  failed24h: number;
  cancelled24h: number;
  oldestQueuedSeconds: number | null;
  avgWaitSeconds24h: number | null;
  avgDurationSeconds24h: number | null;
  p95DurationSeconds24h: number | null;
}

interface Worker {
  id: string;
  alive: boolean;
  heartbeatAt: string | null;
  secondsSinceHeartbeat: number | null;
  startedAt: string | null;
  lastError: string | null;
  lastCycle: Record<string, unknown> | null;
}

interface Overview {
  monitoringEnabled: boolean;
  intervalMinutes: number | null;
  workerMode: 'separate' | 'inline' | 'off' | string;
  queue: QueueStats;
  workers: Worker[];
  upcoming: { id: string; name: string; url: string; nextCheckAt: string | null; status: string; priority: number }[];
  failures: { errorClass: string; label: string; hint: string; count: number; sources: number }[];
  throughput: { hour: string; succeeded: number; failed: number }[];
}

interface TaskRow {
  id: string;
  status: string;
  trigger: string;
  priority: number;
  force: boolean;
  attempts: number;
  enqueuedAt: string;
  runAfter: string;
  startedAt: string | null;
  finishedAt: string | null;
  lockedBy: string | null;
  error: string | null;
  errorClass: string | null;
  result: Record<string, unknown> | null;
  sourceId: string;
  company: string;
  requestedBy: string | null;
}

type TaskFilter = 'all' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
const TASK_FILTERS: { value: TaskFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'queued', label: 'Queued' },
  { value: 'running', label: 'Running' },
  { value: 'failed', label: 'Failed' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'cancelled', label: 'Cancelled' },
];
const TASK_PAGE_SIZE = 25;

const WORKER_MODE_TEXT: Record<string, string> = {
  separate: 'a separate worker process (npm run worker)',
  inline: 'the web server process (WORKER_MODE=inline)',
  off: 'nothing in this deployment (WORKER_MODE=off); scans run only when /api/cron/tick or "npm run worker:once" is called',
};

function cycleNumber(cycle: Record<string, unknown> | null, key: string): number | null {
  const value = cycle?.[key];
  return typeof value === 'number' ? value : null;
}

function hourLabel(value: unknown): string {
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function MonitoringView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const { can } = useSession();
  const { confirm, element: confirmElement } = useConfirm();
  const { data, error, isLoading, mutate } = useApi<Overview>('/api/admin/monitoring', { refreshInterval: 15_000 });
  const [busy, setBusy] = useState<string | null>(null);

  const taskParam = params.get('tasks') as TaskFilter | null;
  const taskStatus: TaskFilter = TASK_FILTERS.some(item => item.value === taskParam) ? taskParam! : 'all';
  const taskPage = Math.max(1, Number(params.get('taskPage')) || 1);
  const source = params.get('source') ?? '';
  const update = (changes: Record<string, string | number | null>) => router.replace(`${pathname}${nextSearch(params, changes, false)}#tasks`, { scroll: false });

  const tasksQuery = qs({ status: taskStatus, source, page: taskPage, pageSize: TASK_PAGE_SIZE });
  const tasks = useApi<TaskRow[]>(`/api/admin/tasks${tasksQuery}`, { refreshInterval: 15_000 });

  const refreshAll = async () => {
    await Promise.all([mutate(), tasks.mutate()]);
  };

  const runAction = async (action: 'run_cycle' | 'pause' | 'resume' | 'cancel_queued' | 'recover') => {
    setBusy(action);
    try {
      const result = await api<{
        report?: Record<string, unknown>;
        monitoringEnabled?: boolean;
        cancelled?: number;
        recovered?: { requeued: number; failed: number };
      }>('/api/admin/monitoring', { body: { action } });
      if (action === 'run_cycle' && result.report) {
        const report = result.report;
        if (typeof report.skipped === 'string') toast.error('The cycle did not run', report.skipped);
        else if (typeof report.error === 'string') toast.error('The cycle stopped with an error', report.error);
        else
          toast.success(
            'Cycle finished',
            `${plural(cycleNumber(report, 'claimed') ?? 0, 'task')} run: ${formatNumber(cycleNumber(report, 'succeeded') ?? 0)} succeeded, ${formatNumber(cycleNumber(report, 'failed') ?? 0)} failed, ${plural(cycleNumber(report, 'emailsSent') ?? 0, 'email')} sent.`,
          );
      } else if (action === 'pause' || action === 'resume') {
        toast.success(result.monitoringEnabled ? 'Monitoring resumed' : 'Monitoring paused');
      } else if (action === 'cancel_queued') {
        toast.success(`${plural(result.cancelled ?? 0, 'queued task')} cancelled`);
      } else if (action === 'recover' && result.recovered) {
        toast.success('Stuck tasks checked', `${plural(result.recovered.requeued, 'task')} returned to the queue, ${plural(result.recovered.failed, 'task')} marked failed.`);
      }
      await refreshAll();
    } catch (err) {
      toast.error('The action failed', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const confirmPause = async () => {
    const ok = await confirm({
      title: 'Pause scheduled monitoring?',
      description: 'No source is checked on its schedule until monitoring is resumed. Scans requested by hand still run, and alerts for jobs already found are still sent.',
      confirmLabel: 'Pause monitoring',
      tone: 'danger',
    });
    if (ok) await runAction('pause');
  };

  const confirmCancelQueued = async () => {
    const ok = await confirm({
      title: 'Cancel every queued task?',
      description: `${plural(data?.queue.queued ?? 0, 'task')} waiting in the queue will be cancelled. Running scans finish normally, and sources are queued again on their next schedule.`,
      confirmLabel: 'Cancel queued tasks',
      tone: 'danger',
    });
    if (ok) await runAction('cancel_queued');
  };

  const taskAction = async (task: TaskRow, action: 'retry' | 'cancel') => {
    setBusy(`${action}:${task.id}`);
    try {
      const result = await api<{ queued?: boolean; alreadyQueued?: boolean; cancelled?: boolean }>(`/api/admin/tasks/${task.id}`, { body: { action } });
      if (action === 'cancel') toast.success('Task cancelled');
      else toast.success(result.alreadyQueued ? `${task.company} is already queued` : `Retry queued for ${task.company}`);
      await refreshAll();
    } catch (err) {
      toast.error(action === 'cancel' ? 'Could not cancel the task' : 'Could not retry the task', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const aliveWorkers = data?.workers.filter(worker => worker.alive) ?? [];
  const manage = can('workers.manage');

  return (
    <>
      <PageHeader
        title="Workers & queue"
        description="The background work that checks sources for new jobs and sends alerts. Refreshes every 15 seconds."
        actions={
          <Can permission="workers.manage">
            <Dropdown
              label="More monitoring actions"
              triggerClassName="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3.5 text-base font-medium text-ink shadow-xs hover:bg-sunken"
              trigger={
                <>
                  More actions <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </>
              }
              items={[
                data?.monitoringEnabled === false
                  ? { label: 'Resume monitoring', icon: <Play />, onSelect: () => void runAction('resume'), disabled: busy !== null }
                  : { label: 'Pause monitoring', icon: <Pause />, onSelect: () => void confirmPause(), disabled: busy !== null || !data },
                { label: 'Recover stuck tasks', icon: <Wrench />, onSelect: () => void runAction('recover'), disabled: busy !== null },
                { label: 'Cancel all queued tasks', icon: <Square />, onSelect: () => void confirmCancelQueued(), disabled: busy !== null || !data || data.queue.queued === 0, tone: 'danger', separator: true },
              ]}
            />
            <Button variant="primary" icon={<Zap className="h-4 w-4" />} loading={busy === 'run_cycle'} disabled={busy !== null} onClick={() => runAction('run_cycle')}>
              Run a cycle now
            </Button>
          </Can>
        }
      />

      {error ? (
        <ErrorState description={errorMessage(error)} onRetry={() => mutate()} />
      ) : isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-56" />
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {!data.monitoringEnabled && (
              <Callout tone="warning" title="Scheduled monitoring is paused">
                Sources are not checked on their schedule. Manual scans and alert emails still run.
                {manage && (
                  <div className="mt-2">
                    <Button size="sm" icon={<Play className="h-3.5 w-3.5" />} loading={busy === 'resume'} disabled={busy !== null} onClick={() => runAction('resume')}>
                      Resume monitoring
                    </Button>
                  </div>
                )}
              </Callout>
            )}
            {aliveWorkers.length === 0 && (
              <Callout tone={data.workerMode === 'off' ? 'neutral' : 'danger'} title="No worker has reported recently">
                In this deployment, scans are run by {WORKER_MODE_TEXT[data.workerMode] ?? data.workerMode}.
                {data.workerMode === 'separate' ? ' Check that the worker service is running and can reach the database.' : ''}
                {data.workerMode === 'inline' ? ' The web server may be asleep or restarting; a sleeping free-tier instance stops all scans.' : ''}
                {manage ? ' “Run a cycle now” runs one cycle inside this request.' : ''}
              </Callout>
            )}
          </div>

          <StatGrid className={!data.monitoringEnabled || aliveWorkers.length === 0 ? 'mt-6' : undefined}>
            <StatCell label="Waiting" value={formatNumber(data.queue.queued)} hint={`${formatNumber(data.queue.dueNow)} due now`} tone={data.queue.dueNow > 100 ? 'warning' : undefined} />
            <StatCell label="Running" value={formatNumber(data.queue.running)} />
            <StatCell label="Succeeded (24h)" value={formatNumber(data.queue.succeeded24h)} />
            <StatCell label="Failed (24h)" value={formatNumber(data.queue.failed24h)} tone={data.queue.failed24h > 0 ? 'danger' : undefined} hint={data.queue.cancelled24h > 0 ? `${formatNumber(data.queue.cancelled24h)} cancelled` : undefined} />
          </StatGrid>
          <StatGrid className="mt-3">
            <StatCell label="Oldest due task waiting" value={formatSeconds(data.queue.oldestQueuedSeconds)} tone={(data.queue.oldestQueuedSeconds ?? 0) > 3600 ? 'warning' : undefined} />
            <StatCell label="Average wait (24h)" value={formatSeconds(data.queue.avgWaitSeconds24h)} />
            <StatCell label="Average scan (24h)" value={formatSeconds(data.queue.avgDurationSeconds24h)} />
            <StatCell label="Slowest 5% of scans" value={formatSeconds(data.queue.p95DurationSeconds24h)} hint="95th percentile, 24h" />
          </StatGrid>

          <Card className="mt-6">
            <CardBody>
              <BarChart
                title="Scans per hour"
                description={`Last 24 hours.${data.intervalMinutes ? ` Every source is checked every ${formatInterval(data.intervalMinutes)} (platform-wide setting).` : ' Sources are checked on their own intervals.'}`}
                data={data.throughput}
                x="hour"
                stacked
                formatX={hourLabel}
                series={[
                  { key: 'succeeded', label: 'Succeeded', color: 'var(--chart-good)' },
                  { key: 'failed', label: 'Failed', color: 'var(--chart-critical)' },
                ]}
              />
            </CardBody>
          </Card>

          <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Workers" description={`Scans are run by ${WORKER_MODE_TEXT[data.workerMode] ?? data.workerMode}.`} />
              {data.workers.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted">No worker has ever reported in.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.workers.map(worker => {
                    const cycle = worker.lastCycle;
                    const finishedAt = typeof cycle?.finishedAt === 'string' ? cycle.finishedAt : null;
                    return (
                      <li key={worker.id} className="px-5 py-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-sm text-ink">{worker.id}</span>
                          <StatusDot tone={worker.alive ? 'success' : 'danger'} pulse={worker.alive}>
                            {worker.alive ? 'Alive' : 'Not responding'}
                          </StatusDot>
                        </div>
                        <p className="mt-1 text-sm text-muted">
                          Last heartbeat <TimeAgo value={worker.heartbeatAt} />
                          {worker.startedAt && (
                            <>
                              {' '}
                              · started <TimeAgo value={worker.startedAt} />
                            </>
                          )}
                        </p>
                        {cycle && (
                          <p className="mt-1 text-sm text-muted">
                            Last cycle{finishedAt ? <> <TimeAgo value={finishedAt} /></> : ''}: {formatNumber(cycleNumber(cycle, 'claimed'))} run, {formatNumber(cycleNumber(cycle, 'succeeded'))} succeeded,{' '}
                            {formatNumber(cycleNumber(cycle, 'failed'))} failed, {formatNumber(cycleNumber(cycle, 'jobsAdded'))} new jobs, {formatNumber(cycleNumber(cycle, 'emailsSent'))} emails, in{' '}
                            {formatDuration(cycleNumber(cycle, 'durationMs'))}
                            {typeof cycle.skipped === 'string' ? ` · skipped: ${cycle.skipped}` : ''}
                          </p>
                        )}
                        {worker.lastError && <p className="mt-1.5 break-words font-mono text-xs text-danger">{worker.lastError}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader title="Failures in the last 24 hours" description="Grouped by cause." />
              {data.failures.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted">No failed scans in the last 24 hours.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.failures.map(failure => (
                    <li key={failure.errorClass} className="flex items-start justify-between gap-4 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-base font-medium text-ink">{failure.label}</p>
                        <p className="text-sm text-muted">{failure.hint}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tabular text-base font-semibold text-ink">{formatNumber(failure.count)}</p>
                        <p className="text-xs text-muted">{plural(failure.sources, 'source')}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-line px-5 py-3">
                <Link href="/admin/sources?status=broken" className="text-sm font-medium text-accent hover:text-accent-hover">
                  See broken sources
                </Link>
              </div>
            </Card>
          </div>

          <Card className="mt-6 overflow-hidden">
            <CardHeader title="Next scheduled checks" description="The fifteen sources due soonest (paused sources excluded)." />
            {data.upcoming.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">No sources are scheduled.</p>
            ) : (
              <TableWrap>
                <Table className="min-w-[560px]">
                  <thead>
                    <tr>
                      <Th>Source</Th>
                      <Th>Due</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Priority</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.upcoming.map(row => (
                      <Tr key={row.id}>
                        <Td>
                          <Link href={`/admin/sources/${row.id}`} className="font-medium text-ink hover:text-accent">
                            {row.name}
                          </Link>
                        </Td>
                        <Td className="whitespace-nowrap text-sm">
                          <TimeAgo value={row.nextCheckAt} />
                        </Td>
                        <Td className="text-sm capitalize">{row.status}</Td>
                        <Td className="tabular text-right text-sm">{row.priority}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>
        </>
      )}

      <section id="tasks" className="mt-8 scroll-mt-20">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Tasks</h2>
            <p className="text-sm text-muted">Every scan request: scheduled, manual, retried and first scans of new sources.</p>
          </div>
          {source && (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-surface pl-3 pr-1 text-sm text-ink">
              <Link href={`/admin/sources/${source}`} className="hover:text-accent">
                {tasks.data?.[0]?.company ?? 'One source'}
              </Link>
              <button type="button" aria-label="Show tasks for every source" onClick={() => update({ source: null, taskPage: null })} className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-ink">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          )}
        </div>
        <Tabs label="Task status" value={taskStatus} onChange={value => update({ tasks: value === 'all' ? null : value, taskPage: null })} options={TASK_FILTERS} />

        <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface">
          {tasks.error ? (
            <ErrorState description={errorMessage(tasks.error)} onRetry={() => tasks.mutate()} />
          ) : tasks.isLoading ? (
            <SkeletonRows rows={6} />
          ) : !tasks.data || tasks.data.length === 0 ? (
            <EmptyState title={taskStatus === 'all' ? 'No tasks yet' : 'No tasks with this status'} description="Tasks appear when sources are due or when someone asks for a scan." />
          ) : (
            <>
              <TableWrap>
                <Table className="min-w-[1040px]">
                  <thead>
                    <tr>
                      <Th>Source</Th>
                      <Th>Status</Th>
                      <Th>Trigger</Th>
                      <Th className="text-right">Attempts</Th>
                      <Th>Queued</Th>
                      <Th>Duration</Th>
                      <Th>Worker</Th>
                      <Th>Error or result</Th>
                      {manage && <Th className="text-right">Actions</Th>}
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.data.map(task => {
                      const durationMs = task.startedAt && task.finishedAt ? new Date(task.finishedAt).getTime() - new Date(task.startedAt).getTime() : null;
                      const outcome = typeof task.result?.outcome === 'string' ? task.result.outcome : null;
                      const found = typeof task.result?.jobsFound === 'number' ? task.result.jobsFound : null;
                      return (
                        <Tr key={task.id}>
                          <Td className="max-w-[220px]">
                            <Link href={`/admin/sources/${task.sourceId}`} className="block truncate font-medium text-ink hover:text-accent">
                              {task.company}
                            </Link>
                            {task.requestedBy && <span className="block truncate text-xs text-muted">by {task.requestedBy}</span>}
                          </Td>
                          <Td>
                            <TaskStatusBadge status={task.status} />
                          </Td>
                          <Td className="whitespace-nowrap text-sm">
                            {triggerLabel(task.trigger)}
                            {task.force && (
                              <Badge tone="outline" className="ml-1.5" title="Re-reads every job even if the page looks unchanged">
                                Full
                              </Badge>
                            )}
                          </Td>
                          <Td className="tabular text-right text-sm">{task.attempts}</Td>
                          <Td className="whitespace-nowrap text-sm" title={formatDateTime(task.enqueuedAt)}>
                            <TimeAgo value={task.enqueuedAt} />
                            {task.status === 'queued' && (
                              <span className="block text-xs text-muted">
                                due <TimeAgo value={task.runAfter} />
                              </span>
                            )}
                          </Td>
                          <Td className="tabular whitespace-nowrap text-sm">{durationMs !== null ? formatDuration(durationMs) : task.status === 'running' ? 'In progress' : '—'}</Td>
                          <Td className="max-w-[140px] truncate font-mono text-xs text-muted" title={task.lockedBy ?? undefined}>
                            {task.lockedBy ?? '—'}
                          </Td>
                          <Td className="max-w-[280px] text-sm">
                            {task.error ? (
                              <span className="block truncate text-danger" title={task.error}>
                                {task.errorClass ? `${task.errorClass}: ` : ''}
                                {task.error}
                              </span>
                            ) : outcome ? (
                              <span className="text-muted">
                                {outcome}
                                {found !== null ? ` · ${plural(found, 'job')}` : ''}
                              </span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </Td>
                          {manage && (
                            <Td className="whitespace-nowrap text-right">
                              {task.status === 'queued' && (
                                <Button size="xs" variant="ghost" icon={<X className="h-3.5 w-3.5" />} loading={busy === `cancel:${task.id}`} disabled={busy !== null} onClick={() => taskAction(task, 'cancel')}>
                                  Cancel
                                </Button>
                              )}
                              {(task.status === 'failed' || task.status === 'cancelled') && (
                                <Button size="xs" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} loading={busy === `retry:${task.id}`} disabled={busy !== null} onClick={() => taskAction(task, 'retry')}>
                                  Retry
                                </Button>
                              )}
                            </Td>
                          )}
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
              <Pagination
                page={taskPage}
                totalPages={Number(tasks.meta?.totalPages ?? 1)}
                total={Number(tasks.meta?.total ?? tasks.data.length)}
                pageSize={TASK_PAGE_SIZE}
                onChange={next => update({ taskPage: next > 1 ? next : null })}
                className="border-t border-line"
              />
            </>
          )}
        </div>
      </section>
      {confirmElement}
    </>
  );
}

export default function AdminMonitoringPage() {
  return (
    <RequirePermission permission="workers.read">
      <Suspense fallback={<Skeleton className="h-64" />}>
        <MonitoringView />
      </Suspense>
    </RequirePermission>
  );
}
