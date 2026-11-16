'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, ExternalLink, Globe, Plus, RefreshCw } from 'lucide-react';
import { AddCompanyDialog } from '@/components/app/add-company-dialog';
import { CompanyAvatar, HealthStatus, TimeAgo } from '@/components/app/bits';
import { JobRow, type FeedJob } from '@/components/app/job-row';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge, Callout, Card, CardHeader, DetailRow, EmptyState, ErrorState, Skeleton, SkeletonRows, StatCell, StatGrid, Table, TableWrap, Td, Th, Tr } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/client/api';
import { formatDate, formatDateTime, formatNumber, hostOf } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';
import type { UserJobStatus } from '@/lib/constants';
import { isSafeHref } from '@/lib/security/ssrf-client';

interface CompanyDetail {
  company: {
    id: string;
    name: string;
    url: string;
    websiteUrl: string | null;
    logoUrl: string | null;
    industry: string | null;
    location: string | null;
    adapter: string | null;
    adapterLabel: string;
    lastSuccessAt: string | null;
    lastScrapedAt: string | null;
    nextCheckAt: string | null;
    health: string;
    healthLabel: string;
    issue: { label: string; hint: string } | null;
  };
  stats: { openJobs: number; newThisWeek: number; closedThisMonth: number; firstSeen: string | null };
  scans: { scrapedAt: string; outcome: string | null; jobsFound: number | null; jobsAdded: number | null; jobsRemoved: number | null; errorLabel: string | null }[];
  lists: { id: string; name: string; canEdit: boolean }[];
}

const OUTCOMES: Record<string, { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' }> = {
  success: { label: 'Updated', tone: 'success' },
  unchanged: { label: 'No changes', tone: 'neutral' },
  suspicious: { label: 'Held for review', tone: 'warning' },
  failed: { label: 'Failed', tone: 'danger' },
  skipped: { label: 'Skipped', tone: 'neutral' },
};

