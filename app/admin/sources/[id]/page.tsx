'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, FlaskConical, Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import { Can, RequirePermission, SourceStatusBadge } from '@/components/admin/bits';
import { ExtractionTestResult, ReasonDialog, ScanOutcomeBadge, TaskStatusBadge, shortUrl, triggerLabel, type ExtractionTest } from '@/components/admin/monitoring-bits';
import { TimeAgo } from '@/components/app/bits';
import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Dialog, useConfirm } from '@/components/ui/overlay';
import { Badge, Callout, Card, CardBody, CardHeader, DetailRow, ErrorState, Skeleton, StatCell, StatGrid, Table, TableWrap, Td, Th, Tr } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, errorMessage } from '@/lib/client/api';
import { formatDateTime, formatDuration, formatInterval, formatNumber } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';
import { isSafeHref } from '@/lib/security/ssrf-client';

interface Source {
  id: string;
  url: string;
  name: string;
  companyName: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  industry: string | null;
  hqLocation: string | null;
  atsType: string | null;
  adapterLabel: string;
  adapterOverride: string | null;
  scrapeMethod: string | null;
  status: string;
  pausedReason: string | null;
  priority: number;
  lastScrapedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  nextCheckAt: string | null;
  consecutiveFailures: number;
  checkIntervalMinutes: number;
  lastError: string | null;
  lastErrorClass: string | null;
  lastHttpStatus: number | null;
  lastDurationMs: number | null;
  lastJobsFound: number | null;
  activeJobCount: number;
  robotsAllowed: boolean | null;
  robotsCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByEmail: string | null;
  error: { label: string; hint: string } | null;
}

interface Scan {
  id: string;
  scrapedAt: string;
  success: boolean;
  outcome: string | null;
  trigger: string | null;
  adapter: string | null;
  httpStatus: number | null;
  errorClass: string | null;
  errorLabel: string | null;
  errorMessage: string | null;
  jobsFound: number | null;
  jobsAdded: number | null;
  jobsRemoved: number | null;
  jobsUpdated: number | null;
  jobsReopened: number | null;
  durationMs: number | null;
  workerId: string | null;
}

interface Task {
  id: string;
  status: string;
  trigger: string;
  attempts: number;
  maxAttempts: number;
  force: boolean;
  enqueuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  errorClass: string | null;
}

interface SourceDetail {
  source: Source;
  lists: { id: string; name: string; visibility: string; ownerEmail: string; isPaused: boolean }[];
  scans: Scan[];
  tasks: Task[];
  jobStats: { open: number; closed: number; hidden: number; new7d: number };
  adapters: { id: string; label: string; kind: string }[];
}

