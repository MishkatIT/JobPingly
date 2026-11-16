'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, BellOff, CalendarClock, Check, Clock, Mail, Plus } from 'lucide-react';
import { AddCompanyDialog } from '@/components/app/add-company-dialog';
import { HealthStatus, TimeAgo } from '@/components/app/bits';
import { useSession } from '@/components/app/session';
import { Button, LinkButton } from '@/components/ui/button';
import { Callout, Card, CardBody, CardHeader, ErrorState, PageHeader, Skeleton, StatCell, StatGrid } from '@/components/ui/primitives';
import { cn } from '@/lib/client/cn';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';

interface Overview {
  counts: {
    watchlists: number;
    companies: number;
    openJobs: number;
    newThisWeek: number;
    matchingThisWeek: number;
    saved: number;
    applied: number;
    interviewing: number;
    companiesWithIssues: number;
    pendingFirstScan: number;
    lastScanAt: string | null;
    nextScanAt: string | null;
  };
  recentMatches: { id: string; title: string; location: string | null; firstSeenAt: string; terms: string[]; companyName: string }[];
  issues: { id: string; name: string; status: string; lastErrorClass: string | null }[];
  reminders: { id: string; reminderAt: string; title: string; companyName: string; status: string }[];
  notifications: { emailEnabled: boolean; approval: string; schedule: string; nextAt: string | null; platformEmailEnabled: boolean };
}