export default function CompanyPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<CompanyDetail>(`/api/companies/${id}`);
  const { data: jobs, meta, mutate: refreshJobs } = useApi<FeedJob[]>(`/api/jobs?view=all&company=${id}&pageSize=10`);
  const [checking, setChecking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busyJob, setBusyJob] = useState<string | null>(null);

  if (error) return <ErrorState title="Company not found" description="It may have been removed from your watchlists." />;
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-20" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { company, stats, scans, lists } = data;
  const canEdit = lists.some(list => list.canEdit);
  const totalJobs = Number(meta?.total ?? stats.openJobs);

  const rescan = async () => {
    setChecking(true);
    try {
      const result = await api<{ alreadyQueued: boolean }>(`/api/companies/${company.id}/rescan`, { method: 'POST', body: {} });
      toast.success(result.alreadyQueued ? 'Already queued for a check' : `Checking ${company.name} now`, 'Refresh this page in a few minutes to see the result.');
      await mutate();
    } catch (err) {
      toast.error('Could not start a check', errorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const setStatus = async (job: FeedJob, status: UserJobStatus | null) => {
    setBusyJob(job.id);
    try {
      await api(`/api/jobs/${job.id}`, { method: 'PUT', body: { status } });
      await refreshJobs();
    } catch (err) {
      toast.error('Could not update the job', errorMessage(err));
    } finally {
      setBusyJob(null);
    }
  };

  return (
    <>
      <Link href="/dashboard/companies" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Companies
      </Link>

      <header className="mt-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <CompanyAvatar name={company.name} logoUrl={company.logoUrl} size="lg" />
          <div className="min-w-0">
            <h1 className="text-2xl">{company.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <HealthStatus health={company.health} label={company.healthLabel} />
              <span>{company.adapterLabel}</span>
              {company.industry && <span>{company.industry}</span>}
              {company.location && <span>{company.location}</span>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {isSafeHref(company.websiteUrl) && (
            <LinkButton href={company.websiteUrl!} external variant="ghost" icon={<Globe className="h-4 w-4" />}>
              Website
            </LinkButton>
          )}
          {isSafeHref(company.url) && (
            <LinkButton href={company.url} external icon={<ExternalLink className="h-4 w-4" />}>
              Careers page
            </LinkButton>
          )}
          {canEdit ? (
            <Button variant="primary" loading={checking} onClick={rescan} icon={<RefreshCw className="h-4 w-4" />}>
              Check now
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setAdding(true)} icon={<Plus className="h-4 w-4" />}>
              Add to a watchlist
            </Button>
          )}
        </div>
      </header>

      {company.issue && company.health !== 'active' && (
        <Callout tone={company.health === 'broken' ? 'danger' : 'warning'} title={company.issue.label} className="mt-6">
          {company.issue.hint}
          {canEdit && ' If the company moved its jobs to another site, change the link from the watchlist’s company menu.'}
        </Callout>
      )}

      <StatGrid className="mt-6">
        <StatCell label="Open jobs" value={formatNumber(stats.openJobs)} />
        <StatCell label="New in the last 7 days" value={formatNumber(stats.newThisWeek)} />
        <StatCell label="Closed in the last 30 days" value={formatNumber(stats.closedThisMonth)} />
        <StatCell label="Tracked since" value={<span className="text-lg">{stats.firstSeen ? formatDate(stats.firstSeen) : '—'}</span>} />
      </StatGrid>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Open jobs"
            description={totalJobs > 10 ? `Showing the 10 most recent of ${formatNumber(totalJobs)}` : undefined}
            action={
              totalJobs > 0 ? (
                <Link href={`/dashboard/jobs?view=all&company=${company.id}`} className="text-sm font-medium text-accent hover:text-accent-hover">
                  See all
                </Link>
              ) : undefined
            }
          />
          {!jobs ? (
            <SkeletonRows rows={4} />
          ) : jobs.length === 0 ? (
            <EmptyState title="No open jobs right now" description="You will be alerted when a matching job is posted." />
          ) : (
            <ul className="divide-y divide-line">
              {jobs.map(job => (
                <JobRow key={job.id} job={job} busy={busyJob === job.id} onSetStatus={setStatus} />
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Monitoring" />
            <dl className="divide-y divide-line px-4 sm:px-5">
              <DetailRow label="Careers page">
                <span className="break-all">{hostOf(company.url)}</span>
              </DetailRow>
              <DetailRow label="Last successful check">
                <TimeAgo value={company.lastSuccessAt} />
              </DetailRow>
              <DetailRow label="Last attempt">
                <TimeAgo value={company.lastScrapedAt} />
              </DetailRow>
              <DetailRow label="Next check">{company.health === 'paused' ? 'Paused' : <TimeAgo value={company.nextCheckAt} />}</DetailRow>
            </dl>
          </Card>

          <Card>
            <CardHeader title="On your watchlists" />
            {lists.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">This company is on a public watchlist but not on any of yours.</p>
            ) : (
              <ul className="divide-y divide-line">
                {lists.map(list => (
                  <li key={list.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <Link href={`/dashboard/watchlists/${list.id}`} className="truncate text-base text-ink hover:text-accent">
                      {list.name}
                    </Link>
                    {!list.canEdit && <Badge tone="neutral">Following</Badge>}
                  </li>
                ))}
              </ul>
            )}
            {lists.length > 0 && (
              <div className="border-t border-line px-5 py-3">
                <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAdding(true)}>
                  Add to another watchlist
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card className="mt-6 overflow-hidden">
        <CardHeader title="Recent checks" description="The last ten times JobPingly read this careers page." />
        {scans.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">Not checked yet. The first check usually runs within a few minutes of adding a company.</p>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Result</Th>
                  <Th className="text-right">Jobs found</Th>
                  <Th className="text-right">New</Th>
                  <Th className="text-right">Closed</Th>
                </tr>
              </thead>
              <tbody>
                {scans.map((scan, index) => {
                  const outcome = OUTCOMES[scan.outcome ?? ''] ?? { label: scan.outcome ?? 'Unknown', tone: 'neutral' as const };
                  return (
                    <Tr key={`${scan.scrapedAt}-${index}`}>
                      <Td className="whitespace-nowrap text-sm">{formatDateTime(scan.scrapedAt)}</Td>
                      <Td>
                        <Badge tone={outcome.tone}>{outcome.label}</Badge>
                        {scan.errorLabel && <span className="ml-2 text-sm text-muted">{scan.errorLabel}</span>}
                      </Td>
                      <Td className="tabular text-right">{formatNumber(scan.jobsFound)}</Td>
                      <Td className="tabular text-right">{formatNumber(scan.jobsAdded)}</Td>
                      <Td className="tabular text-right">{formatNumber(scan.jobsRemoved)}</Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <AddCompanyDialog open={adding} onClose={() => setAdding(false)} defaultUrl={company.url} defaultName={company.name} onAdded={() => mutate()} />
    </>
  );
}
