'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { RequirePermission } from '@/components/admin/bits';
import { TimeAgo } from '@/components/app/bits';
import { Button } from '@/components/ui/button';
import { BarChart, SegmentBar } from '@/components/ui/chart';
import { Callout, Card, CardBody, CardHeader, ErrorState, PageHeader, Skeleton, StatCell, StatGrid, StatusDot } from '@/components/ui/primitives';
import { formatBytes, formatDuration, formatNumber, formatPercent, plural } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';

interface Overview {
  counts: {
    usersTotal: number;
    usersVerified: number;
    usersUnverified: number;
    usersSuspended: number;
    usersNewToday: number;
    usersNew7d: number;
    usersNewPrev7d: number;
    usersActive7d: number;
    usersActive30d: number;
    sourcesTotal: number;
    sourcesActive: number;
    sourcesDegraded: number;
    sourcesBroken: number;
    sourcesPaused: number;
    sourcesPending: number;
    sourcesUnwatched: number;
    jobsOpen: number;
    jobsNewToday: number;
    jobsNew7d: number;
    jobsNewPrev7d: number;
    jobsClosed7d: number;
    jobsHidden: number;
    scans24h: number;
    scansFailed24h: number;
    scansSuspicious24h: number;
    listsTotal: number;
    listsPublic: number;
    pendingAlerts: number;
    pendingApprovals: number;
    openIssues: number;
    dbBytes: number;
    scanSuccessRate24h: number | null;
  };
  series: { day: string; signups: number; jobs: number; scansOk: number; scansFailed: number; emailsSent: number; emailsFailed: number }[];
  failuresByClass: { errorClass: string; label: string; count: number }[];
  adapters: { adapter: string; label: string; count: number }[];
  queue: {
    queued: number;
    running: number;
    dueNow: number;
    succeeded24h: number;
    failed24h: number;
    oldestQueuedSeconds: number | null;
    avgDurationSeconds24h: number | null;
  };
  workers: { id: string; alive: boolean; mode: string | null; heartbeatAt: string; secondsSinceHeartbeat: number; lastError: string | null }[];
  email: { sentToday: number; failedToday: number; totalToday: number; dailyLimit: number | null; digestLimit: number | null; provider: string };
  switches: { monitoring: boolean; emailAlerts: boolean; maintenance: boolean; signups: boolean };
}

/** "+12 vs 8 the week before" */
function weekTrend(current: number, previous: number): string {
  if (current === 0 && previous === 0) return 'None in the last 14 days';
  return `${formatNumber(current)} in 7 days (prior 7: ${formatNumber(previous)})`;
}

function SwitchRow({ on, label, onText, offText, warnWhen }: { on: boolean; label: string; onText: string; offText: string; warnWhen: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
      <span className="text-base text-ink">{label}</span>
      <StatusDot tone={on === warnWhen ? 'warning' : 'success'}>{on ? onText : offText}</StatusDot>
    </div>
  );
}

function LinkRow({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-accent hover:text-accent-hover">
      {children}
    </Link>
  );
}

