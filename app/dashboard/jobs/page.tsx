'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Briefcase, Search, SlidersHorizontal, X } from 'lucide-react';
import { useRevalidateWorkspace } from '@/components/app/add-company-dialog';
import { JobRow, type FeedJob } from '@/components/app/job-row';
import { Button, LinkButton } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Pagination, Tabs } from '@/components/ui/overlay';
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, qs, errorMessage } from '@/lib/client/api';
import { cn } from '@/lib/client/cn';
import { useApi } from '@/lib/client/use-api';
import { EMPLOYMENT_LABELS, SENIORITY_LABELS, WORKPLACE_LABELS, type UserJobStatus } from '@/lib/constants';

type View = 'matching' | 'new' | 'all' | 'closed' | 'dismissed';
const VIEWS: { value: View; label: string }[] = [
  { value: 'matching', label: 'Matching' },
  { value: 'new', label: 'New this week' },
  { value: 'all', label: 'All open' },
  { value: 'closed', label: 'Recently closed' },
  { value: 'dismissed', label: 'Dismissed' },
];
const PAGE_SIZE = 25;

function FacetChips<T extends string>({ label, options, value, onChange }: { label: string; options: Record<T, string>; value: string[]; onChange: (value: string[]) => void }) {
  return (
    <fieldset className="flex flex-wrap items-center gap-1.5">
      <legend className="sr-only">{label}</legend>
      <span className="mr-1 text-sm text-muted">{label}</span>
      {(Object.entries(options) as [T, string][]).map(([key, text]) => {
        const active = value.includes(key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? value.filter(item => item !== key) : [...value, key])}
            className={cn('h-7 rounded-full border px-2.5 text-sm transition-colors', active ? 'border-ink bg-ink text-canvas' : 'border-line text-muted hover:text-ink')}
          >
            {text}
          </button>
        );
      })}
    </fieldset>
  );
}

