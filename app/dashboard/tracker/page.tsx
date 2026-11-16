'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { BellRing, Download, ExternalLink, Plus, SquareKanban, Trash2 } from 'lucide-react';
import { Button, IconButton, buttonClass } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Dialog, Segmented, useConfirm } from '@/components/ui/overlay';
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, errorMessage } from '@/lib/client/api';
import { cn } from '@/lib/client/cn';
import { formatDate, formatRelative, toLocalInputValue } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';
import { TRACKER_STATUSES, USER_JOB_STATUS_LABELS, type UserJobStatus } from '@/lib/constants';
import { isSafeHref } from '@/lib/security/ssrf-client';

interface Entry {
  id: string;
  jobId: string | null;
  status: UserJobStatus;
  notes: string | null;
  appliedAt: string | null;
  reminderAt: string | null;
  updatedAt: string;
  title: string;
  companyName: string;
  url: string | null;
  location: string | null;
  external: boolean;
  postingStatus: string;
}

const COLUMNS: { id: string; label: string; statuses: UserJobStatus[] }[] = [
  { id: 'saved', label: 'Saved', statuses: ['saved'] },
  { id: 'applied', label: 'Applied', statuses: ['applied'] },
  { id: 'interviewing', label: 'Interviewing', statuses: ['interviewing'] },
  { id: 'offer', label: 'Offer', statuses: ['offer'] },
  { id: 'closed', label: 'Closed', statuses: ['rejected', 'withdrawn'] },
];

export default function TrackerPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <TrackerView />
    </Suspense>
  );
}

