'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Briefcase, EyeOff, RotateCcw, X } from 'lucide-react';
import { Can, RequirePermission, SearchInput, nextSearch } from '@/components/admin/bits';
import { BulkBar, JOB_EVENT_LABELS, ReasonDialog, SelectBox, useSelection } from '@/components/admin/monitoring-bits';
import { JobFacets, TimeAgo } from '@/components/app/bits';
import { useSession } from '@/components/app/session';
import { Button, LinkButton } from '@/components/ui/button';
import { Dialog, Pagination, Tabs } from '@/components/ui/overlay';
import { Badge, Callout, DetailRow, EmptyState, ErrorState, PageHeader, Skeleton, SkeletonRows, StatCell, StatGrid, Table, TableWrap, Td, Th, Tr } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage, qs } from '@/lib/client/api';
import { cn } from '@/lib/client/cn';
import { formatDate, formatDateTime, formatNumber, plural } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';
import { isSafeHref } from '@/lib/security/ssrf-client';

interface JobRow {
  id: string;
  title: string;
  url: string | null;
  location: string | null;
  status: string;
  hiddenAt: string | null;
  hiddenReason: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  closedAt: string | null;
  identity: string;
  sourceId: string;
  company: string;
  matches: number;
  trackers: number;
}

interface JobDetail {
  job: {
    id: string;
    title: string;
    url: string | null;
    location: string | null;
    department: string | null;
    jobType: string | null;
    workplaceType: string | null;
    employmentType: string | null;
    seniority: string | null;
    salaryText: string | null;
    description: string | null;
    postedAt: string | null;
    deadlineAt: string | null;
    status: string;
    missedScrapes: number;
    firstSeenAt: string;
    lastSeenAt: string;
    closedAt: string | null;
    reopenedAt: string | null;
    hiddenAt: string | null;
    hiddenReason: string | null;
    fingerprint: string;
    externalId: string | null;
    dedupeKey: string | null;
    rawData: unknown;
  };
  source: { id: string; name: string; url: string; adapter: string | null };
  events: { id: string; type: string; changes: Record<string, { from: unknown; to: unknown }> | null; createdAt: string }[];
  counts: { matches: number; trackers: number; pendingAlerts: number; sentAlerts: number };
}

type View = 'open' | 'duplicates' | 'closed' | 'hidden' | 'all';
const VIEWS: { value: View; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'duplicates', label: 'Possible duplicates' },
  { value: 'closed', label: 'Closed' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'all', label: 'All' },
];
const STATUS_FOR_VIEW: Record<View, string> = { open: 'active', duplicates: 'active', closed: 'closed', hidden: 'hidden', all: 'all' };
const IDENTITY_LABELS: Record<string, string> = { ext: 'ATS id', url: 'Link', tl: 'Title + location' };
const PAGE_SIZE = 50;

function JobStatusBadge({ job }: { job: { status: string; hiddenAt: string | null } }) {
  if (job.hiddenAt) return <Badge tone="danger">Hidden</Badge>;
  return job.status === 'active' ? <Badge tone="success">Open</Badge> : <Badge tone="neutral">Closed</Badge>;
}

function JobsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const { can } = useSession();
  const viewParam = params.get('view') as View | null;
  const view: View = VIEWS.some(item => item.value === viewParam) ? viewParam! : 'open';
  const source = params.get('source') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [openId, setOpenId] = useState<string | null>(null);
  const [hiding, setHiding] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const update = (changes: Record<string, string | number | null>) => router.replace(`${pathname}${nextSearch(params, changes)}`, { scroll: false });

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.get('q') ?? '') !== search.trim()) update({ q: search.trim() || null });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const query = qs({ q: params.get('q') ?? '', status: STATUS_FOR_VIEW[view], duplicates: view === 'duplicates' ? 1 : null, source, page, pageSize: PAGE_SIZE });
  const { data, meta, error, isLoading, isRefreshing, mutate } = useApi<JobRow[]>(`/api/admin/jobs${query}`);
  const sourceInfo = meta?.source as { id: string; name: string } | null | undefined;
  const selection = useSelection((data ?? []).map(row => row.id));
  const canManage = can('jobs.manage');

  const apply = async (ids: string[], action: 'hide' | 'restore', reason?: string) => {
    setBusy(action);
    try {
      const result = await api<{ updated: number }>('/api/admin/jobs/bulk', { body: { ids, action, reason } });
      toast.success(action === 'hide' ? `${plural(result.updated, 'job')} hidden` : `${plural(result.updated, 'job')} restored`, action === 'hide' ? 'Pending alerts for them were cancelled.' : undefined);
      selection.clear();
      setHiding(null);
      await mutate();
      return true;
    } catch (err) {
      toast.error(action === 'hide' ? 'Could not hide' : 'Could not restore', errorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Jobs" description="Every posting discovered on monitored sources. Hidden jobs disappear for everyone and are never alerted." />

      <Tabs label="Job views" value={view} onChange={value => update({ view: value === 'open' ? null : value })} options={VIEWS.map(item => ({ ...item, count: item.value === view && meta ? Number(meta.total ?? 0) : null }))} />

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search title, company or link" className="relative w-full md:max-w-sm" />
        {source && (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-surface pl-3 pr-1 text-sm text-ink">
            Source:{' '}
            <Link href={`/admin/sources/${source}`} className="max-w-[220px] truncate font-medium hover:text-accent">
              {sourceInfo?.name ?? 'Loading…'}
            </Link>
            <button type="button" aria-label="Clear the source filter" onClick={() => update({ source: null })} className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-ink">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
        )}
        {isRefreshing && <span className="text-sm text-muted">Updating…</span>}
      </div>

      {view === 'duplicates' && (
        <Callout tone="neutral" className="mt-4">
          Open jobs at the same source with the same normalised title and location, grouped together. Some are genuinely separate openings, so review before hiding.
        </Callout>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface">
        {canManage && (
          <BulkBar count={selection.count} noun={['job', 'jobs']} onClear={selection.clear}>
            <Button size="sm" icon={<EyeOff className="h-3.5 w-3.5" />} disabled={busy !== null} onClick={() => setHiding(selection.ids)}>
              Hide
            </Button>
            <Button size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} loading={busy === 'restore'} disabled={busy !== null} onClick={() => apply(selection.ids, 'restore')}>
              Restore
            </Button>
          </BulkBar>
        )}

        {error ? (
          <ErrorState description={errorMessage(error)} onRetry={() => mutate()} />
        ) : isLoading ? (
          <SkeletonRows rows={8} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={<Briefcase />}
            title={view === 'duplicates' ? 'No possible duplicates' : 'No jobs match'}
            description={params.get('q') || source ? 'Try clearing the search or the source filter.' : undefined}
          />
        ) : (
          <>
            <TableWrap>
              <Table className="min-w-[1000px]">
                <thead>
                  <tr>
                    {canManage && (
                      <Th className="w-10">
                        <SelectBox checked={selection.allSelected} indeterminate={selection.someSelected} onChange={selection.toggleAll} label="Select all jobs on this page" />
                      </Th>
                    )}
                    <Th>Job</Th>
                    <Th>Company</Th>
                    <Th>Status</Th>
                    <Th>Identity</Th>
                    <Th className="text-right">Matches</Th>
                    <Th className="text-right">Tracked</Th>
                    <Th>First seen</Th>
                    <Th>Last seen</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(row => (
                    <Tr key={row.id} className={cn(selection.has(row.id) && 'bg-accent-soft/40')}>
                      {canManage && (
                        <Td>
                          <SelectBox checked={selection.has(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.title}`} />
                        </Td>
                      )}
                      <Td className="max-w-[340px]">
                        <button type="button" onClick={() => setOpenId(row.id)} className="block max-w-full truncate text-left font-medium text-ink hover:text-accent">
                          {row.title}
                        </button>
                        {row.location && <span className="block truncate text-sm text-muted">{row.location}</span>}
                      </Td>
                      <Td className="max-w-[200px]">
                        <Link href={`/admin/sources/${row.sourceId}`} className="block truncate text-sm text-ink hover:text-accent">
                          {row.company}
                        </Link>
                      </Td>
                      <Td>
                        <JobStatusBadge job={row} />
                        {row.hiddenReason && (
                          <span className="mt-0.5 block max-w-[180px] truncate text-xs text-muted" title={row.hiddenReason}>
                            {row.hiddenReason}
                          </span>
                        )}
                      </Td>
                      <Td>
                        <Badge tone="outline">{IDENTITY_LABELS[row.identity] ?? row.identity}</Badge>
                      </Td>
                      <Td className="tabular text-right">{formatNumber(row.matches)}</Td>
                      <Td className="tabular text-right">{formatNumber(row.trackers)}</Td>
                      <Td className="whitespace-nowrap text-sm">{formatDate(row.firstSeenAt)}</Td>
                      <Td className="whitespace-nowrap text-sm">
                        <TimeAgo value={row.lastSeenAt} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            <Pagination page={page} totalPages={Number(meta?.totalPages ?? 1)} total={Number(meta?.total ?? data.length)} pageSize={PAGE_SIZE} onChange={next => update({ page: next > 1 ? next : null })} className="border-t border-line" />
          </>
        )}
      </div>

      <JobDialog
        jobId={openId}
        onClose={() => setOpenId(null)}
        onHide={id => setHiding([id])}
        onRestore={id => void apply([id], 'restore')}
        busy={busy}
        refreshKey={data}
      />

      <ReasonDialog
        open={hiding !== null}
        title={hiding && hiding.length === 1 ? 'Hide this job?' : `Hide ${plural(hiding?.length ?? 0, 'job')}?`}
        description="Hidden jobs disappear from every feed, public page and tracker suggestion, and pending alerts for them are cancelled. You can restore them later."
        confirmLabel="Hide"
        label="Reason"
        required
        hint="Recorded in the job history and the audit log."
        placeholder="e.g. Spam posting, duplicate of another job, not a real opening"
        maxLength={300}
        busy={busy === 'hide'}
        onClose={() => setHiding(null)}
        onConfirm={reason => {
          if (hiding) void apply(hiding, 'hide', reason);
        }}
      />
    </>
  );
}

function describeValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value.length > 120 ? `${value.slice(0, 120)}…` : value;
  return JSON.stringify(value).slice(0, 120);
}

function JobDialog({
  jobId,
  onClose,
  onHide,
  onRestore,
  busy,
  refreshKey,
}: {
  jobId: string | null;
  onClose: () => void;
  onHide: (id: string) => void;
  onRestore: (id: string) => void;
  busy: string | null;
  /** Changes when the list reloads, so the open dialog refreshes after hide/restore. */
  refreshKey: unknown;
}) {
  const { data, error, isLoading, mutate } = useApi<JobDetail>(jobId ? `/api/admin/jobs/${jobId}` : null);

  useEffect(() => {
    if (jobId) void mutate();
    // Reload the open job after the list changes (hide/restore).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const job = data?.job;
  const current = job && job.id === jobId ? data : null;

  return (
    <Dialog
      open={jobId !== null}
      onClose={onClose}
      size="xl"
      title={current?.job.title ?? 'Job'}
      description={current ? `${current.source.name}${current.job.location ? ` · ${current.job.location}` : ''}` : undefined}
      footer={
        <>
          {current && isSafeHref(current.job.url) && (
            <LinkButton href={current.job.url} external variant="ghost">
              Open posting
            </LinkButton>
          )}
          {current && (
            <Can permission="jobs.manage">
              {current.job.hiddenAt ? (
                <Button icon={<RotateCcw className="h-4 w-4" />} loading={busy === 'restore'} disabled={busy !== null} onClick={() => onRestore(current.job.id)}>
                  Restore
                </Button>
              ) : (
                <Button icon={<EyeOff className="h-4 w-4" />} disabled={busy !== null} onClick={() => onHide(current.job.id)}>
                  Hide
                </Button>
              )}
            </Can>
          )}
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {error ? (
        <ErrorState description={errorMessage(error)} onRetry={() => mutate()} />
      ) : isLoading || !current ? (
        <div className="space-y-3" role="status" aria-label="Loading the job">
          <Skeleton className="h-16" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <JobStatusBadge job={current.job} />
            <JobFacets workplaceType={current.job.workplaceType} employmentType={current.job.employmentType} seniority={current.job.seniority} />
            <Link href={`/admin/sources/${current.source.id}`} className="text-sm font-medium text-accent hover:text-accent-hover">
              View source
            </Link>
          </div>

          {current.job.hiddenAt && (
            <Callout tone="danger" title={`Hidden ${formatDateTime(current.job.hiddenAt)}`}>
              {current.job.hiddenReason ?? 'No reason recorded.'}
            </Callout>
          )}

          <StatGrid>
            <StatCell label="Matched alerts" value={formatNumber(current.counts.matches)} />
            <StatCell label="In trackers" value={formatNumber(current.counts.trackers)} />
            <StatCell label="Alerts waiting" value={formatNumber(current.counts.pendingAlerts)} />
            <StatCell label="Alerts settled" value={formatNumber(current.counts.sentAlerts)} hint="Sent or cancelled" />
          </StatGrid>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
            <dl className="divide-y divide-line">
              <DetailRow label="Department">{current.job.department ?? '—'}</DetailRow>
              <DetailRow label="Type (as published)">{current.job.jobType ?? '—'}</DetailRow>
              <DetailRow label="Salary">{current.job.salaryText ?? '—'}</DetailRow>
              <DetailRow label="Posted">{current.job.postedAt ? formatDate(current.job.postedAt) : '—'}</DetailRow>
              <DetailRow label="Deadline">{current.job.deadlineAt ? formatDate(current.job.deadlineAt) : '—'}</DetailRow>
              <DetailRow label="First seen">{formatDateTime(current.job.firstSeenAt)}</DetailRow>
              <DetailRow label="Last seen">{formatDateTime(current.job.lastSeenAt)}</DetailRow>
              {current.job.closedAt && <DetailRow label="Closed">{formatDateTime(current.job.closedAt)}</DetailRow>}
              {current.job.reopenedAt && <DetailRow label="Reopened">{formatDateTime(current.job.reopenedAt)}</DetailRow>}
              <DetailRow label="Missed scans">{formatNumber(current.job.missedScrapes)}</DetailRow>
            </dl>
            <dl className="divide-y divide-line">
              <DetailRow label="Identity key">
                <span className="break-all font-mono text-xs">{current.job.fingerprint}</span>
              </DetailRow>
              <DetailRow label="ATS id">{current.job.externalId ? <span className="break-all font-mono text-xs">{current.job.externalId}</span> : '—'}</DetailRow>
              <DetailRow label="Duplicate key">{current.job.dedupeKey ? <span className="break-all font-mono text-xs">{current.job.dedupeKey}</span> : '—'}</DetailRow>
              <DetailRow label="Adapter">{current.source.adapter ?? '—'}</DetailRow>
            </dl>
          </div>

          <section>
            <h3 className="text-base font-semibold text-ink">History</h3>
            {current.events.length === 0 ? (
              <p className="mt-1 text-sm text-muted">No events recorded.</p>
            ) : (
              <ol className="mt-2 space-y-2.5 border-l border-line pl-4">
                {current.events.map(event => (
                  <li key={event.id} className="text-sm">
                    <span className="font-medium text-ink">{JOB_EVENT_LABELS[event.type] ?? event.type}</span>
                    <span className="text-muted"> · {formatDateTime(event.createdAt)}</span>
                    {event.changes && Object.keys(event.changes).length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-muted">
                        {Object.entries(event.changes).map(([field, change]) => (
                          <li key={field} className="break-words">
                            <span className="text-ink">{field}</span>: {describeValue(change?.from)} → {describeValue(change?.to)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section>
            <h3 className="text-base font-semibold text-ink">Description</h3>
            {current.job.description ? (
              <div className="scroll-slim mt-2 max-h-72 overflow-y-auto whitespace-pre-line rounded-md border border-line p-3 text-sm leading-6 text-ink">{current.job.description}</div>
            ) : (
              <p className="mt-1 text-sm text-muted">The source did not provide a description.</p>
            )}
          </section>

          {current.job.rawData !== null && current.job.rawData !== undefined && (
            <details className="rounded-md border border-line">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-ink">Raw data from the source</summary>
              <pre className="scroll-slim max-h-72 overflow-auto border-t border-line bg-sunken/50 p-3 font-mono text-xs text-ink">{JSON.stringify(current.job.rawData, null, 2).slice(0, 20_000)}</pre>
            </details>
          )}
        </div>
      )}
    </Dialog>
  );
}

export default function AdminJobsPage() {
  return (
    <RequirePermission permission="jobs.read">
      <Suspense fallback={<SkeletonRows rows={8} />}>
        <JobsView />
      </Suspense>
    </RequirePermission>
  );
}