function JobsFeed() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const revalidate = useRevalidateWorkspace();

  const view = (VIEWS.some(item => item.value === params.get('view')) ? params.get('view') : 'matching') as View;
  const list = params.get('list') ?? '';
  const company = params.get('company') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const posted = params.get('posted') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const workplace = useMemo(() => (params.get('workplace') ?? '').split(',').filter(Boolean), [params]);
  const employment = useMemo(() => (params.get('employment') ?? '').split(',').filter(Boolean), [params]);
  const seniority = useMemo(() => (params.get('seniority') ?? '').split(',').filter(Boolean), [params]);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [showFilters, setShowFilters] = useState(workplace.length + employment.length + seniority.length > 0 || Boolean(posted));
  const [busyId, setBusyId] = useState<string | null>(null);

  const update = (changes: Record<string, string | string[] | number | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      const text = Array.isArray(value) ? value.join(',') : value === null ? '' : String(value);
      if (text) next.set(key, text);
      else next.delete(key);
    }
    if (!('page' in changes)) next.delete('page');
    router.replace(`${pathname}${next.toString() ? `?${next}` : ''}`, { scroll: false });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.get('q') ?? '') !== search.trim()) update({ q: search.trim() || null });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const query = qs({ view, q: params.get('q') ?? '', list, company, sort, posted, workplace, employment, seniority, page, pageSize: PAGE_SIZE, counts: 1 });
  const { data: jobs, meta, error, isLoading, isRefreshing, mutate } = useApi<FeedJob[]>(`/api/jobs${query}`);
  const { data: lists } = useApi<{ id: string; name: string }[]>('/api/lists');
  const counts = meta?.counts as Record<View, number> | undefined;
  const filtersActive = workplace.length + employment.length + seniority.length > 0 || Boolean(posted) || Boolean(list) || Boolean(company) || Boolean(params.get('q'));

  const setStatus = async (job: FeedJob, status: UserJobStatus | null) => {
    setBusyId(job.id);
    try {
      await api(`/api/jobs/${job.id}`, { method: 'PUT', body: { status } });
      await mutate();
      void revalidate();
      if (status === 'dismissed') toast.info('Hidden from your feed', undefined, { label: 'Undo', onClick: () => void setStatus({ ...job, userStatus: 'dismissed' }, null) });
      else if (status === 'saved') toast.success('Saved to your tracker');
    } catch (err) {
      toast.error('Could not update the job', errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader title="Jobs" description="Open jobs at every company on your watchlists." />

      <Tabs label="Job views" value={view} onChange={value => update({ view: value })} options={VIEWS.map(item => ({ ...item, count: counts?.[item.value] ?? null }))} />

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search jobs</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search title, company, location or team" className="pl-9" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Watchlist" value={list} onChange={event => update({ list: event.target.value || null })} className="w-44">
            <option value="">All watchlists</option>
            {(lists ?? []).map(item => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Sort" value={sort} onChange={event => update({ sort: event.target.value })} className="w-40">
            <option value="newest">Newest found</option>
            <option value="posted">Posted date</option>
            <option value="company">Company</option>
            <option value="title">Title</option>
          </Select>
          <Button icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setShowFilters(value => !value)} aria-expanded={showFilters}>
            Filters
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="mt-3 space-y-3 rounded-lg border border-line bg-surface p-4">
          <FacetChips label="Workplace" options={WORKPLACE_LABELS} value={workplace} onChange={value => update({ workplace: value })} />
          <FacetChips label="Type" options={EMPLOYMENT_LABELS} value={employment} onChange={value => update({ employment: value })} />
          <FacetChips label="Level" options={SENIORITY_LABELS} value={seniority} onChange={value => update({ seniority: value })} />
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Posted</span>
            <Select aria-label="Posted within" value={posted} onChange={event => update({ posted: event.target.value || null })} className="w-40">
              <option value="">Any time</option>
              <option value="1">Last 24 hours</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
            </Select>
          </div>
        </div>
      )}

      {filtersActive && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          {company && <span className="text-muted">Showing one company.</span>}
          <button
            type="button"
            onClick={() => {
              setSearch('');
              router.replace(`${pathname}?view=${view}`, { scroll: false });
            }}
            className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-hover"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear filters
          </button>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface">
        {error ? (
          <ErrorState description="Jobs could not be loaded." onRetry={() => mutate()} />
        ) : isLoading ? (
          <SkeletonRows rows={8} />
        ) : !jobs || jobs.length === 0 ? (
          <EmptyState
            icon={<Briefcase />}
            title={
              filtersActive
                ? 'No jobs match these filters'
                : view === 'matching'
                  ? 'No matching jobs yet'
                  : view === 'dismissed'
                    ? 'Nothing dismissed'
                    : view === 'closed'
                      ? 'No recently closed jobs'
                      : 'No jobs yet'
            }
            description={
              filtersActive
                ? 'Try removing a filter.'
                : view === 'matching'
                  ? 'Jobs that fit your alert keywords appear here. Check your keywords on each watchlist, or look at all open jobs.'
                  : 'Add companies to your watchlists and their open jobs will appear here.'
            }
            action={
              !filtersActive && view === 'matching' ? (
                <>
                  <LinkButton href="/dashboard/jobs?view=all">See all open jobs</LinkButton>
                  <LinkButton href="/dashboard/watchlists" variant="primary">
                    Edit alert keywords
                  </LinkButton>
                </>
              ) : undefined
            }
          />
        ) : (
          <ul className={cn('divide-y divide-line transition-opacity', isRefreshing && 'opacity-60')} aria-busy={isRefreshing}>
            {jobs.map(job => (
              <JobRow key={job.id} job={job} onSetStatus={setStatus} busy={busyId === job.id} />
            ))}
          </ul>
        )}
        {meta && (meta.total ?? 0) > PAGE_SIZE && (
          <Pagination page={page} totalPages={meta.totalPages ?? 1} total={meta.total ?? 0} pageSize={PAGE_SIZE} onChange={next => update({ page: next })} className="border-t border-line" />
        )}
      </div>
    </>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={8} />}>
      <JobsFeed />
    </Suspense>
  );
}
