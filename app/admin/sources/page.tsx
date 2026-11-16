'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Globe, Pause, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Can, RequirePermission, SearchInput, SourceStatusBadge, nextSearch } from '@/components/admin/bits';
import { BulkBar, ExtractionTestResult, ReasonDialog, SelectBox, shortUrl, useSelection, type ExtractionTest } from '@/components/admin/monitoring-bits';
import { TimeAgo } from '@/components/app/bits';
import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Dialog, Pagination, Tabs, useConfirm } from '@/components/ui/overlay';
import { Badge, Callout, EmptyState, ErrorState, PageHeader, SkeletonRows, Table, TableWrap, Td, Th, Tr } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, errorMessage, qs } from '@/lib/client/api';
import { cn } from '@/lib/client/cn';
import { formatNumber, plural } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';

interface SourceRow {
  id: string;
  url: string;
  name: string;
  adapter: string | null;
  adapterLabel: string;
  adapterOverride: string | null;
  status: string;
  pausedReason: string | null;
  priority: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  nextCheckAt: string | null;
  consecutiveFailures: number;
  lastErrorClass: string | null;
  errorLabel: string | null;
  openJobs: number;
  lists: number;
  followers: number;
  activeTask: string | null;
}

type StatusFilter = 'all' | 'active' | 'degraded' | 'broken' | 'paused' | 'pending' | 'unwatched';
const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Healthy' },
  { value: 'pending', label: 'Never scanned' },
  { value: 'degraded', label: 'Degraded' },
  { value: 'broken', label: 'Broken' },
  { value: 'paused', label: 'Paused' },
  { value: 'unwatched', label: 'On no watchlist' },
];

const SORTS = [
  { value: 'name', label: 'Name' },
  { value: 'newest', label: 'Newest first' },
  { value: 'failures', label: 'Most failures' },
  { value: 'jobs', label: 'Most open jobs' },
  { value: 'last_success', label: 'Last successful scan' },
  { value: 'next_check', label: 'Next check' },
];

const PAGE_SIZE = 50;

type AdapterOption = { id: string; label: string; kind: string };