function TrackerView() {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { confirm, element: confirmElement } = useConfirm();
  const { data, error, isLoading, mutate } = useApi<Entry[]>('/api/tracker');
  const [layout, setLayout] = useState<'board' | 'list'>('board');
  const [editing, setEditing] = useState<Entry | null>(null);
  const [adding, setAdding] = useState(false);

  // Reminder notifications link to ?focus=<entry id>: that entry's notes open first.
  const focus = params.get('focus');
  const focused = focus ? (data?.find(item => item.id === focus) ?? null) : null;
  const notesEntry = editing ?? focused;
  const closeNotes = () => {
    setEditing(null);
    if (focus) router.replace(pathname, { scroll: false });
  };

  const grouped = useMemo(() => {
    const map = new Map(COLUMNS.map(column => [column.id, [] as Entry[]]));
    for (const entry of data ?? []) {
      const column = COLUMNS.find(item => item.statuses.includes(entry.status));
      map.get(column?.id ?? 'saved')!.push(entry);
    }
    return map;
  }, [data]);

  const move = async (entry: Entry, status: UserJobStatus) => {
    try {
      await mutate(
        async current => {
          await api(`/api/tracker/${entry.id}`, { method: 'PATCH', body: { status } });
          return current;
        },
        { optimisticData: current => (current ? { ...current, data: current.data.map(item => (item.id === entry.id ? { ...item, status } : item)) } : current!), revalidate: true },
      );
    } catch (err) {
      toast.error('Could not move the job', errorMessage(err));
    }
  };

  const remove = async (entry: Entry) => {
    if (!(await confirm({ title: 'Remove from tracker?', description: `“${entry.title}” and your notes for it will be removed.`, confirmLabel: 'Remove', tone: 'danger' }))) return;
    try {
      await api(`/api/tracker/${entry.id}`, { method: 'DELETE' });
      await mutate();
      toast.success('Removed');
    } catch (err) {
      toast.error('Could not remove', errorMessage(err));
    }
  };

  const card = (entry: Entry) => (
    <article key={entry.id} className="rounded-md border border-line bg-surface p-3 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {entry.jobId ? (
            <Link href={`/dashboard/jobs/${entry.jobId}`} className="text-base font-medium text-ink hover:text-accent">
              {entry.title}
            </Link>
          ) : (
            <span className="text-base font-medium text-ink">{entry.title}</span>
          )}
          <p className="truncate text-sm text-muted">
            {entry.companyName}
            {entry.location ? ` · ${entry.location}` : ''}
          </p>
        </div>
        {isSafeHref(entry.url) && (
          <a href={entry.url!} target="_blank" rel="noopener noreferrer" aria-label="Open the posting" className="shrink-0 rounded p-1 text-subtle hover:bg-sunken hover:text-ink">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {entry.postingStatus === 'closed' && <Badge>Posting closed</Badge>}
        {entry.postingStatus === 'removed' && <Badge>No longer listed</Badge>}
        {entry.external && <Badge tone="outline">Added manually</Badge>}
        {entry.reminderAt && (
          <Badge tone={new Date(entry.reminderAt) < new Date() ? 'warning' : 'neutral'}>
            <BellRing className="h-3 w-3" aria-hidden="true" /> {formatRelative(entry.reminderAt)}
          </Badge>
        )}
      </div>
      {entry.notes && <p className="mt-2 line-clamp-2 text-sm text-muted">{entry.notes}</p>}
      {entry.appliedAt && <p className="mt-1 text-xs text-subtle">Applied {formatDate(entry.appliedAt)}</p>}
      {/* Board columns are narrow: the status picker gets its own full-width row. */}
      <div className="mt-3 space-y-1.5">
        <Select aria-label={`Status of ${entry.title}`} value={entry.status} onChange={event => move(entry, event.target.value as UserJobStatus)} className="h-8 text-sm">
          {TRACKER_STATUSES.map(status => (
            <option key={status} value={status}>
              {USER_JOB_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
        <div className="flex items-center justify-between gap-1.5">
          <Button size="xs" variant="ghost" onClick={() => setEditing(entry)}>
            Notes &amp; reminder
          </Button>
          <IconButton label={`Remove ${entry.title} from tracker`} size="xs" onClick={() => remove(entry)}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>
    </article>
  );

  return (
    <>
      <PageHeader
        title="Tracker"
        description="Every job you are interested in, from saved to offer."
        actions={
          <>
            <Segmented
              label="Layout"
              value={layout}
              onChange={setLayout}
              options={[
                { value: 'board', label: 'Board' },
                { value: 'list', label: 'List' },
              ]}
            />
            {/* A file download, so a plain link rather than client-side navigation. */}
            <a href="/api/tracker/export" download className={buttonClass('secondary')}>
              <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
            </a>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
              Add a job
            </Button>
          </>
        }
      />

      {error ? (
        <ErrorState description="Your tracker could not be loaded." onRetry={() => mutate()} />
      ) : isLoading ? (
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          {COLUMNS.map(column => (
            <Skeleton key={column.id} className="h-40" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          className="rounded-lg border border-dashed border-line"
          icon={<SquareKanban />}
          title="Nothing tracked yet"
          description="Save a job from the job feed (the bookmark icon), or add one you found elsewhere."
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add a job
            </Button>
          }
        />
      ) : layout === 'board' ? (
        <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 xl:grid xl:grid-cols-5 xl:overflow-visible">
          {COLUMNS.map(column => {
            const entries = grouped.get(column.id) ?? [];
            return (
              <section key={column.id} aria-labelledby={`col-${column.id}`} className="w-72 shrink-0 snap-start xl:w-auto">
                <h2 id={`col-${column.id}`} className="mb-2 flex items-center justify-between px-1 text-sm font-semibold text-ink">
                  {column.label}
                  <span className="tabular rounded bg-sunken px-1.5 text-xs font-medium text-muted">{entries.length}</span>
                </h2>
                <div className={cn('min-h-24 space-y-2 rounded-lg bg-sunken/60 p-2')}>{entries.length > 0 ? entries.map(card) : <p className="px-2 py-6 text-center text-sm text-subtle">Empty</p>}</div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="space-y-6">
          {COLUMNS.filter(column => (grouped.get(column.id) ?? []).length > 0).map(column => (
            <section key={column.id}>
              <h2 className="mb-2 text-sm font-semibold text-ink">
                {column.label} <span className="font-normal text-muted">({grouped.get(column.id)!.length})</span>
              </h2>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{grouped.get(column.id)!.map(card)}</div>
            </section>
          ))}
        </div>
      )}

      <NotesDialog entry={notesEntry} onClose={closeNotes} onSaved={() => mutate()} />
      <AddJobDialog open={adding} onClose={() => setAdding(false)} onSaved={() => mutate()} />
      {confirmElement}
    </>
  );
}

function NotesDialog({ entry, onClose, onSaved }: { entry: Entry | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ notes: '', appliedAt: '', reminderAt: '' });
  const [busy, setBusy] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  if (entry && loadedFor !== entry.id) {
    setLoadedFor(entry.id);
    setForm({ notes: entry.notes ?? '', appliedAt: entry.appliedAt?.slice(0, 10) ?? '', reminderAt: toLocalInputValue(entry.reminderAt) });
  }

  const save = async () => {
    if (!entry) return;
    setBusy(true);
    try {
      await api(`/api/tracker/${entry.id}`, {
        method: 'PATCH',
        body: {
          notes: form.notes || null,
          appliedAt: form.appliedAt ? new Date(form.appliedAt).toISOString() : null,
          reminderAt: form.reminderAt ? new Date(form.reminderAt).toISOString() : null,
        },
      });
      onSaved();
      toast.success('Saved');
      onClose();
    } catch (err) {
      toast.error('Could not save', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={entry !== null}
      onClose={() => {
        setLoadedFor(null);
        onClose();
      }}
      busy={busy}
      title={entry?.title ?? ''}
      description={entry?.companyName}
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
        <Field label="Notes">{ids => <Textarea {...ids} rows={6} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Applied on" optional>
            {ids => <Input {...ids} type="date" value={form.appliedAt} onChange={event => setForm({ ...form, appliedAt: event.target.value })} />}
          </Field>
          <Field label="Remind me" optional>
            {ids => <Input {...ids} type="datetime-local" value={form.reminderAt} onChange={event => setForm({ ...form, reminderAt: event.target.value })} />}
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

function AddJobDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: '', companyName: '', url: '', location: '', status: 'saved' as UserJobStatus });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      await api('/api/tracker', { body: { ...form, url: form.url || null, location: form.location || null } });
      onSaved();
      toast.success('Added to your tracker');
      setForm({ title: '', companyName: '', url: '', location: '', status: 'saved' });
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) setErrors(err.fieldErrors);
      toast.error('Could not add the job', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      title="Add a job you found elsewhere"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Add
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Job title" error={errors.title}>
          {ids => <Input {...ids} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} autoFocus />}
        </Field>
        <Field label="Company" error={errors.companyName}>
          {ids => <Input {...ids} value={form.companyName} onChange={event => setForm({ ...form, companyName: event.target.value })} />}
        </Field>
        <Field label="Link to the posting" optional>
          {ids => <Input {...ids} type="url" placeholder="https://" value={form.url} onChange={event => setForm({ ...form, url: event.target.value })} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Location" optional>
            {ids => <Input {...ids} value={form.location} onChange={event => setForm({ ...form, location: event.target.value })} />}
          </Field>
          <Field label="Status">
            {ids => (
              <Select {...ids} value={form.status} onChange={event => setForm({ ...form, status: event.target.value as UserJobStatus })}>
                {TRACKER_STATUSES.map(status => (
                  <option key={status} value={status}>
                    {USER_JOB_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