function SourceView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { can } = useSession();
  const { confirm, element: confirmElement } = useConfirm();
  const { data, error, isLoading, mutate } = useApi<SourceDetail>(`/api/admin/sources/${id}`, { refreshInterval: 30_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [pausing, setPausing] = useState(false);
  const test = useExtractionTest(data?.source.url ?? '', data?.source.adapterOverride ?? null);

  if (error) {
    return (
      <>
        <BackLink />
        <ErrorState title="Source not found" description={errorMessage(error)} onRetry={() => mutate()} />
      </>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-1/3" />
        <Skeleton className="h-20" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const { source, lists, scans, tasks, jobStats, adapters } = data;
  const pending = !source.lastSuccessAt && source.status !== 'paused';

  const scanNow = async () => {
    setBusy('scan');
    try {
      const result = await api<{ queued: number; alreadyQueued: number }>(`/api/admin/sources/${source.id}/scan`, { body: { force: true } });
      toast.success(result.queued > 0 ? 'Scan queued' : 'A scan is already queued', 'It runs on the next worker cycle, usually within a minute.');
      await mutate();
    } catch (err) {
      toast.error('Could not queue a scan', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const setPaused = async (paused: boolean, reason?: string) => {
    setBusy(paused ? 'pause' : 'resume');
    try {
      await api(`/api/admin/sources/${source.id}`, { method: 'PATCH', body: paused ? { paused: true, pausedReason: reason || undefined } : { paused: false } });
      toast.success(paused ? 'Source paused' : 'Source resumed', paused ? undefined : 'A check has been scheduled.');
      setPausing(false);
      await mutate();
    } catch (err) {
      toast.error(paused ? 'Could not pause' : 'Could not resume', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${source.name}?`,
      description: `This permanently deletes the source, every job found on it and its scan history, and removes it from ${lists.length === 1 ? 'one watchlist' : `${formatNumber(lists.length)} watchlists`}. It cannot be undone.`,
      confirmLabel: 'Delete permanently',
      tone: 'danger',
      typeToConfirm: 'delete',
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await api(`/api/admin/sources/${source.id}`, { method: 'DELETE' });
      toast.success('Source deleted');
      router.push('/admin/sources');
    } catch (err) {
      toast.error('Could not delete the source', errorMessage(err));
      setBusy(null);
    }
  };

  return (
    <>
      <BackLink />

      <header className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl">{source.name}</h1>
            <SourceStatusBadge status={source.status} pending={pending && source.status === 'active'} />
            {source.adapterOverride && <Badge tone="outline">Adapter forced</Badge>}
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span>{source.adapterLabel}</span>
            {isSafeHref(source.url) ? (
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 break-all hover:text-ink">
                {shortUrl(source.url)}
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </a>
            ) : (
              <span className="break-all">{source.url}</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Can permission="sources.manage">
            <Button icon={<FlaskConical className="h-4 w-4" />} onClick={() => void test.run()}>
              Test extraction
            </Button>
            {source.status === 'paused' ? (
              <Button icon={<Play className="h-4 w-4" />} loading={busy === 'resume'} disabled={busy !== null} onClick={() => setPaused(false)}>
                Resume
              </Button>
            ) : (
              <Button icon={<Pause className="h-4 w-4" />} disabled={busy !== null} onClick={() => setPausing(true)}>
                Pause
              </Button>
            )}
            <Button variant="primary" icon={<RefreshCw className="h-4 w-4" />} loading={busy === 'scan'} disabled={busy !== null} onClick={scanNow}>
              Scan now
            </Button>
          </Can>
        </div>
      </header>

      {source.status === 'paused' && (
        <Callout tone="neutral" title="Paused" className="mt-6">
          {source.pausedReason ?? 'This source is not being checked.'}
        </Callout>
      )}
      {source.error && source.status !== 'active' && source.status !== 'paused' && (
        <Callout tone={source.status === 'broken' ? 'danger' : 'warning'} title={source.error.label} className="mt-6">
          {source.error.hint}
          {source.lastError && <span className="mt-1.5 block break-words font-mono text-xs">{source.lastError}</span>}
        </Callout>
      )}

      <StatGrid className="mt-6">
        <StatCell
          label="Open jobs"
          value={
            <Link href={`/admin/jobs?source=${source.id}`} className="hover:text-accent">
              {formatNumber(jobStats.open)}
            </Link>
          }
        />
        <StatCell label="New in the last 7 days" value={formatNumber(jobStats.new7d)} />
        <StatCell label="Closed" value={formatNumber(jobStats.closed)} />
        <StatCell label="Hidden by admins" value={formatNumber(jobStats.hidden)} />
      </StatGrid>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card className="overflow-hidden">
            <CardHeader title="Recent scans" description="The last 50 attempts, newest first." />
            {scans.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">No scans yet. A first scan runs shortly after a source is added.</p>
            ) : (
              <TableWrap className="max-h-[520px] overflow-y-auto">
                <Table className="min-w-[860px]">
                  <thead>
                    <tr>
                      <Th>When</Th>
                      <Th>Result</Th>
                      <Th>Trigger</Th>
                      <Th className="text-right">Found</Th>
                      <Th className="text-right">New</Th>
                      <Th className="text-right">Closed</Th>
                      <Th className="text-right">Changed</Th>
                      <Th className="text-right">HTTP</Th>
                      <Th className="text-right">Time</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {scans.map(scan => (
                      <Tr key={scan.id}>
                        <Td className="whitespace-nowrap text-sm">{formatDateTime(scan.scrapedAt)}</Td>
                        <Td className="max-w-[300px]">
                          <ScanOutcomeBadge outcome={scan.outcome} success={scan.success} />
                          {(scan.errorLabel || scan.errorMessage) && (
                            <span className="mt-1 block truncate text-xs text-muted" title={scan.errorMessage ?? undefined}>
                              {scan.errorLabel}
                              {scan.errorMessage ? `: ${scan.errorMessage}` : ''}
                            </span>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap text-sm">{triggerLabel(scan.trigger)}</Td>
                        <Td className="tabular text-right">{formatNumber(scan.jobsFound)}</Td>
                        <Td className="tabular text-right">{formatNumber(scan.jobsAdded)}</Td>
                        <Td className="tabular text-right">{formatNumber(scan.jobsRemoved)}</Td>
                        <Td className="tabular text-right">{formatNumber((scan.jobsUpdated ?? 0) + (scan.jobsReopened ?? 0))}</Td>
                        <Td className="tabular text-right text-sm">{scan.httpStatus ?? '—'}</Td>
                        <Td className="tabular whitespace-nowrap text-right text-sm">{formatDuration(scan.durationMs)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title="Monitoring tasks"
              description="Queue entries for this source, newest first."
              action={
                <Link href={`/admin/monitoring?source=${source.id}#tasks`} className="text-sm font-medium text-accent hover:text-accent-hover">
                  Open in queue
                </Link>
              }
            />
            {tasks.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">No tasks recorded.</p>
            ) : (
              <TableWrap>
                <Table className="min-w-[720px]">
                  <thead>
                    <tr>
                      <Th>Queued</Th>
                      <Th>Status</Th>
                      <Th>Trigger</Th>
                      <Th className="text-right">Attempts</Th>
                      <Th>Finished</Th>
                      <Th>Error</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map(task => (
                      <Tr key={task.id}>
                        <Td className="whitespace-nowrap text-sm">{formatDateTime(task.enqueuedAt)}</Td>
                        <Td>
                          <TaskStatusBadge status={task.status} />
                        </Td>
                        <Td className="whitespace-nowrap text-sm">
                          {triggerLabel(task.trigger)}
                          {task.force ? ' · full' : ''}
                        </Td>
                        <Td className="tabular text-right text-sm">
                          {task.attempts}/{task.maxAttempts}
                        </Td>
                        <Td className="whitespace-nowrap text-sm">{task.finishedAt ? <TimeAgo value={task.finishedAt} /> : '—'}</Td>
                        <Td className="max-w-[260px] truncate text-sm text-muted" title={task.error ?? undefined}>
                          {task.errorClass ? `${task.errorClass}: ` : ''}
                          {task.error ?? '—'}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Health" />
            <dl className="divide-y divide-line px-4 sm:px-5">
              <DetailRow label="Last success">
                <TimeAgo value={source.lastSuccessAt} />
              </DetailRow>
              <DetailRow label="Last attempt">
                <TimeAgo value={source.lastScrapedAt} />
              </DetailRow>
              <DetailRow label="Last failure">
                <TimeAgo value={source.lastFailureAt} />
              </DetailRow>
              <DetailRow label="Next check">{source.status === 'paused' ? 'Paused' : <TimeAgo value={source.nextCheckAt} />}</DetailRow>
              <DetailRow label="Failures in a row">
                <span className={source.consecutiveFailures > 0 ? 'font-medium text-danger' : undefined}>{formatNumber(source.consecutiveFailures)}</span>
              </DetailRow>
              <DetailRow label="Last scan">
                {source.lastJobsFound !== null ? `${formatNumber(source.lastJobsFound)} jobs` : '—'}
                {source.lastDurationMs !== null ? ` in ${formatDuration(source.lastDurationMs)}` : ''}
                {source.lastHttpStatus !== null ? ` · HTTP ${source.lastHttpStatus}` : ''}
              </DetailRow>
              <DetailRow label="Method">{source.scrapeMethod ?? '—'}</DetailRow>
              <DetailRow label="robots.txt">
                {source.robotsAllowed === null ? 'Not checked' : source.robotsAllowed ? 'Allowed' : 'Disallowed'}
                {source.robotsCheckedAt && (
                  <span className="text-muted">
                    {' '}
                    · <TimeAgo value={source.robotsCheckedAt} />
                  </span>
                )}
              </DetailRow>
              <DetailRow label="Added">
                {formatDateTime(source.createdAt)}
                {source.createdByEmail && <span className="block text-sm text-muted">by {source.createdByEmail}</span>}
              </DetailRow>
            </dl>
          </Card>

          <Card>
            <CardHeader title="On watchlists" description={lists.length === 0 ? 'No watchlist includes this source, so nobody is alerted about it.' : undefined} />
            {lists.length > 0 && (
              <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                {lists.map(list => (
                  <li key={list.id} className="px-5 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-base text-ink">{list.name}</span>
                      <span className="flex shrink-0 gap-1">
                        {list.isPaused && <Badge tone="neutral">Paused here</Badge>}
                        <Badge tone="outline">{list.visibility === 'public' ? 'Public' : 'Private'}</Badge>
                      </span>
                    </div>
                    <span className="block truncate text-sm text-muted">{list.ownerEmail}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <ConfigurationCard key={source.updatedAt} source={source} adapters={adapters} canEdit={can('sources.manage')} onSaved={() => mutate()} />

      <Can permission="sources.delete">
        <Card className="mt-6 border-danger/30">
          <CardHeader title="Delete source" description="Removes the source, its jobs and scan history for everyone. Users lose it from their watchlists." />
          <CardBody>
            <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} loading={busy === 'delete'} disabled={busy !== null} onClick={remove}>
              Delete this source
            </Button>
          </CardBody>
        </Card>
      </Can>

      <ReasonDialog
        open={pausing}
        title="Pause this source?"
        description="It will not be checked until it is resumed. Its open jobs stay visible."
        confirmLabel="Pause"
        hint="Shown on the source and recorded in the audit log."
        placeholder="e.g. Site is being rebuilt; check again next week"
        maxLength={200}
        busy={busy === 'pause'}
        onClose={() => setPausing(false)}
        onConfirm={reason => setPaused(true, reason)}
      />
      <TestDialog state={test.state} onRetry={() => void test.run()} onClose={test.close} />
      {confirmElement}
    </>
  );
}

function BackLink() {
  return (
    <Link href="/admin/sources" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Sources
    </Link>
  );
}

const EDITABLE = ['companyName', 'url', 'websiteUrl', 'logoUrl', 'industry', 'hqLocation'] as const;

function ConfigurationCard({ source, adapters, canEdit, onSaved }: { source: Source; adapters: SourceDetail['adapters']; canEdit: boolean; onSaved: () => void }) {
  const toast = useToast();
  const initial = {
    companyName: source.companyName ?? '',
    url: source.url,
    websiteUrl: source.websiteUrl ?? '',
    logoUrl: source.logoUrl ?? '',
    industry: source.industry ?? '',
    hqLocation: source.hqLocation ?? '',
    checkIntervalMinutes: String(source.checkIntervalMinutes),
    priority: String(source.priority),
    adapterOverride: source.adapterOverride ?? '',
  };
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));

  const changes = (): Record<string, unknown> => {
    const patch: Record<string, unknown> = {};
    for (const key of EDITABLE) {
      if (form[key].trim() !== initial[key]) patch[key] = key === 'url' ? form[key].trim() : form[key].trim() || null;
    }
    if (form.checkIntervalMinutes !== initial.checkIntervalMinutes) patch.checkIntervalMinutes = Number(form.checkIntervalMinutes);
    if (form.priority !== initial.priority) patch.priority = Number(form.priority);
    if (form.adapterOverride !== initial.adapterOverride) patch.adapterOverride = form.adapterOverride || null;
    return patch;
  };

  const pendingChanges = changes();
  const dirty = Object.keys(pendingChanges).length > 0;

  const save = async () => {
    const patch = changes();
    const interval = Number(form.checkIntervalMinutes);
    const priority = Number(form.priority);
    const local: Record<string, string> = {};
    if ('checkIntervalMinutes' in patch && (!Number.isInteger(interval) || interval < 15 || interval > 10080)) local.checkIntervalMinutes = 'Use a whole number of minutes between 15 and 10080 (one week).';
    if ('priority' in patch && (!Number.isInteger(priority) || priority < -10 || priority > 100)) local.priority = 'Use a whole number between -10 and 100.';
    if ('url' in patch && !form.url.trim()) local.url = 'Enter the careers page URL.';
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      await api(`/api/admin/sources/${source.id}`, { method: 'PATCH', body: patch });
      toast.success('Source updated', 'url' in patch || 'adapterOverride' in patch ? 'The next scan starts fresh with the new settings.' : undefined);
      onSaved();
    } catch (err) {
      if (err instanceof ApiClientError && Object.keys(err.fieldErrors).length > 0) setErrors(err.fieldErrors);
      else toast.error('Could not save', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader title="Configuration" description={canEdit ? 'Changes apply to every watchlist that includes this source and are recorded in the audit log.' : 'Read only. Changing sources needs the sources.manage permission.'} />
      <CardBody>
        <fieldset disabled={!canEdit || saving} className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
          <Field label="Company name" optional error={errors.companyName}>
            {ids => <Input {...ids} value={form.companyName} maxLength={120} onChange={event => set('companyName', event.target.value)} />}
          </Field>
          <Field label="Careers page URL" error={errors.url} hint="Changing it clears the error history and schedules a check.">
            {ids => <Input {...ids} value={form.url} inputMode="url" onChange={event => set('url', event.target.value)} />}
          </Field>
          <Field label="Company website" optional error={errors.websiteUrl}>
            {ids => <Input {...ids} value={form.websiteUrl} inputMode="url" placeholder="https://" onChange={event => set('websiteUrl', event.target.value)} />}
          </Field>
          <Field label="Logo URL" optional error={errors.logoUrl}>
            {ids => <Input {...ids} value={form.logoUrl} inputMode="url" placeholder="https://" onChange={event => set('logoUrl', event.target.value)} />}
          </Field>
          <Field label="Industry" optional error={errors.industry}>
            {ids => <Input {...ids} value={form.industry} maxLength={80} onChange={event => set('industry', event.target.value)} />}
          </Field>
          <Field label="Headquarters" optional error={errors.hqLocation}>
            {ids => <Input {...ids} value={form.hqLocation} maxLength={120} onChange={event => set('hqLocation', event.target.value)} />}
          </Field>
          <Field
            label="Check every (minutes)"
            error={errors.checkIntervalMinutes}
            hint={`Currently ${formatInterval(source.checkIntervalMinutes)}. A platform-wide interval in Settings takes precedence when it is switched on.`}
          >
            {ids => <Input {...ids} type="number" min={15} max={10080} step={5} value={form.checkIntervalMinutes} onChange={event => set('checkIntervalMinutes', event.target.value)} />}
          </Field>
          <Field label="Priority" error={errors.priority} hint="Higher numbers are scanned first when the queue is busy (-10 to 100).">
            {ids => <Input {...ids} type="number" min={-10} max={100} value={form.priority} onChange={event => set('priority', event.target.value)} />}
          </Field>
          <Field label="Adapter" error={errors.adapterOverride} hint={`Auto-detect currently uses: ${source.adapterLabel}. Forcing an adapter resets the page fingerprint.`}>
            {ids => (
              <Select {...ids} value={form.adapterOverride} onChange={event => set('adapterOverride', event.target.value)}>
                <option value="">Auto-detect</option>
                {adapters.map(adapter => (
                  <option key={adapter.id} value={adapter.id}>
                    {adapter.label} ({adapter.kind})
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </fieldset>
        {canEdit && (
          <div className="mt-5 flex items-center justify-end gap-2">
            {dirty && (
              <Button variant="ghost" disabled={saving} onClick={() => setForm(initial)}>
                Discard changes
              </Button>
            )}
            <Button variant="primary" loading={saving} disabled={!dirty} onClick={save}>
              Save changes
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

interface TestState {
  open: boolean;
  running: boolean;
  result: ExtractionTest | null;
  error: string | null;
}

const CLOSED_TEST: TestState = { open: false, running: false, result: null, error: null };

/** Runs a dry-run extraction of the saved URL and adapter setting; nothing is stored. */
function useExtractionTest(url: string, adapter: string | null) {
  const [state, setState] = useState<TestState>(CLOSED_TEST);
  const runId = useRef(0);

  const run = async () => {
    const id = ++runId.current;
    setState({ open: true, running: true, result: null, error: null });
    try {
      const result = await api<ExtractionTest>('/api/admin/sources/test', { body: { url, adapter } });
      if (runId.current === id) setState({ open: true, running: false, result, error: null });
    } catch (err) {
      if (runId.current === id) setState({ open: true, running: false, result: null, error: errorMessage(err) });
    }
  };

  const close = () => {
    runId.current++;
    setState(CLOSED_TEST);
  };

  return { state, run, close };
}

function TestDialog({ state, onRetry, onClose }: { state: TestState; onRetry: () => void; onClose: () => void }) {
  const { open, running, result, error } = state;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Test extraction"
      description="Reads the saved URL with the saved adapter setting, exactly as a scan would, without storing anything."
      footer={
        <>
          <Button onClick={onRetry} loading={running}>
            Run again
          </Button>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {running ? (
        <div className="space-y-2" role="status" aria-label="Running the test">
          <Skeleton className="h-16" />
          <Skeleton className="h-40" />
        </div>
      ) : error ? (
        <Callout tone="danger">{error}</Callout>
      ) : result ? (
        <ExtractionTestResult result={result} />
      ) : null}
    </Dialog>
  );
}

export default function AdminSourcePage() {
  return (
    <RequirePermission permission="sources.read">
      <SourceView />
    </RequirePermission>
  );
}