function SourcesView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const { can } = useSession();
  const { confirm, element: confirmElement } = useConfirm();

  const statusParam = params.get('status') as StatusFilter | null;
  const status: StatusFilter = STATUS_TABS.some(tab => tab.value === statusParam) ? statusParam! : 'all';
  const adapter = params.get('adapter') ?? '';
  const sort = SORTS.some(item => item.value === params.get('sort')) ? params.get('sort')! : 'name';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [adding, setAdding] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const update = (changes: Record<string, string | number | null>) => router.replace(`${pathname}${nextSearch(params, changes)}`, { scroll: false });

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.get('q') ?? '') !== search.trim()) update({ q: search.trim() || null });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const query = qs({ q: params.get('q') ?? '', status, adapter, sort, page, pageSize: PAGE_SIZE });
  const { data, meta, error, isLoading, isRefreshing, mutate } = useApi<SourceRow[]>(`/api/admin/sources${query}`, { refreshInterval: 60_000 });
  const counts = meta?.counts as Record<StatusFilter, number> | undefined;
  const adapters = (meta?.adapters as AdapterOption[] | undefined) ?? [];
  const selection = useSelection((data ?? []).map(row => row.id));

  const bulk = async (action: 'scan' | 'force_scan' | 'pause' | 'resume' | 'delete', extra: Record<string, unknown> = {}) => {
    setBusy(action);
    try {
      const result = await api<{ queued?: number; alreadyQueued?: number; updated?: number; deleted?: number }>('/api/admin/sources/bulk', { body: { ids: selection.ids, action, ...extra } });
      if (action === 'scan' || action === 'force_scan') {
        toast.success(`${plural(result.queued ?? 0, 'scan')} queued`, result.alreadyQueued ? `${plural(result.alreadyQueued, 'source was', 'sources were')} already queued.` : undefined);
      } else if (action === 'delete') {
        toast.success(`${plural(result.deleted ?? 0, 'source')} deleted`);
      } else {
        toast.success(`${plural(result.updated ?? 0, 'source')} ${action === 'pause' ? 'paused' : 'resumed'}`);
      }
      selection.clear();
      await mutate();
    } catch (err) {
      toast.error('The bulk action failed', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const bulkDelete = async () => {
    const count = selection.count;
    const ok = await confirm({
      title: `Delete ${plural(count, 'source')}?`,
      description: 'This permanently deletes the sources, every job found on them and their scan history, and removes them from every watchlist. It cannot be undone.',
      confirmLabel: 'Delete permanently',
      tone: 'danger',
      typeToConfirm: `delete ${count}`,
    });
    if (ok) await bulk('delete', { confirm: true });
  };

  const tabOptions = STATUS_TABS.map(tab => ({ ...tab, count: counts ? counts[tab.value] : null }));

  return (
    <>
      <PageHeader
        title="Sources"
        description="Every careers page JobPingly monitors. A source is checked once, however many watchlists include it."
        actions={
          <Can permission="sources.manage">
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
              Add source
            </Button>
          </Can>
        }
      />

      <Tabs label="Filter by status" value={status} onChange={value => update({ status: value === 'all' ? null : value })} options={tabOptions} />

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by company or URL" className="relative w-full md:max-w-xs" />
        <label className="md:w-56">
          <span className="sr-only">Adapter</span>
          <Select value={adapter} onChange={event => update({ adapter: event.target.value || null })}>
            <option value="">All adapters</option>
            <option value="unknown">Not detected yet</option>
            {adapters.map(option => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="md:w-56">
          <span className="sr-only">Sort</span>
          <Select value={sort} onChange={event => update({ sort: event.target.value === 'name' ? null : event.target.value })}>
            {SORTS.map(option => (
              <option key={option.value} value={option.value}>
                Sort: {option.label}
              </option>
            ))}
          </Select>
        </label>
        {isRefreshing && <span className="text-sm text-muted">Updating…</span>}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface">
        {can('sources.manage') && (
          <BulkBar count={selection.count} noun={['source', 'sources']} onClear={selection.clear}>
            <Button size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={busy === 'scan'} disabled={busy !== null} onClick={() => bulk('scan')}>
              Scan now
            </Button>
            <Button size="sm" loading={busy === 'force_scan'} disabled={busy !== null} onClick={() => bulk('force_scan')} title="Ignore the 'unchanged page' shortcut and re-read every job">
              Full rescan
            </Button>
            <Button size="sm" icon={<Pause className="h-3.5 w-3.5" />} disabled={busy !== null} onClick={() => setPausing(true)}>
              Pause
            </Button>
            <Button size="sm" icon={<Play className="h-3.5 w-3.5" />} loading={busy === 'resume'} disabled={busy !== null} onClick={() => bulk('resume')}>
              Resume
            </Button>
            <Can permission="sources.delete">
              <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} loading={busy === 'delete'} disabled={busy !== null} onClick={bulkDelete}>
                Delete
              </Button>
            </Can>
          </BulkBar>
        )}

        {error ? (
          <ErrorState description={errorMessage(error)} onRetry={() => mutate()} />
        ) : isLoading ? (
          <SkeletonRows rows={8} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={<Globe />}
            title={params.get('q') || adapter || status !== 'all' ? 'No sources match these filters' : 'No sources yet'}
            description={params.get('q') || adapter || status !== 'all' ? 'Try another filter or clear the search.' : 'Sources are created when people add companies to their watchlists, or when you add one here.'}
          />
        ) : (
          <>
            <TableWrap>
              <Table className="min-w-[1080px]">
                <thead>
                  <tr>
                    {can('sources.manage') && (
                      <Th className="w-10">
                        <SelectBox checked={selection.allSelected} indeterminate={selection.someSelected} onChange={selection.toggleAll} label="Select all sources on this page" />
                      </Th>
                    )}
                    <Th>Source</Th>
                    <Th>Status</Th>
                    <Th>Adapter</Th>
                    <Th className="text-right">Open jobs</Th>
                    <Th className="text-right">Watchlists</Th>
                    <Th className="text-right">Failures</Th>
                    <Th>Last success</Th>
                    <Th>Next check</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(row => {
                    const pending = !row.lastSuccessAt && row.status !== 'paused';
                    return (
                      <Tr key={row.id} className={cn(selection.has(row.id) && 'bg-accent-soft/40')}>
                        {can('sources.manage') && (
                          <Td>
                            <SelectBox checked={selection.has(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.name}`} />
                          </Td>
                        )}
                        <Td className="max-w-[320px]">
                          <Link href={`/admin/sources/${row.id}`} className="block truncate font-medium text-ink hover:text-accent">
                            {row.name}
                          </Link>
                          <span className="block truncate text-sm text-muted" title={row.url}>
                            {shortUrl(row.url)}
                          </span>
                        </Td>
                        <Td>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <SourceStatusBadge status={row.status} pending={pending && row.status === 'active'} />
                            {row.activeTask && <Badge tone="accent">{row.activeTask === 'running' ? 'Scanning' : 'Queued'}</Badge>}
                          </div>
                          {(row.errorLabel && row.status !== 'active') || row.pausedReason ? (
                            <span className="mt-0.5 block max-w-[220px] truncate text-xs text-muted" title={row.pausedReason ?? row.errorLabel ?? undefined}>
                              {row.status === 'paused' ? row.pausedReason : row.errorLabel}
                            </span>
                          ) : null}
                        </Td>
                        <Td className="text-sm">
                          {row.adapterLabel}
                          {row.adapterOverride && (
                            <Badge tone="outline" className="ml-1.5" title={`Forced to ${row.adapterOverride}`}>
                              Forced
                            </Badge>
                          )}
                        </Td>
                        <Td className="tabular text-right">
                          <Link href={`/admin/jobs?source=${row.id}`} className="hover:text-accent">
                            {formatNumber(row.openJobs)}
                          </Link>
                        </Td>
                        <Td className="tabular text-right" title={`${plural(row.followers, 'person', 'people')} subscribed`}>
                          {formatNumber(row.lists)}
                        </Td>
                        <Td className={row.consecutiveFailures > 0 ? 'tabular text-right font-medium text-danger' : 'tabular text-right'}>{formatNumber(row.consecutiveFailures)}</Td>
                        <Td className="whitespace-nowrap text-sm">
                          <TimeAgo value={row.lastSuccessAt} />
                        </Td>
                        <Td className="whitespace-nowrap text-sm">{row.status === 'paused' ? <span className="text-muted">Paused</span> : <TimeAgo value={row.nextCheckAt} />}</Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
            <Pagination page={page} totalPages={Number(meta?.totalPages ?? 1)} total={Number(meta?.total ?? data.length)} pageSize={PAGE_SIZE} onChange={next => update({ page: next > 1 ? next : null })} className="border-t border-line" />
          </>
        )}
      </div>

      <AddSourceDialog open={adding} adapters={adapters} onClose={() => setAdding(false)} onCreated={id => router.push(`/admin/sources/${id}`)} />
      <ReasonDialog
        open={pausing}
        title={selection.count === 1 ? 'Pause this source?' : `Pause ${plural(selection.count, 'source')}?`}
        description="Paused sources are not checked until they are resumed. Their open jobs stay visible."
        confirmLabel="Pause"
        hint="Shown on the source and recorded in the audit log."
        placeholder="e.g. Site is being rebuilt; check again next week"
        maxLength={200}
        busy={busy === 'pause'}
        onClose={() => setPausing(false)}
        onConfirm={async reason => {
          await bulk('pause', { reason: reason || undefined });
          setPausing(false);
        }}
      />
      {confirmElement}
    </>
  );
}

function AddSourceDialog({ open, adapters, onClose, onCreated }: { open: boolean; adapters: AdapterOption[]; onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [adapter, setAdapter] = useState('');
  const [result, setResult] = useState<ExtractionTest | null>(null);
  const [testedKey, setTestedKey] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from a clean form each time the dialog opens (adjusted during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setUrl('');
      setCompanyName('');
      setAdapter('');
      setResult(null);
      setTestedKey(null);
      setError(null);
    }
  }

  const key = `${url.trim()}|${adapter}`;

  const test = async () => {
    setTesting(true);
    setError(null);
    try {
      const response = await api<ExtractionTest>('/api/admin/sources/test', { body: { url: url.trim(), adapter: adapter || null } });
      setResult(response);
      setTestedKey(key);
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiClientError ? (err.fieldErrors.url ?? err.fieldErrors.adapter ?? err.message) : errorMessage(err));
    } finally {
      setTesting(false);
    }
  };

  const create = async () => {
    setSaving(true);
    setError(null);
    try {
      const created = await api<{ id: string }>('/api/admin/sources', { body: { url: url.trim(), companyName: companyName.trim() || null, scanNow: true } });
      if (adapter) await api(`/api/admin/sources/${created.id}`, { method: 'PATCH', body: { adapterOverride: adapter } });
      toast.success('Source saved', 'A first scan has been queued.');
      onClose();
      onCreated(created.id);
    } catch (err) {
      setError(err instanceof ApiClientError ? (err.fieldErrors.url ?? err.message) : errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={saving}
      size="lg"
      title="Add a source"
      description="Test the careers page first to see what JobPingly will find. Nothing is saved until you add it."
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={test} loading={testing} disabled={!url.trim() || saving}>
            {testedKey === key ? 'Test again' : 'Test'}
          </Button>
          <Button variant="primary" loading={saving} disabled={testedKey !== key || testing} onClick={create}>
            Add source
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Careers page URL">
          {ids => (
            <Input
              {...ids}
              value={url}
              inputMode="url"
              placeholder="https://"
              autoFocus
              onChange={event => setUrl(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && url.trim()) {
                  event.preventDefault();
                  void test();
                }
              }}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" optional hint="Detected automatically when possible.">
            {ids => <Input {...ids} value={companyName} maxLength={120} onChange={event => setCompanyName(event.target.value)} />}
          </Field>
          <Field label="Adapter" hint="Leave on auto-detect unless detection picks the wrong one.">
            {ids => (
              <Select {...ids} value={adapter} onChange={event => setAdapter(event.target.value)}>
                <option value="">Auto-detect</option>
                {adapters.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {error && <Callout tone="danger">{error}</Callout>}
        {result && testedKey === key && <ExtractionTestResult result={result} />}
        {result && testedKey !== key && <p className="text-sm text-muted">The URL or adapter changed since the last test. Test again before adding.</p>}
      </div>
    </Dialog>
  );
}

export default function AdminSourcesPage() {
  return (
    <RequirePermission permission="sources.read">
      <Suspense fallback={<SkeletonRows rows={8} />}>
        <SourcesView />
      </Suspense>
    </RequirePermission>
  );
}
