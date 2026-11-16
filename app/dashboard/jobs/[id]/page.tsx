'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, CalendarClock, ExternalLink, EyeOff, History, MapPin, Sparkles } from 'lucide-react';
import { useRevalidateWorkspace } from '@/components/app/add-company-dialog';
import { CompanyAvatar, JobFacets, TimeAgo } from '@/components/app/bits';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Badge, Card, CardBody, CardHeader, ErrorState, Skeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/client/api';
import { formatDate, formatDateTime, formatNumber, toLocalInputValue } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';
import { TRACKER_STATUSES, USER_JOB_STATUS_LABELS, type UserJobStatus } from '@/lib/constants';
import { isSafeHref } from '@/lib/security/ssrf-client';

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
    firstSeenAt: string;
    lastSeenAt: string;
    status: string;
    closedAt: string | null;
  };
  company: { id: string; name: string; url: string; logoUrl: string | null; openJobs: number };
  history: { type: string; changes: Record<string, { from: unknown; to: unknown }> | null; createdAt: string }[];
  matches: { listId: string; listName: string; terms: string[]; explanation: string }[];
  tracking: { status: string; notes: string | null; appliedAt: string | null; reminderAt: string | null } | null;
}

const EVENT_LABELS: Record<string, string> = {
  discovered: 'Found by JobPingly',
  updated: 'Posting changed',
  closed: 'Closed',
  reopened: 'Reopened',
  hidden: 'Removed by an administrator',
  restored: 'Restored',
};

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  location: 'Location',
  department: 'Department',
  workplaceType: 'Workplace',
  employmentType: 'Type',
  salaryText: 'Salary',
  deadline: 'Deadline',
  description: 'Description',
  reason: 'Reason',
};

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const revalidate = useRevalidateWorkspace();
  const { data, error, isLoading, mutate } = useApi<JobDetail>(`/api/jobs/${id}`);
  const [tracking, setTracking] = useState({ status: '', notes: '', appliedAt: '', reminderAt: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setTracking({
      status: data.tracking?.status ?? '',
      notes: data.tracking?.notes ?? '',
      appliedAt: data.tracking?.appliedAt ? data.tracking.appliedAt.slice(0, 10) : '',
      reminderAt: toLocalInputValue(data.tracking?.reminderAt),
    });
  }, [data]);

  if (error) {
    return (
      <ErrorState
        title="This job is not available"
        description="It may have been removed, or it belongs to a company that is not on your watchlists."
        onRetry={() => mutate()}
      />
    );
  }
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { job, company } = data;
  const closed = job.status === 'closed';

  const save = async (status: UserJobStatus | null, extra: Partial<typeof tracking> = {}) => {
    setSaving(true);
    const next = { ...tracking, ...extra };
    try {
      await api(`/api/jobs/${job.id}`, {
        method: 'PUT',
        body: {
          status,
          ...(status !== null && status !== 'dismissed'
            ? {
                notes: next.notes || null,
                appliedAt: next.appliedAt ? new Date(next.appliedAt).toISOString() : null,
                reminderAt: next.reminderAt ? new Date(next.reminderAt).toISOString() : null,
              }
            : {}),
        },
      });
      await mutate();
      void revalidate();
      toast.success(status === null ? 'Removed from your tracker' : status === 'dismissed' ? 'Hidden from your feed' : 'Saved');
    } catch (err) {
      toast.error('Could not save', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Link href="/dashboard/jobs" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Jobs
      </Link>

      <header className="mt-4 flex flex-col gap-5 border-b border-line pb-6 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-4">
          <CompanyAvatar name={company.name} logoUrl={company.logoUrl} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl">{job.title}</h1>
              {closed && <Badge>Closed {job.closedAt ? formatDate(job.closedAt) : ''}</Badge>}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-muted">
              <Link href={`/dashboard/companies/${company.id}`} className="inline-flex items-center gap-1 font-medium text-ink hover:text-accent">
                <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                {company.name}
              </Link>
              {job.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  {job.location}
                </span>
              )}
              {job.department && <span>{job.department}</span>}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <JobFacets workplaceType={job.workplaceType} employmentType={job.employmentType} seniority={job.seniority} />
              {job.salaryText && <span className="text-sm font-medium text-ink">{job.salaryText}</span>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {isSafeHref(job.url) && (
            <a
              href={job.url!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-base font-medium text-primary-fg shadow-xs hover:bg-primary-hover"
            >
              {closed ? 'View posting' : 'Apply on company site'} <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
          {tracking.status !== 'dismissed' && (
            <Button icon={<EyeOff className="h-4 w-4" />} onClick={() => save('dismissed')} disabled={saving}>
              Not interested
            </Button>
          )}
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {data.matches.length > 0 && (
            <Card>
              <CardHeader title={<span className="inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-accent" aria-hidden="true" /> Why you are seeing this</span>} />
              <CardBody>
                <ul className="space-y-2 text-base">
                  {data.matches.map(match => (
                    <li key={match.listId}>
                      <span className="text-muted">Matches your alert on </span>
                      <Link href={`/dashboard/watchlists/${match.listId}`} className="font-medium text-ink hover:text-accent">
                        {match.listName}
                      </Link>
                      <span className="text-muted">: {match.explanation}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Job description" description={job.description ? undefined : 'The company did not publish a description we could read. Open the posting for full details.'} />
            {job.description && (
              <CardBody>
                <div className="whitespace-pre-line text-base leading-7 text-ink">{job.description}</div>
              </CardBody>
            )}
          </Card>

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-1.5"><History className="h-4 w-4 text-subtle" aria-hidden="true" /> History</span>} />
            <CardBody>
              <ol className="relative space-y-4 border-l border-line pl-5">
                {data.history.map((event, index) => (
                  <li key={index} className="relative">
                    <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-line-strong ring-4 ring-surface" aria-hidden="true" />
                    <p className="text-base font-medium text-ink">{EVENT_LABELS[event.type] ?? event.type}</p>
                    <p className="text-sm text-muted">{formatDateTime(event.createdAt)}</p>
                    {event.changes && (
                      <ul className="mt-1.5 space-y-0.5 text-sm text-muted">
                        {Object.entries(event.changes).map(([field, change]) => (
                          <li key={field}>
                            {FIELD_LABELS[field] ?? field}: {change.from ? <span className="line-through">{String(change.from)}</span> : null}
                            {change.from ? ' → ' : ''}
                            <span className="text-ink">{String(change.to ?? '—')}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Your tracker" description={data.tracking ? undefined : 'Save this job to track your application.'} />
            <CardBody className="space-y-4">
              <Field label="Status">
                {ids => (
                  <Select {...ids} value={tracking.status === 'dismissed' ? '' : tracking.status} onChange={event => setTracking({ ...tracking, status: event.target.value })}>
                    <option value="">Not tracked</option>
                    {TRACKER_STATUSES.map(status => (
                      <option key={status} value={status}>
                        {USER_JOB_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {tracking.status && tracking.status !== 'dismissed' && (
                <>
                  <Field label="Applied on" optional>
                    {ids => <Input {...ids} type="date" value={tracking.appliedAt} onChange={event => setTracking({ ...tracking, appliedAt: event.target.value })} />}
                  </Field>
                  <Field label="Remind me" optional hint="You will get a notification (and an email if alerts are on).">
                    {ids => <Input {...ids} type="datetime-local" value={tracking.reminderAt} onChange={event => setTracking({ ...tracking, reminderAt: event.target.value })} />}
                  </Field>
                  <Field label="Notes" optional>
                    {ids => <Textarea {...ids} rows={4} value={tracking.notes} onChange={event => setTracking({ ...tracking, notes: event.target.value })} placeholder="Referral, recruiter name, interview dates…" />}
                  </Field>
                </>
              )}
              <div className="flex gap-2">
                <Button variant="primary" loading={saving} onClick={() => save((tracking.status || null) as UserJobStatus | null)}>
                  Save
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted">Found by JobPingly</span>
                <TimeAgo value={job.firstSeenAt} className="text-ink" />
              </div>
              {job.postedAt && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Posted</span>
                  <span className="text-ink">{formatDate(job.postedAt)}</span>
                </div>
              )}
              {job.deadlineAt && (
                <div className="flex justify-between gap-3">
                  <span className="inline-flex items-center gap-1 text-muted">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Apply by
                  </span>
                  <span className="text-ink">{formatDate(job.deadlineAt)}</span>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <span className="text-muted">Last seen open</span>
                <TimeAgo value={job.lastSeenAt} className="text-ink" />
              </div>
              <div className="border-t border-line pt-2.5">
                <Link href={`/dashboard/jobs?view=all&company=${company.id}`} className="font-medium text-accent hover:text-accent-hover">
                  All {formatNumber(company.openJobs)} open jobs at {company.name}
                </Link>
              </div>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
