'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSWRConfig } from 'swr';
import { CircleAlert, CircleCheck, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Dialog } from '@/components/ui/overlay';
import { Callout } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, errorMessage } from '@/lib/client/api';
import { plural } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';

interface ListSummary {
  id: string;
  name: string;
  relation: string;
}

type Preview =
  | { ok: true; url: string; adapterLabel: string; companyName: string | null; jobCount: number; partial: boolean; sample: { title: string; location: string | null }[] }
  | { ok: false; url: string; label: string; hint: string };

/** Refreshes every cached view that shows companies or jobs. */
export function useRevalidateWorkspace() {
  const { mutate } = useSWRConfig();
  return () => mutate(key => typeof key === 'string' && /^\/api\/(lists|companies|jobs|me\/overview|tracker)/.test(key));
}

export function AddCompanyDialog({
  open,
  onClose,
  defaultListId,
  defaultUrl,
  defaultName,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  defaultListId?: string;
  /** Prefills the form, e.g. when adding a known company to another watchlist. */
  defaultUrl?: string;
  defaultName?: string;
  onAdded?: (listId: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const revalidate = useRevalidateWorkspace();
  const { data: lists, mutate: refreshLists } = useApi<ListSummary[]>(open ? '/api/lists' : null);
  const editable = (lists ?? []).filter(list => list.relation !== 'follower');

  const [url, setUrl] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [listId, setListId] = useState(defaultListId ?? '');
  const [newListName, setNewListName] = useState('My companies');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setUrl(defaultUrl ?? '');
    setCompanyName(defaultName ?? '');
    setPreview(null);
    setError(null);
    setListId(defaultListId ?? '');
  }, [open, defaultListId, defaultUrl, defaultName]);

  useEffect(() => {
    if (!listId && editable.length > 0) setListId(editable[0].id);
  }, [editable, listId]);

  const check = async () => {
    if (!url.trim()) return;
    setChecking(true);
    setError(null);
    try {
      const result = await api<Preview>('/api/companies/preview', { body: { url } });
      setPreview(result);
      if (result.ok && result.companyName && !companyName) setCompanyName(result.companyName);
    } catch (err) {
      setPreview(null);
      setError(err instanceof ApiClientError ? (err.fieldErrors.url ?? err.message) : errorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const add = async () => {
    setSaving(true);
    setError(null);
    try {
      let target = listId;
      if (!target) {
        const created = await api<{ id: string }>('/api/lists', { body: { name: newListName.trim() || 'My companies' } });
        target = created.id;
        await refreshLists();
      }
      const added = await api<{ name: string }>(`/api/lists/${target}/companies`, { body: { url, companyName: companyName.trim() || null } });
      await revalidate();
      toast.info(`Added ${added.name}`, 'Its jobs will appear within a few minutes.', { label: 'Open watchlist', onClick: () => router.push(`/dashboard/watchlists/${target}`) });
      onAdded?.(target);
      onClose();
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
      title="Add a company"
      description="Paste the company's careers page or job-board link."
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} disabled={!url.trim()} onClick={add}>
            Add company
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Careers page link" hint="For example jobs.lever.co/company, boards.greenhouse.io/company or company.com/careers">
          {ids => (
            <div className="flex gap-2">
              <Input
                {...ids}
                value={url}
                onChange={event => {
                  setUrl(event.target.value);
                  setPreview(null);
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void check();
                  }
                }}
                placeholder="https://"
                autoFocus
                inputMode="url"
              />
              <Button onClick={check} loading={checking} disabled={!url.trim()} icon={<Search className="h-4 w-4" />}>
                Check
              </Button>
            </div>
          )}
        </Field>

        {preview &&
          (preview.ok ? (
            <div className="rounded-md border border-success/25 bg-success-soft px-3.5 py-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium text-ink">
                <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" />
                {preview.adapterLabel}: {preview.partial ? `at least ${plural(preview.jobCount, 'open job')}` : plural(preview.jobCount, 'open job')}
              </p>
              {preview.sample.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-muted">
                  {preview.sample.map((job, index) => (
                    <li key={index} className="truncate">
                      {job.title}
                      {job.location ? ` · ${job.location}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {preview.jobCount === 0 && <p className="mt-1 text-muted">No open jobs right now. You will be alerted when one is posted.</p>}
            </div>
          ) : (
            <div className="rounded-md border border-warning/25 bg-warning-soft px-3.5 py-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium text-ink">
                <CircleAlert className="h-4 w-4 text-warning" aria-hidden="true" />
                {preview.label}
              </p>
              <p className="mt-1 text-muted">{preview.hint} You can still add it; JobPingly will keep trying.</p>
            </div>
          ))}

        <Field label="Company name" optional hint="Detected automatically when possible.">
          {ids => <Input {...ids} value={companyName} onChange={event => setCompanyName(event.target.value)} maxLength={120} />}
        </Field>

        {lists && editable.length === 0 ? (
          <Field label="New watchlist" hint="You do not have a watchlist yet, so one will be created.">
            {ids => <Input {...ids} value={newListName} onChange={event => setNewListName(event.target.value)} maxLength={80} />}
          </Field>
        ) : (
          <Field label="Watchlist">
            {ids => (
              <Select {...ids} value={listId} onChange={event => setListId(event.target.value)}>
                {editable.map(list => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Dialog>
  );
}
