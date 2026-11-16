'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { Download, Filter, ScrollText, X } from 'lucide-react';
import { Can, RequirePermission, SearchInput } from '@/components/admin/bits';
import { FilterSelect, MetadataList, useUrlFilters } from '@/components/admin/ops-bits';
import { useSession } from '@/components/app/session';
import { Button, buttonClass } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { Pagination } from '@/components/ui/overlay';
import { Badge, EmptyState, ErrorState, PageHeader, SkeletonRows } from '@/components/ui/primitives';
import { qs, errorMessage } from '@/lib/client/api';
import { formatDateTime } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';

interface AuditEntry {
  id: string;
  action: string;
  label: string;
  actorEmail: string | null;
  actorRole: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

const TARGET_TYPES: { value: string; label: string }[] = [
  { value: '', label: 'Any target' },
  { value: 'user', label: 'Users' },
  { value: 'source', label: 'Sources' },
  { value: 'job', label: 'Jobs' },
  { value: 'list', label: 'Watchlists' },
  { value: 'task', label: 'Monitoring tasks' },
  { value: 'email', label: 'Email' },
  { value: 'setting', label: 'Settings' },
  { value: 'issue', label: 'Issues' },
  { value: 'audit_log', label: 'Audit log' },
];

const PAGE_SIZE = 50;

/** Dates in the URL are local calendar days; the API wants instants. */
function dayStart(day: string): string | undefined {
  const date = new Date(`${day}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
function dayEnd(day: string): string | undefined {
  const date = new Date(`${day}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function targetHref(type: string | null, id: string | null): string | null {
  if (!type || !id) return null;
  if (type === 'user') return `/admin/users/${id}`;
  if (type === 'source') return `/admin/sources/${id}`;
  if (type === 'setting') return '/admin/settings';
  return null;
}

function AuditView() {
  const { can } = useSession();
  const { params, update } = useUrlFilters();
  const action = params.get('action') ?? '';
  const targetType = params.get('targetType') ?? '';
  const targetId = params.get('targetId') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [actor, setActor] = useState(params.get('actor') ?? '');

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.get('actor') ?? '') !== actor.trim()) update({ actor: actor.trim() || null });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor]);

  const filters = {
    action,
    actor: params.get('actor') ?? '',
    targetType,
    from: from ? dayStart(from) : undefined,
    to: to ? dayEnd(to) : undefined,
  };
  const { data, meta, error, isLoading, mutate } = useApi<AuditEntry[]>(`/api/admin/audit${qs({ ...filters, targetId, page, pageSize: PAGE_SIZE })}`);
  const actions = (meta?.actions ?? []) as { value: string; label: string }[];
  const filtered = Boolean(action || targetType || targetId || from || to || params.get('actor'));

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every administrative and security-relevant action, newest first. Entries cannot be edited or deleted."
        actions={
          <Can permission="data.export">
            <a href={`/api/admin/audit/export${qs({ ...filters, targetId })}`} className={buttonClass('secondary')}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Export CSV
            </a>
          </Can>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <SearchInput value={actor} onChange={setActor} placeholder="Actor email" className="relative block w-full lg:w-60" />
        <FilterSelect
          label="Action"
          value={action}
          onChange={value => update({ action: value || null })}
          options={[{ value: '', label: 'Any action' }, ...actions.map(item => ({ value: item.value, label: item.label }))]}
          className="lg:w-64"
        />
        <FilterSelect label="Target type" value={targetType} onChange={value => update({ targetType: value || null })} options={TARGET_TYPES} className="lg:w-44" />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted">
            From
            <Input type="date" value={from} max={to || undefined} onChange={event => update({ from: event.target.value || null })} className="w-40" />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            to
            <Input type="date" value={to} min={from || undefined} onChange={event => update({ to: event.target.value || null })} className="w-40" />
          </label>
        </div>
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            icon={<X className="h-3.5 w-3.5" />}
            onClick={() => {
              setActor('');
              update({ action: null, actor: null, targetType: null, targetId: null, from: null, to: null });
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {targetId && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
          Showing entries for {targetType || 'target'} <span className="font-mono text-ink">{targetId}</span>
          <button type="button" className="text-accent hover:text-accent-hover" onClick={() => update({ targetId: null })}>
            Show all targets
          </button>
        </p>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface">
        {error ? (
          <ErrorState description={errorMessage(error)} onRetry={() => mutate()} />
        ) : isLoading ? (
          <SkeletonRows rows={8} />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={<ScrollText />} title={filtered ? 'No entries match these filters' : 'Nothing has been recorded yet'} />
        ) : (
          <>
            <ol className="divide-y divide-line">
              {data.map(entry => {
                const href = targetHref(entry.targetType, entry.targetId);
                const hasMetadata = entry.metadata && Object.keys(entry.metadata).length > 0;
                return (
                  <li key={entry.id} className="grid gap-2 px-4 py-3.5 sm:px-5 lg:grid-cols-[11rem_minmax(0,1fr)]">
                    <time dateTime={entry.createdAt} className="tabular text-sm text-muted">
                      {formatDateTime(entry.createdAt)}
                    </time>
                    <div className="min-w-0 space-y-1.5">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium text-ink">{entry.label}</span>
                        <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-2xs text-muted">{entry.action}</code>
                      </p>
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                        <span>
                          By <span className="text-ink">{entry.actorEmail ?? 'System'}</span>
                          {entry.actorRole && <Badge tone="outline" className="ml-1.5">{entry.actorRole}</Badge>}
                        </span>
                        {entry.targetType && (
                          <span className="inline-flex flex-wrap items-center gap-1">
                            Target: {entry.targetType}
                            {entry.targetId &&
                              (href && (entry.targetType !== 'user' || can('users.read')) ? (
                                <Link href={href} className="font-mono text-xs text-accent hover:text-accent-hover">
                                  {entry.targetId}
                                </Link>
                              ) : (
                                <span className="font-mono text-xs text-ink">{entry.targetId}</span>
                              ))}
                            {entry.targetId && entry.targetId !== targetId && (
                              <button
                                type="button"
                                aria-label="Show only entries for this target"
                                title="Show only entries for this target"
                                onClick={() => update({ targetType: entry.targetType, targetId: entry.targetId })}
                                className="rounded p-0.5 text-subtle hover:bg-sunken hover:text-ink"
                              >
                                <Filter className="h-3 w-3" aria-hidden="true" />
                              </button>
                            )}
                          </span>
                        )}
                        {entry.ipAddress && <span>IP {entry.ipAddress}</span>}
                      </p>
                      {hasMetadata && (
                        <div className="rounded-md bg-sunken/50 px-3 py-2">
                          <MetadataList data={entry.metadata} />
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            <Pagination page={page} totalPages={Number(meta?.totalPages ?? 1)} total={Number(meta?.total ?? 0)} pageSize={PAGE_SIZE} onChange={next => update({ page: next })} className="border-t border-line" />
          </>
        )}
      </div>
    </>
  );
}

export default function AdminAuditPage() {
  return (
    <RequirePermission permission="audit.read">
      <Suspense fallback={<SkeletonRows rows={8} />}>
        <AuditView />
      </Suspense>
    </RequirePermission>
  );
}