export default function OverviewPage() {
  const { user } = useSession();
  const [addOpen, setAddOpen] = useState(false);
  const { data, error, isLoading, mutate } = useApi<Overview>('/api/me/overview', { refreshInterval: 120_000 });

  if (error) return <ErrorState description="Your overview could not be loaded." onRetry={() => mutate()} />;

  const counts = data?.counts;
  const firstName = user.name?.split(/\s+/)[0];
  const setupSteps = data
    ? [
        { done: counts!.watchlists > 0, label: 'Create a watchlist', href: '/dashboard/watchlists' },
        { done: counts!.companies > 0, label: 'Add the companies you want to work for', action: () => setAddOpen(true) },
        { done: data.recentMatches.length > 0 || counts!.matchingThisWeek > 0, label: 'Set the keywords you care about', href: '/dashboard/watchlists' },
        { done: data.notifications.emailEnabled, label: 'Choose when you get emails', href: '/dashboard/settings/notifications' },
      ]
    : [];
  const showSetup = data && counts!.companies === 0;

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : 'Overview'}
        description="What changed at the companies you watch."
        actions={
          <>
            <LinkButton href="/dashboard/jobs" variant="secondary">
              Browse jobs
            </LinkButton>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
              Add company
            </Button>
          </>
        }
      />

      {showSetup && (
        <Card className="mb-6">
          <CardHeader title="Get set up" description="Four quick steps and JobPingly takes it from here." />
          <CardBody>
            <ol className="space-y-2.5">
              {setupSteps.map((step, index) => (
                <li key={step.label} className="flex items-center gap-3">
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                      step.done ? 'border-success bg-success text-white' : 'border-line-strong text-muted',
                    )}
                    aria-hidden="true"
                  >
                    {step.done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  {step.done ? (
                    <span className="text-base text-muted line-through">{step.label}</span>
                  ) : step.href ? (
                    <Link href={step.href} className="text-base font-medium text-ink hover:text-accent">
                      {step.label}
                    </Link>
                  ) : (
                    <button type="button" onClick={step.action} className="text-base font-medium text-ink hover:text-accent">
                      {step.label}
                    </button>
                  )}
                  <span className="sr-only">{step.done ? '(done)' : '(to do)'}</span>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      )}

      {data && !data.notifications.platformEmailEnabled && (
        <Callout tone="warning" className="mb-6" title="Email alerts are paused by the administrator">
          Matches still appear here and in your notifications.
        </Callout>
      )}
      {data && data.notifications.approval === 'pending' && data.notifications.emailEnabled && (
        <Callout tone="accent" className="mb-6" title="Your email address is waiting for approval">
          Alerts are collected and will be emailed as soon as an administrator approves your address. Matches already appear here.
        </Callout>
      )}

      <StatGrid>
        {isLoading || !counts ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2 bg-surface p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-14" />
            </div>
          ))
        ) : (
          <>
            <StatCell label="Matching jobs this week" value={formatNumber(counts.matchingThisWeek)} hint={<Link href="/dashboard/jobs?view=matching" className="hover:text-ink">View matches</Link>} />
            <StatCell label="New jobs this week" value={formatNumber(counts.newThisWeek)} hint="At all your companies" />
            <StatCell label="Open jobs" value={formatNumber(counts.openJobs)} hint={`At ${formatNumber(counts.companies)} companies`} />
            <StatCell
              label="Companies with issues"
              value={formatNumber(counts.companiesWithIssues)}
              tone={counts.companiesWithIssues > 0 ? 'warning' : undefined}
              hint={counts.pendingFirstScan > 0 ? `${counts.pendingFirstScan} waiting for first scan` : 'All others healthy'}
            />
          </>
        )}
      </StatGrid>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Latest matches"
            description="New jobs that fit your alert keywords."
            action={
              <Link href="/dashboard/jobs?view=matching" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-hover">
                All matches <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            }
          />
          {isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-10" />
              ))}
            </div>
          ) : data && data.recentMatches.length > 0 ? (
            <ul className="divide-y divide-line">
              {data.recentMatches.map(job => (
                <li key={job.id}>
                  <Link href={`/dashboard/jobs/${job.id}`} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-sunken/50 sm:px-5">
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium text-ink">{job.title}</p>
                      <p className="mt-0.5 truncate text-sm text-muted">
                        {job.companyName}
                        {job.location ? ` · ${job.location}` : ''}
                        {job.terms.length > 0 ? ` · matched ${job.terms.slice(0, 2).join(', ')}` : ''}
                      </p>
                    </div>
                    <TimeAgo value={job.firstSeenAt} className="shrink-0 text-xs text-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-10 text-center">
              <p className="text-base font-medium text-ink">No matches yet</p>
              <p className="mt-1 text-sm text-muted">
                {counts && counts.companies > 0
                  ? 'New jobs that fit your keywords will appear here. You can browse every open job in the meantime.'
                  : 'Add a few companies to start receiving matches.'}
              </p>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Monitoring" action={<Link href="/dashboard/companies" className="text-sm font-medium text-accent hover:text-accent-hover">Companies</Link>} />
            <CardBody className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-muted">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Last successful check
                </span>
                <span className="text-ink">{counts?.lastScanAt ? formatRelative(counts.lastScanAt) : '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-muted">
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Next check
                </span>
                <span className="text-ink">{counts?.nextScanAt ? formatRelative(counts.nextScanAt) : '—'}</span>
              </div>
              {data && data.issues.length > 0 && (
                <ul className="space-y-2 border-t border-line pt-3">
                  {data.issues.map(issue => (
                    <li key={issue.id} className="flex items-center justify-between gap-3">
                      <Link href={`/dashboard/companies/${issue.id}`} className="truncate font-medium text-ink hover:text-accent">
                        {issue.name}
                      </Link>
                      <HealthStatus health={issue.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Email alerts" action={<Link href="/dashboard/settings/notifications" className="text-sm font-medium text-accent hover:text-accent-hover">Change</Link>} />
            <CardBody className="text-sm">
              {data ? (
                data.notifications.emailEnabled ? (
                  <div className="space-y-1.5">
                    <p className="inline-flex items-center gap-1.5 text-ink">
                      <Mail className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                      {data.notifications.schedule}
                    </p>
                    {data.notifications.nextAt && <p className="text-muted">Next delivery {formatDateTime(data.notifications.nextAt)} (only if there are new matches)</p>}
                  </div>
                ) : (
                  <p className="inline-flex items-center gap-1.5 text-muted">
                    <BellOff className="h-3.5 w-3.5" aria-hidden="true" /> Email alerts are off. Matches still appear in the app.
                  </p>
                )
              ) : (
                <Skeleton className="h-4 w-3/4" />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Applications" action={<Link href="/dashboard/tracker" className="text-sm font-medium text-accent hover:text-accent-hover">Tracker</Link>} />
            <CardBody>
              <dl className="grid grid-cols-3 gap-3 text-center">
                {[
                  ['Saved', counts?.saved],
                  ['Applied', counts?.applied],
                  ['Interviewing', counts?.interviewing],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dd className="tabular text-xl font-semibold text-ink">{value === undefined ? '—' : formatNumber(value as number)}</dd>
                    <dt className="text-xs text-muted">{label}</dt>
                  </div>
                ))}
              </dl>
              {data && data.reminders.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
                  {data.reminders.map(reminder => (
                    <li key={reminder.id} className="flex items-center justify-between gap-3">
                      <span className="truncate text-ink">
                        {reminder.title} <span className="text-muted">· {reminder.companyName}</span>
                      </span>
                      <span className="shrink-0 text-xs text-subtle">{formatRelative(reminder.reminderAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <AddCompanyDialog open={addOpen} onClose={() => setAddOpen(false)} onAdded={() => mutate()} />
    </>
  );
}
