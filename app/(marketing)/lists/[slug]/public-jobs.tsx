'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import { JobFacets, TimeAgo } from '@/components/app/bits';
import { Input } from '@/components/ui/form';
import { Pagination } from '@/components/ui/overlay';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/primitives';
import { qs } from '@/lib/client/api';
import { useApi } from '@/lib/client/use-api';
import { isSafeHref } from '@/lib/security/ssrf-client';

interface PublicJob {
  id: string;
  title: string;
  url: string | null;
  location: string | null;
  workplaceType: string | null;
  employmentType: string | null;
  firstSeenAt: string;
  company: { id: string; name: string };
}

export function PublicJobs({ slug }: { slug: string }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, meta, error, isLoading, isRefreshing, mutate } = useApi<PublicJob[]>(`/api/public/lists/${slug}/jobs${qs({ q: query, page, pageSize: 20 })}`);

  return (
    <div className="mt-3 rounded-lg border border-line bg-surface">
      <div className="border-b border-line p-3">
        <label className="relative block">
          <span className="sr-only">Search jobs</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search titles, companies or locations" className="pl-9" />
        </label>
      </div>
      {error ? (
        <ErrorState description="The jobs could not be loaded." onRetry={() => mutate()} />
      ) : isLoading ? (
        <SkeletonRows rows={6} />
      ) : !data || data.length === 0 ? (
        <EmptyState title={query ? 'No jobs match your search' : 'No open jobs right now'} description={query ? 'Try another word.' : 'Follow the list to hear when new ones are posted.'} />
      ) : (
        <ul className={`divide-y divide-line ${isRefreshing ? 'opacity-60' : ''}`}>
          {data.map(job => (
            <li key={job.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                {isSafeHref(job.url) ? (
                  <a href={job.url!} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-base font-medium text-ink hover:text-accent">
                    {job.title}
                    <ExternalLink className="h-3 w-3 text-subtle" aria-hidden="true" />
                  </a>
                ) : (
                  <span className="text-base font-medium text-ink">{job.title}</span>
                )}
                <p className="mt-0.5 text-sm text-muted">
                  {job.company.name}
                  {job.location ? ` · ${job.location}` : ''}
                </p>
                <JobFacets workplaceType={job.workplaceType} employmentType={job.employmentType} className="mt-1.5" />
              </div>
              <TimeAgo value={job.firstSeenAt} className="shrink-0 text-xs text-subtle" />
            </li>
          ))}
        </ul>
      )}
      {meta && (meta.total ?? 0) > 20 && (
        <Pagination page={page} totalPages={meta.totalPages ?? 1} total={meta.total ?? 0} pageSize={20} onChange={setPage} className="border-t border-line" />
      )}
    </div>
  );
}