function OverviewView() {
  const { data, error, isLoading, isRefreshing, mutate } = useApi<Overview>('/api/admin/overview', { refreshInterval: 60_000 });

  if (error) return <ErrorState description="The overview could not be loaded." onRetry={() => mutate()} />;
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { counts, queue, workers, email, switches } = data;
  const aliveWorkers = workers.filter(worker => worker.alive);
  const newestHeartbeat = workers.reduce<number | null>((min, worker) => (min === null ? worker.secondsSinceHeartbeat : Math.min(min, worker.secondsSinceHeartbeat)), null);
  const healthyShare = counts.sourcesTotal > 0 ? counts.sourcesActive / counts.sourcesTotal : null;

  const attention: ReactNode[] = [];
  if (switches.monitoring && aliveWorkers.length === 0) {
    attention.push(
      <Callout key="workers" tone="danger" title="Monitoring is not running">
        {workers.length === 0 ? 'No worker has ever reported in.' : `No worker has reported in for ${formatDuration((newestHeartbeat ?? 0) * 1000)}.`} Sources are not being checked and no alerts are being produced. See{' '}
        <LinkRow href="/admin/monitoring">Workers &amp; queue</LinkRow> and the deployment guide.
      </Callout>,
    );
  }
  if (!switches.monitoring) attention.push(<Callout key="mon-off" tone="warning" title="Monitoring is switched off">No sources are being checked. Turn it back on in <LinkRow href="/admin/settings">Settings</LinkRow>.</Callout>);
  if (!switches.emailAlerts) attention.push(<Callout key="mail-off" tone="warning" title="Email alerts are switched off">Matches are recorded but no alert emails are sent.</Callout>);
  if (switches.maintenance) attention.push(<Callout key="maint" tone="warning" title="Maintenance mode is on">Visitors see the maintenance notice.</Callout>);
  if (counts.pendingApprovals > 0) {
    attention.push(
      <Callout key="approvals" tone="accent">
        {plural(counts.pendingApprovals, 'email recipient')} waiting for approval. <LinkRow href="/admin/emails?tab=approvals">Review</LinkRow>
      </Callout>,
    );
  }
  if (counts.sourcesBroken > 0) {
    attention.push(
      <Callout key="broken" tone="neutral">
        {plural(counts.sourcesBroken, 'source')} cannot be checked. <LinkRow href="/admin/sources?status=broken">See which</LinkRow>
      </Callout>,
    );
  }
  if (counts.openIssues > 0) {
    attention.push(
      <Callout key="issues" tone="neutral">
        {plural(counts.openIssues, 'reported issue')} open. <LinkRow href="/admin/issues">Triage</LinkRow>
      </Callout>,
    );
  }

  return (
    <>
      <PageHeader
        title="Overview"
        description="Live figures for the whole platform. Refreshes every minute."
        actions={
          <Button icon={<RefreshCw className="h-4 w-4" />} loading={isRefreshing} onClick={() => mutate()}>
            Refresh
          </Button>
        }
      />

      {attention.length > 0 && <div className="mb-6 space-y-2">{attention}</div>}

      <StatGrid>
        <StatCell label="Users" value={formatNumber(counts.usersTotal)} hint={weekTrend(counts.usersNew7d, counts.usersNewPrev7d)} />
        <StatCell label="Active in the last 7 days" value={formatNumber(counts.usersActive7d)} hint={`${formatNumber(counts.usersActive30d)} in 30 days`} />
        <StatCell label="Open jobs" value={formatNumber(counts.jobsOpen)} hint={`${formatNumber(counts.jobsNewToday)} found today · ${formatNumber(counts.jobsClosed7d)} closed this week`} />
        <StatCell
          label="Healthy sources"
          value={`${formatNumber(counts.sourcesActive)} / ${formatNumber(counts.sourcesTotal)}`}
          hint={healthyShare === null ? 'No sources yet' : `${formatPercent(healthyShare)} · ${formatNumber(counts.sourcesDegraded)} degraded · ${formatNumber(counts.sourcesBroken)} broken`}
          tone={counts.sourcesBroken > 0 ? 'warning' : undefined}
        />
      </StatGrid>

      <StatGrid className="mt-3">
        <StatCell
          label="Scan success (24 h)"
          value={counts.scanSuccessRate24h === null ? '—' : formatPercent(counts.scanSuccessRate24h, 1)}
          hint={`${formatNumber(counts.scans24h)} scans · ${formatNumber(counts.scansSuspicious24h)} held for review`}
          tone={counts.scanSuccessRate24h !== null && counts.scanSuccessRate24h < 0.8 ? 'warning' : undefined}
        />
        <StatCell
          label="Scan queue"
          value={`${formatNumber(queue.queued)} queued`}
          hint={`${formatNumber(queue.running)} running · oldest due ${queue.oldestQueuedSeconds === null ? '—' : formatDuration(queue.oldestQueuedSeconds * 1000)}`}
        />
        <StatCell
          label="Emails today (UTC)"
          value={formatNumber(email.sentToday)}
          hint={`${formatNumber(email.failedToday)} failed · limit ${email.dailyLimit === null ? 'none' : formatNumber(email.dailyLimit)} · ${email.provider}`}
          tone={email.failedToday > 0 ? 'warning' : undefined}
        />
        <StatCell label="Database size" value={formatBytes(counts.dbBytes)} hint={`${formatNumber(counts.pendingAlerts)} alerts waiting to be sent`} />
      </StatGrid>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
        <Card>
          <CardBody>
            <BarChart title="New jobs found" description="Per day, last 30 days" data={data.series} x="day" series={[{ key: 'jobs', label: 'New jobs', color: 'var(--chart-1)' }]} />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <BarChart
              title="Scans"
              description="Per day, last 30 days"
              data={data.series}
              x="day"
              stacked
              series={[
                { key: 'scansOk', label: 'Succeeded', color: 'var(--chart-1)' },
                { key: 'scansFailed', label: 'Failed', color: 'var(--chart-critical)' },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <BarChart title="Sign-ups" description="Per day, last 30 days" data={data.series} x="day" series={[{ key: 'signups', label: 'Sign-ups', color: 'var(--chart-1)' }]} />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <BarChart
              title="Emails"
              description="Per day, last 30 days"
              data={data.series}
              x="day"
              stacked
              series={[
                { key: 'emailsSent', label: 'Sent', color: 'var(--chart-1)' },
                { key: 'emailsFailed', label: 'Failed', color: 'var(--chart-critical)' },
              ]}
            />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Sources by status" action={<LinkRow href="/admin/sources">All sources</LinkRow>} />
          <CardBody>
            <SegmentBar
              label="Sources by status"
              parts={[
                { label: 'Healthy', value: counts.sourcesActive, color: 'var(--chart-1)' },
                { label: 'Waiting for first scan', value: counts.sourcesPending, color: 'rgb(var(--line-strong))' },
                { label: 'Degraded', value: counts.sourcesDegraded, color: 'var(--chart-2)' },
                { label: 'Broken', value: counts.sourcesBroken, color: 'var(--chart-critical)' },
                { label: 'Paused', value: counts.sourcesPaused, color: 'rgb(var(--subtle))' },
              ]}
            />
            <p className="mt-4 text-sm text-muted">
              {plural(counts.sourcesUnwatched, 'source')} {counts.sourcesUnwatched === 1 ? 'is' : 'are'} on no watchlist and {counts.sourcesUnwatched === 1 ? 'is' : 'are'} not scanned.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Why scans failed (24 h)" />
          {data.failuresByClass.length === 0 ? (
            <CardBody>
              <p className="text-sm text-muted">No failed scans in the last 24 hours.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-line">
              {data.failuresByClass.map(row => (
                <li key={row.errorClass} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                  <span className="text-base text-ink">{row.label}</span>
                  <span className="tabular text-sm font-medium text-ink">{formatNumber(row.count)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Platform switches" action={<LinkRow href="/admin/settings">Settings</LinkRow>} />
          <div className="divide-y divide-line">
            <SwitchRow label="Monitoring" on={switches.monitoring} onText="Running" offText="Off" warnWhen={false} />
            <SwitchRow label="Email alerts" on={switches.emailAlerts} onText="On" offText="Off" warnWhen={false} />
            <SwitchRow label="New sign-ups" on={switches.signups} onText="Open" offText="Closed" warnWhen={false} />
            <SwitchRow label="Maintenance mode" on={switches.maintenance} onText="On" offText="Off" warnWhen={true} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Workers" action={<LinkRow href="/admin/monitoring">Details</LinkRow>} />
          {workers.length === 0 ? (
            <CardBody>
              <p className="text-sm text-muted">No worker has reported in yet. Start one with <code className="font-mono text-xs">npm run worker</code> or enable the inline worker.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-line">
              {workers.map(worker => (
                <li key={worker.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-xs text-ink">{worker.id}</span>
                    <span className="block text-xs text-subtle">{worker.mode === 'once' || worker.mode === 'cron' ? 'Scheduled runs' : 'Continuous'}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusDot tone={worker.alive ? 'success' : 'danger'}>{worker.alive ? 'Alive' : 'Stale'}</StatusDot>
                    <TimeAgo value={worker.heartbeatAt} className="text-xs text-subtle" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Users" action={<LinkRow href="/admin/users">All users</LinkRow>} />
          <dl className="divide-y divide-line">
            {[
              ['Verified', counts.usersVerified],
              ['Not verified', counts.usersUnverified],
              ['Suspended', counts.usersSuspended],
              ['Joined today', counts.usersNewToday],
            ].map(([label, value]) => (
              <div key={label as string} className="flex items-center justify-between px-4 py-2.5 sm:px-5">
                <dt className="text-base text-muted">{label}</dt>
                <dd className="tabular text-base font-medium text-ink">{formatNumber(value as number)}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card>
          <CardHeader title="Sources by adapter" />
          <ul className="divide-y divide-line">
            {data.adapters.slice(0, 8).map(row => (
              <li key={row.adapter} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                <span className="text-base text-ink">{row.label}</span>
                <span className="tabular text-sm font-medium text-ink">{formatNumber(row.count)}</span>
              </li>
            ))}
            {data.adapters.length === 0 && <li className="px-5 py-3 text-sm text-muted">No sources yet.</li>}
          </ul>
        </Card>
      </div>

      <p className="mt-6 text-sm text-muted">
        {formatNumber(counts.listsTotal)} watchlists ({formatNumber(counts.listsPublic)} public) · {formatNumber(counts.jobsHidden)} jobs hidden by moderators · scans finished in {queue.avgDurationSeconds24h === null ? '—' : formatDuration(queue.avgDurationSeconds24h * 1000)} on average.
      </p>
    </>
  );
}

export default function AdminOverviewPage() {
  return (
    <RequirePermission permission="overview.read">
      <OverviewView />
    </RequirePermission>
  );
}
