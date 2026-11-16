'use client';

import { Suspense, useEffect, useState } from 'react';
import { ExternalLink, MessageSquareWarning } from 'lucide-react';
import { RequirePermission, SearchInput } from '@/components/admin/bits';
import { FilterSelect, UserLink, useUrlFilters } from '@/components/admin/ops-bits';
import { TimeAgo } from '@/components/app/bits';
import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/form';
import { Dialog, Pagination, Tabs, useConfirm } from '@/components/ui/overlay';
import { Badge, DetailRow, EmptyState, ErrorState, PageHeader, SkeletonRows, type Tone } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage, qs } from '@/lib/client/api';
import { cn } from '@/lib/client/cn';
import { formatDateTime } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';
import { ISSUE_CATEGORIES, ISSUE_PRIORITIES, ISSUE_STATUSES } from '@/lib/constants';
import { isSafeHref } from '@/lib/security/ssrf-client';

interface Issue {
  id: string;
  userId: string | null;
  reporterEmail: string;
  reporterName: string | null;
  category: string;
  subject: string;
  description: string;
  targetUrl: string | null;
  status: string;
  priority: string;
  adminNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

type StatusFilter = 'all' | (typeof ISSUE_STATUSES)[number];

const STATUS_LABELS: Record<string, string> = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed' };
const STATUS_TONES: Record<string, Tone> = { open: 'warning', in_progress: 'accent', resolved: 'success', closed: 'neutral' };
const CATEGORY_LABELS: Record<string, string> = {
  broken_url: 'Company page not working',
  scraper_bug: 'Wrong or missing jobs',
  ui_bug: 'Problem with the app',
  feature_request: 'Feature request',
  general: 'General',
};
const PRIORITY_LABELS: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
const PRIORITY_TONES: Record<string, Tone> = { low: 'neutral', medium: 'outline', high: 'warning', critical: 'danger' };

const PAGE_SIZE = 25;

function IssuesView() {
  const { params, update } = useUrlFilters();
  const statusParam = params.get('status') as StatusFilter | null;
  const status: StatusFilter = statusParam === 'all' || (ISSUE_STATUSES as readonly string[]).includes(statusParam ?? '') ? statusParam! : 'open';
  const category = (ISSUE_CATEGORIES as readonly string[]).includes(params.get('category') ?? '') ? params.get('category')! : '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [selected, setSelected] = useState<Issue | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.get('q') ?? '') !== search.trim()) update({ q: search.trim() || null });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const { data, meta, error, isLoading, mutate } = useApi<Issue[]>(`/api/admin/issues${qs({ status, category, q: params.get('q') ?? '', page, pageSize: PAGE_SIZE })}`);
  const counts = (meta?.counts ?? {}) as Record<string, number>;
  const allCount = Object.values(counts).reduce((sum, value) => sum + value, 0);

  return (
    <>
      <PageHeader title="Reported issues" description="Problems and requests people sent from the Help page and the in-app feedback form." />

      <Tabs
        label="Issue status"
        value={status}
        onChange={value => update({ status: value === 'open' ? null : value })}
        options={[
          ...ISSUE_STATUSES.map(value => ({ value, label: STATUS_LABELS[value], count: meta ? (counts[value] ?? 0) : null })),
          { value: 'all' as const, label: 'All', count: meta ? allCount : null },
        ]}
      />

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search subject, text or reporter" className="relative block w-full sm:max-w-sm" />
        <FilterSelect
          label="Category"
          value={category}
          onChange={value => update({ category: value || null })}
          options={[{ value: '', label: 'All categories' }, ...ISSUE_CATEGORIES.map(value => ({ value, label: CATEGORY_LABELS[value] }))]}
          className="sm:w-60"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface">
        {error ? (
          <ErrorState description={errorMessage(error)} onRetry={() => mutate()} />
        ) : isLoading ? (
          <SkeletonRows rows={6} />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={<MessageSquareWarning />} title={status === 'open' && !params.get('q') && !category ? 'No open issues' : 'No issues match these filters'} />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {data.map(issue => (
                <li key={issue.id}>
                  <button type="button" onClick={() => setSelected(issue)} className="flex w-full flex-col gap-1.5 px-4 py-3.5 text-left hover:bg-sunken/50 sm:px-5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{issue.subject}</span>
                      <Badge tone={STATUS_TONES[issue.status] ?? 'neutral'}>{STATUS_LABELS[issue.status] ?? issue.status}</Badge>
                      <Badge tone={PRIORITY_TONES[issue.priority] ?? 'neutral'}>{PRIORITY_LABELS[issue.priority] ?? issue.priority} priority</Badge>
                    </span>
                    <span className="line-clamp-2 text-sm text-muted">{issue.description}</span>
                    <span className="text-xs text-subtle">
                      {CATEGORY_LABELS[issue.category] ?? issue.category} · {issue.reporterName ? `${issue.reporterName} (${issue.reporterEmail})` : issue.reporterEmail} · <TimeAgo value={issue.createdAt} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Pagination page={page} totalPages={Number(meta?.totalPages ?? 1)} total={Number(meta?.total ?? 0)} pageSize={PAGE_SIZE} onChange={next => update({ page: next })} className="border-t border-line" />
          </>
        )}
      </div>

      <IssueDialog
        issue={selected}
        onClose={() => setSelected(null)}
        onChanged={async next => {
          await mutate();
          setSelected(next);
        }}
      />
    </>
  );
}

function IssueDialog({ issue, onClose, onChanged }: { issue: Issue | null; onClose: () => void; onChanged: (issue: Issue | null) => Promise<void> }) {
  const toast = useToast();
  const { can } = useSession();
  const { confirm, element: confirmElement } = useConfirm();
  const canManage = can('issues.manage');
  const [form, setForm] = useState({ status: 'open', priority: 'medium', adminNotes: '' });
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (issue && loadedFor !== issue.id) {
    setLoadedFor(issue.id);
    setForm({ status: issue.status, priority: issue.priority, adminNotes: issue.adminNotes ?? '' });
  }

  const dirty = issue !== null && (form.status !== issue.status || form.priority !== issue.priority || form.adminNotes !== (issue.adminNotes ?? ''));

  const save = async () => {
    if (!issue) return;
    setBusy(true);
    try {
      const updated = await api<Issue>(`/api/admin/issues/${issue.id}`, {
        method: 'PATCH',
        body: {
          ...(form.status !== issue.status ? { status: form.status } : {}),
          ...(form.priority !== issue.priority ? { priority: form.priority } : {}),
          ...(form.adminNotes !== (issue.adminNotes ?? '') ? { adminNotes: form.adminNotes.trim() || null } : {}),
        },
      });
      toast.success('Issue updated');
      setLoadedFor(null);
      await onChanged(updated);
    } catch (err) {
      toast.error('Could not update the issue', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!issue) return;
    const ok = await confirm({ title: 'Delete this issue?', description: 'Use this for spam. Real reports are better closed, so there is a record.', confirmLabel: 'Delete', tone: 'danger' });
    if (!ok) return;
    try {
      await api(`/api/admin/issues/${issue.id}`, { method: 'DELETE' });
      toast.success('Issue deleted');
      setLoadedFor(null);
      await onChanged(null);
    } catch (err) {
      toast.error('Could not delete the issue', errorMessage(err));
    }
  };

  return (
    <>
      <Dialog
        open={issue !== null}
        onClose={() => {
          setLoadedFor(null);
          onClose();
        }}
        busy={busy}
        size="lg"
        title={issue?.subject ?? ''}
        description={issue ? `${CATEGORY_LABELS[issue.category] ?? issue.category} · reported ${formatDateTime(issue.createdAt)}` : undefined}
        footer={
          canManage ? (
            <>
              <Button variant="ghost" className="mr-auto text-danger" onClick={remove} disabled={busy}>
                Delete
              </Button>
              <Button onClick={onClose} disabled={busy}>
                Close
              </Button>
              <Button variant="primary" loading={busy} disabled={!dirty} onClick={save}>
                Save changes
              </Button>
            </>
          ) : (
            <Button onClick={onClose}>Close</Button>
          )
        }
      >
        {issue && (
          <div className="space-y-5">
            <p className="whitespace-pre-wrap break-words rounded-md border border-line bg-sunken/50 px-3.5 py-3 text-base text-ink">{issue.description}</p>
            <dl className="divide-y divide-line">
              <DetailRow label="Reported by">
                <UserLink id={can('users.read') ? issue.userId : null}>{issue.reporterName ? `${issue.reporterName} · ${issue.reporterEmail}` : issue.reporterEmail}</UserLink>
                {!issue.userId && <span className="ml-2 text-sm text-muted">(not signed in)</span>}
              </DetailRow>
              {issue.targetUrl && (
                <DetailRow label="Page or link">
                  {isSafeHref(issue.targetUrl) ? (
                    <a href={issue.targetUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 break-all text-accent hover:text-accent-hover">
                      {issue.targetUrl}
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="break-all">{issue.targetUrl}</span>
                  )}
                </DetailRow>
              )}
              {issue.resolvedAt && <DetailRow label="Resolved">{formatDateTime(issue.resolvedAt)}</DetailRow>}
            </dl>

            {canManage ? (
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
                <Field label="Status">
                  {ids => (
                    <Select {...ids} value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}>
                      {ISSUE_STATUSES.map(value => (
                        <option key={value} value={value}>
                          {STATUS_LABELS[value]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Priority">
                  {ids => (
                    <Select {...ids} value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })}>
                      {ISSUE_PRIORITIES.map(value => (
                        <option key={value} value={value}>
                          {PRIORITY_LABELS[value]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Internal notes" hint="Only staff can see these. The reporter is not notified." className="sm:col-span-2">
                  {ids => <Textarea {...ids} rows={4} maxLength={5000} value={form.adminNotes} onChange={event => setForm({ ...form, adminNotes: event.target.value })} />}
                </Field>
              </div>
            ) : (
              <dl className="divide-y divide-line">
                <DetailRow label="Status">{STATUS_LABELS[issue.status] ?? issue.status}</DetailRow>
                <DetailRow label="Priority">{PRIORITY_LABELS[issue.priority] ?? issue.priority}</DetailRow>
                <DetailRow label="Internal notes">
                  <span className={cn('whitespace-pre-wrap', !issue.adminNotes && 'text-muted')}>{issue.adminNotes || 'None'}</span>
                </DetailRow>
              </dl>
            )}
          </div>
        )}
      </Dialog>
      {confirmElement}
    </>
  );
}

export default function AdminIssuesPage() {
  return (
    <RequirePermission permission="issues.read">
      <Suspense fallback={<SkeletonRows rows={6} />}>
        <IssuesView />
      </Suspense>
    </RequirePermission>
  );
}
