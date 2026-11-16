'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Building2, Download, Ellipsis, Pause, Pencil, Play, Plus, RefreshCw, Search, Trash2, Upload } from 'lucide-react';
import { AddCompanyDialog, useRevalidateWorkspace } from '@/components/app/add-company-dialog';
import { CompanyAvatar, HealthStatus, TimeAgo } from '@/components/app/bits';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Dialog, Dropdown, useConfirm } from '@/components/ui/overlay';
import { Badge, Callout, EmptyState, ErrorState, SkeletonRows } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, errorMessage } from '@/lib/client/api';
import { formatNumber, plural } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';
import type { ListCompany, ListDetail } from './types';

export function CompaniesTab({ detail, onChanged }: { detail: ListDetail; onChanged: () => void }) {
  const toast = useToast();
  const revalidate = useRevalidateWorkspace();
  const { confirm, element: confirmElement } = useConfirm();
  const listId = detail.list.id;
  const canEdit = detail.access.canEditCompanies;
  const { data, error, isLoading, mutate } = useApi<ListCompany[]>(`/api/lists/${listId}/companies`, { refreshInterval: 90_000 });
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<ListCompany | null>(null);

  const companies = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? []).filter(company => !term || company.name.toLowerCase().includes(term) || company.url.toLowerCase().includes(term) || (company.category ?? '').toLowerCase().includes(term));
  }, [data, search]);

  const refresh = async () => {
    await mutate();
    onChanged();
    void revalidate();
  };

  const rescan = async (company: ListCompany) => {
    try {
      const result = await api<{ alreadyQueued: boolean }>(`/api/companies/${company.id}/rescan`, { method: 'POST', body: {} });
      toast.success(result.alreadyQueued ? `${company.name} is already queued for a check` : `Checking ${company.name} now`, 'Results appear within a few minutes.');
      await mutate();
    } catch (err) {
      toast.error('Could not start a check', errorMessage(err));
    }
  };

  const togglePause = async (company: ListCompany) => {
    try {
      await api(`/api/lists/${listId}/companies/${company.id}`, { method: 'PATCH', body: { isPaused: !company.isPaused } });
      toast.success(company.isPaused ? `Resumed ${company.name}` : `Paused ${company.name} on this watchlist`);
      await refresh();
    } catch (err) {
      toast.error('Could not update', errorMessage(err));
    }
  };

  const remove = async (company: ListCompany) => {
    const ok = await confirm({
      title: `Remove ${company.name}?`,
      description: 'Its jobs will no longer appear for this watchlist and pending alerts for it are cancelled.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/lists/${listId}/companies/${company.id}`, { method: 'DELETE' });
      toast.success(`Removed ${company.name}`);
      await refresh();
    } catch (err) {
      toast.error('Could not remove', errorMessage(err));
    }
  };

  const limit = detail.limits.companiesPerList;

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative w-full max-w-sm">
          <span className="sr-only">Search companies</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search companies" className="pl-9" />
        </label>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/lists/${listId}/export`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3.5 text-base font-medium text-ink shadow-xs hover:bg-sunken">
            <Download className="h-4 w-4" aria-hidden="true" /> Export
          </a>
          {canEdit && (
            <>
              <Button icon={<Upload className="h-4 w-4" />} onClick={() => setImporting(true)}>
                Import
              </Button>
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
                Add company
              </Button>
            </>
          )}
        </div>
      </div>

      {limit !== null && data && data.length >= limit * 0.8 && (
        <Callout tone={data.length >= limit ? 'warning' : 'neutral'} className="mt-4">
          {data.length} of {limit} companies used on this watchlist.
        </Callout>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface">
        {error ? (
          <ErrorState description="Companies could not be loaded." onRetry={() => mutate()} />
        ) : isLoading ? (
          <SkeletonRows rows={5} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={<Building2 />}
            title="No companies yet"
            description={canEdit ? 'Add the careers pages of companies you want to work for.' : 'The owner has not added any companies yet.'}
            action={
              canEdit ? (
                <Button variant="primary" onClick={() => setAdding(true)}>
                  Add a company
                </Button>
              ) : undefined
            }
          />
        ) : companies.length === 0 ? (
          <EmptyState title="No companies match your search" />
        ) : (
          <ul className="divide-y divide-line">
            {companies.map(company => (
              <li key={company.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <CompanyAvatar name={company.name} logoUrl={company.logoUrl} className="mt-0.5" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/dashboard/companies/${company.id}`} className="text-base font-medium text-ink hover:text-accent">
                        {company.name}
                      </Link>
                      {company.category && <Badge tone="outline">{company.category}</Badge>}
                      {company.isPaused && <Badge>Paused here</Badge>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <HealthStatus health={company.health} />
                      {company.issue && company.health !== 'active' && <span className="text-sm text-muted">{company.issue.label}</span>}
                    </div>
                  </div>
                </div>
                <dl className="flex shrink-0 gap-6 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Open jobs</dt>
                    <dd className="tabular font-medium text-ink">
                      <Link href={`/dashboard/jobs?view=all&company=${company.id}`} className="hover:text-accent">
                        {formatNumber(company.openJobs)}
                      </Link>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">New this week</dt>
                    <dd className="tabular font-medium text-ink">{formatNumber(company.newThisWeek)}</dd>
                  </div>
                  <div className="w-24">
                    <dt className="text-xs text-muted">Last checked</dt>
                    <dd className="text-ink">
                      <TimeAgo value={company.lastSuccessAt} />
                    </dd>
                  </div>
                </dl>
                {canEdit && (
                  <Dropdown
                    label={`Actions for ${company.name}`}
                    triggerClassName="flex h-8 w-8 shrink-0 items-center justify-center self-end rounded-md text-muted hover:bg-sunken hover:text-ink sm:self-auto"
                    trigger={<Ellipsis className="h-4 w-4" aria-hidden="true" />}
                    items={[
                      { label: 'Check now', icon: <RefreshCw />, onSelect: () => rescan(company) },
                      { label: 'Change link or category', icon: <Pencil />, onSelect: () => setEditing(company) },
                      { label: company.isPaused ? 'Resume on this list' : 'Pause on this list', icon: company.isPaused ? <Play /> : <Pause />, onSelect: () => togglePause(company) },
                      { label: 'Remove from watchlist', icon: <Trash2 />, tone: 'danger', onSelect: () => remove(company), separator: true },
                    ]}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {data && data.length > 0 && <p className="mt-2 text-sm text-muted">{plural(data.length, 'company', 'companies')}</p>}

      <AddCompanyDialog open={adding} onClose={() => setAdding(false)} defaultListId={listId} onAdded={() => refresh()} />
      <ImportDialog open={importing} listId={listId} onClose={() => setImporting(false)} onDone={refresh} />
      <EditCompanyDialog listId={listId} company={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      {confirmElement}
    </>
  );
}

function ImportDialog({ open, listId, onClose, onDone }: { open: boolean; listId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: { name: string }[]; skipped: { url: string; reason: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ added: { name: string }[]; skipped: { url: string; reason: string }[] }>(`/api/lists/${listId}/companies/import`, { body: { text } });
      setResult(response);
      if (response.added.length > 0) {
        toast.success(`Added ${plural(response.added.length, 'company', 'companies')}`);
        onDone();
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? (err.fieldErrors.text ?? err.message) : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setText('');
    setResult(null);
    setError(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      busy={busy}
      size="lg"
      title="Import companies"
      description="Paste one careers page link per line. CSV rows of “link, company name, category” work too, including a file exported from another watchlist."
      footer={
        result ? (
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={!text.trim()} onClick={run}>
              Import
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-4 text-sm">
          <p className="text-base text-ink">
            {plural(result.added.length, 'company', 'companies')} added
            {result.skipped.length > 0 ? `, ${result.skipped.length} skipped` : ''}.
          </p>
          {result.skipped.length > 0 && (
            <ul className="max-h-60 space-y-2 overflow-y-auto rounded-md border border-line p-3">
              {result.skipped.map(item => (
                <li key={item.url}>
                  <span className="font-medium text-ink">{item.url}</span>
                  <span className="block text-muted">{item.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Links" error={error}>
            {ids => (
              <Textarea
                {...ids}
                rows={10}
                value={text}
                onChange={event => setText(event.target.value)}
                className="font-mono text-sm"
                placeholder={'https://jobs.lever.co/company-one\nboards.greenhouse.io/company-two, Company Two, Fintech\ncompany-three.com/careers'}
              />
            )}
          </Field>
          <p className="text-sm text-muted">Up to 200 at a time. Each link is checked like a single add; anything that cannot be added is listed with the reason.</p>
        </div>
      )}
    </Dialog>
  );
}

function EditCompanyDialog({ listId, company, onClose, onSaved }: { listId: string; company: ListCompany | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ url: '', category: '', notes: '' });
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (company && loadedFor !== company.id) {
    setLoadedFor(company.id);
    setForm({ url: company.url, category: company.category ?? '', notes: company.notes ?? '' });
    setError(null);
  }

  const save = async () => {
    if (!company) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/lists/${listId}/companies/${company.id}`, {
        method: 'PATCH',
        body: { ...(form.url.trim() !== company.url ? { url: form.url.trim() } : {}), category: form.category || null, notes: form.notes || null },
      });
      toast.success('Saved');
      onSaved();
      setLoadedFor(null);
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? (err.fieldErrors.url ?? err.message) : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={company !== null}
      onClose={() => {
        setLoadedFor(null);
        onClose();
      }}
      busy={busy}
      title={company ? `Edit ${company.name}` : ''}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Careers page link" hint="Changing the link only affects this watchlist. Use the company's job-board link if the current one is failing." error={error}>
          {ids => <Input {...ids} value={form.url} onChange={event => setForm({ ...form, url: event.target.value })} />}
        </Field>
        <Field label="Category" optional hint="Your own label, such as 'Dream companies' or 'Fintech'.">
          {ids => <Input {...ids} value={form.category} maxLength={60} onChange={event => setForm({ ...form, category: event.target.value })} />}
        </Field>
        <Field label="Notes" optional>
          {ids => <Textarea {...ids} rows={3} value={form.notes} maxLength={500} onChange={event => setForm({ ...form, notes: event.target.value })} />}
        </Field>
      </div>
    </Dialog>
  );
}
