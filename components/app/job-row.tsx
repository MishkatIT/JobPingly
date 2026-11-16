'use client';

import Link from 'next/link';
import { Bookmark, BookmarkCheck, EyeOff, ExternalLink, RotateCcw } from 'lucide-react';
import { IconButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/primitives';
import { cn } from '@/lib/client/cn';
import { USER_JOB_STATUS_LABELS, type UserJobStatus } from '@/lib/constants';
import { isSafeHref } from '@/lib/security/ssrf-client';
import { CompanyAvatar, JobFacets, TimeAgo } from './bits';

export interface FeedJob {
  id: string;
  title: string;
  url: string | null;
  location: string | null;
  department: string | null;
  workplaceType: string | null;
  employmentType: string | null;
  seniority: string | null;
  salaryText: string | null;
  postedAt: string | null;
  firstSeenAt: string;
  status: string;
  closedAt: string | null;
  company: { id: string; name: string; url: string; logoUrl: string | null };
  userStatus: string | null;
  matched: boolean;
  matchedTerms: string[];
}

export function JobRow({ job, onSetStatus, busy }: { job: FeedJob; onSetStatus: (job: FeedJob, status: UserJobStatus | null) => void; busy?: boolean }) {
  const tracked = job.userStatus && job.userStatus !== 'dismissed';
  const dismissed = job.userStatus === 'dismissed';
  const closed = job.status === 'closed';

  return (
    <li className={cn('group flex gap-3 px-4 py-3.5 sm:px-5', busy && 'opacity-60')}>
      <CompanyAvatar name={job.company.name} logoUrl={job.company.logoUrl} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={`/dashboard/jobs/${job.id}`} className="text-base font-medium text-ink hover:text-accent">
            {job.title}
          </Link>
          {closed && <Badge tone="neutral">Closed</Badge>}
          {tracked && <Badge tone="accent">{USER_JOB_STATUS_LABELS[job.userStatus as UserJobStatus] ?? job.userStatus}</Badge>}
        </div>
        <p className="mt-0.5 text-sm text-muted">
          <Link href={`/dashboard/companies/${job.company.id}`} className="hover:text-ink">
            {job.company.name}
          </Link>
          {job.location ? ` · ${job.location}` : ''}
          {job.department ? ` · ${job.department}` : ''}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <JobFacets workplaceType={job.workplaceType} employmentType={job.employmentType} seniority={job.seniority} />
          {job.salaryText && <span className="text-sm text-ink">{job.salaryText}</span>}
          {job.matchedTerms.length > 0 && (
            <span className="text-xs text-muted">
              Matched <span className="font-medium text-ink">{job.matchedTerms.slice(0, 3).join(', ')}</span>
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        <TimeAgo value={job.firstSeenAt} prefix="Found " className="text-xs text-subtle" />
        <div className="flex items-center gap-0.5">
          {dismissed ? (
            <IconButton label="Restore to feed" size="sm" onClick={() => onSetStatus(job, null)}>
              <RotateCcw className="h-4 w-4" />
            </IconButton>
          ) : (
            <>
              <IconButton
                label={tracked ? 'Remove from tracker' : 'Save to tracker'}
                size="sm"
                onClick={() => onSetStatus(job, tracked ? null : 'saved')}
                className={tracked ? 'text-accent' : undefined}
              >
                {tracked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
              </IconButton>
              <IconButton label="Not interested" size="sm" onClick={() => onSetStatus(job, 'dismissed')}>
                <EyeOff className="h-4 w-4" />
              </IconButton>
            </>
          )}
          {isSafeHref(job.url) && (
            <a
              href={job.url!}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open the posting for ${job.title} on the company site`}
              title="Open the posting"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-sunken hover:text-ink"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}
