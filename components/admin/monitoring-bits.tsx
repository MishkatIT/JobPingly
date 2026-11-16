'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/form';
import { Dialog } from '@/components/ui/overlay';
import { Badge, type Tone } from '@/components/ui/primitives';
import { cn } from '@/lib/client/cn';
import { formatDuration, formatNumber, plural } from '@/lib/client/format';
import { isSafeHref } from '@/lib/security/ssrf-client';

// ---------------------------------------------------------------------------
// Status vocabularies
// ---------------------------------------------------------------------------

const TASK_STATUS: Record<string, { label: string; tone: Tone }> = {
  queued: { label: 'Queued', tone: 'neutral' },
  running: { label: 'Running', tone: 'accent' },
  succeeded: { label: 'Succeeded', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'outline' },
};

export function TaskStatusBadge({ status }: { status: string }) {
  const entry = TASK_STATUS[status] ?? { label: status, tone: 'neutral' as Tone };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

const SCAN_OUTCOME: Record<string, { label: string; tone: Tone }> = {
  success: { label: 'Updated', tone: 'success' },
  unchanged: { label: 'No changes', tone: 'neutral' },
  suspicious: { label: 'Held for review', tone: 'warning' },
  failed: { label: 'Failed', tone: 'danger' },
  skipped: { label: 'Skipped', tone: 'outline' },
};

export function ScanOutcomeBadge({ outcome, success }: { outcome: string | null; success?: boolean }) {
  const entry = outcome ? SCAN_OUTCOME[outcome] : success === false ? SCAN_OUTCOME.failed : success ? SCAN_OUTCOME.success : undefined;
  return <Badge tone={entry?.tone ?? 'neutral'}>{entry?.label ?? outcome ?? 'Unknown'}</Badge>;
}

export const TRIGGER_LABELS: Record<string, string> = {
  schedule: 'Scheduled',
  manual: 'Manual',
  retry: 'Retry',
  onboarding: 'New source',
};

export function triggerLabel(trigger: string | null | undefined): string {
  if (!trigger) return '—';
  return TRIGGER_LABELS[trigger] ?? trigger;
}

export const JOB_EVENT_LABELS: Record<string, string> = {
  discovered: 'Discovered',
  updated: 'Changed',
  closed: 'Closed',
  reopened: 'Reopened',
  hidden: 'Hidden by an administrator',
  restored: 'Restored',
};

const SERVICE_STATUS: Record<string, { label: string; tone: Tone }> = {
  ok: { label: 'Working', tone: 'success' },
  warning: { label: 'Needs attention', tone: 'warning' },
  off: { label: 'Off', tone: 'outline' },
  down: { label: 'Down', tone: 'danger' },
};

export function ServiceStatusBadge({ status }: { status: string }) {
  const entry = SERVICE_STATUS[status] ?? { label: status, tone: 'neutral' as Tone };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

/** `careers.example.com/jobs` from a full URL; never throws on odd input. */
export function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.hostname.replace(/^www\./, '')}${path}${parsed.search}`;
  } catch {
    return url;
  }
}

/** Seconds (as reported by the queue statistics) in a readable form. */
export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  return formatDuration(seconds * 1000);
}

// ---------------------------------------------------------------------------
// Row selection for bulk actions
// ---------------------------------------------------------------------------

/**
 * Selection over the rows currently on screen. Only ids that are still on
 * the page count as selected (after a filter change or a refresh the rest are
 * ignored), so a bulk action never applies to rows the admin cannot see.
 */
export function useSelection(visibleIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const key = visibleIds.join(',');

  return useMemo(() => {
    const visible = key ? key.split(',') : [];
    const current = new Set(visible.filter(id => selected.has(id)));
    const allSelected = visible.length > 0 && current.size === visible.length;
    return {
      ids: [...current],
      count: current.size,
      has: (id: string) => current.has(id),
      toggle: (id: string) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelected(next);
      },
      allSelected,
      someSelected: current.size > 0,
      toggleAll: () => setSelected(allSelected ? new Set() : new Set(visible)),
      clear: () => setSelected(new Set()),
    };
  }, [selected, key]);
}

/** A bare checkbox for table rows; always has an accessible name. */
export function SelectBox({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate) && !checked;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={onChange}
      className="h-4 w-4 shrink-0 cursor-pointer rounded-sm border-line-strong accent-[rgb(var(--accent))]"
    />
  );
}

/** Appears above a table while rows are selected. */
export function BulkBar({ count, noun, onClear, children }: { count: number; noun: [string, string]; onClear: () => void; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 border-b border-line bg-accent-soft/50 px-4 py-2.5">
      <span className="mr-1 text-sm font-medium text-ink">{plural(count, noun[0], noun[1])} selected</span>
      {children}
      <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={onClear} className="ml-auto">
        Clear
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

/** Asks for an optional reason (or a required one); used for pausing sources and hiding jobs. */
export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  label = 'Reason',
  required = false,
  placeholder,
  hint,
  maxLength = 300,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  label?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState('');
  // Start empty each time the dialog opens (state adjusted during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason('');
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      size="sm"
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={required && !reason.trim()} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Field label={label} optional={!required} hint={hint}>
        {ids => <Textarea {...ids} rows={2} maxLength={maxLength} value={reason} onChange={event => setReason(event.target.value)} placeholder={placeholder} autoFocus />}
      </Field>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Extraction test results (POST /api/admin/sources/test)
// ---------------------------------------------------------------------------

export type ExtractionTest =
  | {
      ok: true;
      url: string;
      adapter: string;
      adapterLabel: string;
      kind: string;
      detection: { fromUrl: string | null; fromHtml: string | null; override: string | null };
      httpStatus: number | null;
      robotsAllowed: boolean | null;
      partial: boolean;
      requests: number;
      durationMs: number;
      jobCount: number;
      sample: { title: string; location: string | null; url: string | null; workplaceType: string | null; employmentType: string | null; identity: string }[];
    }
  | {
      ok: false;
      url: string;
      errorClass: string;
      label: string;
      hint: string;
      message: string;
      httpStatus: number | null;
      requests: number;
      durationMs: number;
    };

const IDENTITY_LABELS: Record<string, string> = { ext: 'ATS id', url: 'Link', tl: 'Title + location' };

export function ExtractionTestResult({ result }: { result: ExtractionTest }) {
  const facts = [
    result.httpStatus !== null ? `HTTP ${result.httpStatus}` : null,
    plural(result.requests, 'request'),
    formatDuration(result.durationMs),
  ].filter(Boolean);

  if (!result.ok) {
    return (
      <div className="rounded-md border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm">
        <p className="flex items-center gap-1.5 font-medium text-ink">
          <CircleAlert className="h-4 w-4 text-danger" aria-hidden="true" />
          {result.label}
        </p>
        <p className="mt-1 text-muted">{result.hint}</p>
        <p className="mt-2 break-words font-mono text-xs text-ink">{result.message}</p>
        <p className="mt-2 text-xs text-muted">
          {result.errorClass} · {facts.join(' · ')}
        </p>
      </div>
    );
  }

  const detected = [result.detection.override ? `forced: ${result.detection.override}` : null, result.detection.fromUrl ? `from URL: ${result.detection.fromUrl}` : null, result.detection.fromHtml ? `from page: ${result.detection.fromHtml}` : null].filter(Boolean);

  return (
    <div className="space-y-3">
      <div className={cn('rounded-md border px-3.5 py-3 text-sm', result.jobCount > 0 ? 'border-success/25 bg-success-soft' : 'border-warning/25 bg-warning-soft')}>
        <p className="flex items-center gap-1.5 font-medium text-ink">
          {result.jobCount > 0 ? <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" /> : <CircleAlert className="h-4 w-4 text-warning" aria-hidden="true" />}
          {result.adapterLabel}: {result.partial ? 'at least ' : ''}
          {plural(result.jobCount, 'job')} found
        </p>
        <p className="mt-1 text-muted">
          {result.kind} extraction · {facts.join(' · ')}
          {result.robotsAllowed === false ? ' · robots.txt disallows this page' : ''}
        </p>
        {detected.length > 0 && <p className="mt-1 text-xs text-muted">Detection: {detected.join(', ')}</p>}
        {result.jobCount === 0 && <p className="mt-1 text-muted">The page was read but no job postings were recognised. Check that this is the page that lists jobs.</p>}
      </div>
      {result.sample.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink">
            First {formatNumber(result.sample.length)} {result.sample.length === 1 ? 'job' : 'jobs'}
          </p>
          <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-md border border-line text-sm">
            {result.sample.map((job, index) => (
              <li key={`${job.title}-${index}`} className="flex items-start justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  {isSafeHref(job.url) ? (
                    <a href={job.url!} target="_blank" rel="noopener noreferrer" className="font-medium text-ink hover:text-accent">
                      {job.title}
                    </a>
                  ) : (
                    <span className="font-medium text-ink">{job.title}</span>
                  )}
                  {job.location && <span className="block truncate text-muted">{job.location}</span>}
                </div>
                <Badge tone="outline" title="How this job is identified between scans">
                  {IDENTITY_LABELS[job.identity] ?? job.identity}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
