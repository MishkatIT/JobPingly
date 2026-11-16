'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, ExternalLink, Plus, RefreshCw, Search } from 'lucide-react';
import { AddCompanyDialog } from '@/components/app/add-company-dialog';
import { CompanyAvatar, HealthStatus, TimeAgo } from '@/components/app/bits';
import { Button, IconButton } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Tabs } from '@/components/ui/overlay';
import { Badge, EmptyState, ErrorState, PageHeader, SkeletonRows } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage, qs } from '@/lib/client/api';
import { cn } from '@/lib/client/cn';
import { formatNumber, plural } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';
import { isSafeHref } from '@/lib/security/ssrf-client';

interface CompanyRow {
  id: string;
  url: string;
  name: string;
  logoUrl: string | null;
  adapter: string | null;
  health: string;
  healthLabel: string;
  issue: { label: string; hint: string } | null;
  lastSuccessAt: string | null;
  nextCheckAt: string | null;
  openJobs: number;
  newThisWeek: number;
  lists: { id: string; name: string; canEdit: boolean }[];
}

type HealthFilter = 'all' | 'issues' | 'active' | 'pending';
const FILTERS: { value: HealthFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'issues', label: 'Needs attention' },
  { value: 'active', label: 'Healthy' },
  { value: 'pending', label: 'Waiting for first scan' },
];

function matchesFilter(company: CompanyRow, filter: HealthFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'issues') return company.health === 'degraded' || company.health === 'broken' || company.health === 'paused';
  return company.health === filter;
}

function CompaniesView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const listFilter = params.get('list') ?? '';
  const healthParam = params.get('health') as HealthFilter | null;
  const health: HealthFilter = FILTERS.some(item => item.value === healthParam) ? healthParam! : 'all';
  const focus = params.get('focus');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const focusRef = useRef<HTMLLIElement>(null);

  const { data, error, isLoading, mutate } = useApi<CompanyRow[]>(`/api/companies${qs({ list: listFilter })}`, { refreshInterval: 120_000 });
  const { data: lists } = useApi<{ id: string; name: string }[]>('/api/lists');

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('focus');
    router.replace(`${pathname}${next.toString() ? `?${next}` : ''}`, { scroll: false });
  };

  const counts = useMemo(() => {
    const result: Record<HealthFilter, number> = { all: 0, issues: 0, active: 0, pending: 0 };
    for (const company of data ?? []) for (const filter of FILTERS) if (matchesFilter(company, filter.value)) result[filter.value]++;
    return result;
  }, [data]);

  const companies = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? []).filter(company => matchesFilter(company, health) && (!term || company.name.toLowerCase().includes(term) || company.url.toLowerCase().includes(term)));
  }, [data, health, search]);

  useEffect(() => {
    if (focus && data) focusRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focus, data]);

  const rescan = async (company: CompanyRow) => {
    setChecking(company.id);
    try {
      const result = await api<{ alreadyQueued: boolean }>(`/api/companies/${company.id}/rescan`, { method: 'POST', body: {} });
      toast.success(result.alreadyQueued ? `${company.name} is already queued for a check` : `Checking ${company.name} now`, 'Results appear within a few minutes.');
      await mutate();
    } catch (err) {
      toast.error('Could not start a check', errorMessage(err));
    } finally {
      setChecking(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Companies"
        description="Every company on your watchlists and the state of its monitoring."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
            Add company
          </Button>
        }
      />

      <Tabs label="Filter by monitoring status" value={health} onChange={value => update({ health: value === 'all' ? null : value })} options={FILTERS.map(item => ({ ...item, count: data ? counts[item.value] : null }))} />

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative w-full sm:max-w-sm">
          <span className="sr-only">Search companies</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name or link" className="pl-9" />
        </label>
        <label className="sm:w-64">
          <span className="sr-only">Watchlist</span>
          <Select value={listFilter} onChange={event => update({ list: event.target.value || null })}>
            <option value="">All watchlists</option>
            {(lists ?? []).map(list => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface">
        {error ? (
          <ErrorState description="Companies could not be loaded." onRetry={() => mutate()} />
        ) : isLoading ? (
          <SkeletonRows rows={6} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={<Building2 />}
            title={listFilter ? 'No companies on this watchlist' : 'No companies yet'}
            description="Add a company's careers page and JobPingly starts checking it for new jobs."
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                Add a company
              </Button>
            }
          />
        ) : companies.length === 0 ? (
          <EmptyState title={search ? 'No companies match your search' : health === 'issues' ? 'Nothing needs attention' : 'No companies here'} description={health === 'issues' && !search ? 'Every company was checked successfully.' : undefined} />
        ) : (
          <ul className="divide-y divide-line">
            {companies.map(company => {
              const canEdit = company.lists.some(list => list.canEdit);
              const focused = company.id === focus;
              return (
                <li key={company.id} ref={focused ? focusRef : undefined} className={cn('flex flex-col gap-3 px-4 py-3.5 sm:px-5 lg:flex-row lg:items-center', focused && 'bg-accent-soft/60')}>
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <CompanyAvatar name={company.name} logoUrl={company.logoUrl} className="mt-0.5" />
                    <div className="min-w-0">
                      <Link href={`/dashboard/companies/${company.id}`} className="text-base font-medium text-ink hover:text-accent">
                        {company.name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <HealthStatus health={company.health} label={company.healthLabel} />
                        {company.issue && company.health !== 'active' && (
                          <span className="text-sm text-muted" title={company.issue.hint}>
                            {company.issue.label}
                          </span>
                        )}
                      </div>
                      {company.issue && company.health !== 'active' && <p className="mt-1 max-w-prose text-sm text-muted">{company.issue.hint}</p>}
                      {company.lists.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {company.lists.slice(0, 4).map(list => (
                            <Link key={list.id} href={`/dashboard/watchlists/${list.id}`}>
                              <Badge tone="outline" className="hover:border-ink hover:text-ink">
                                {list.name}
                              </Badge>
                            </Link>
                          ))}
                          {company.lists.length > 4 && <Badge tone="neutral">+{company.lists.length - 4}</Badge>}
                        </div>
                      )}
                    </div>
                  </div>
                  <dl className="flex shrink-0 gap-6 pl-11 text-sm lg:pl-0">
                    <div className="w-16">
                      <dt className="text-xs text-muted">Open jobs</dt>
                      <dd className="tabular font-medium text-ink">
                        <Link href={`/dashboard/jobs?view=all&company=${company.id}`} className="hover:text-accent">
                          {formatNumber(company.openJobs)}
                        </Link>
                      </dd>
                    </div>
                    <div className="w-16">
                      <dt className="text-xs text-muted">This week</dt>
                      <dd className="tabular font-medium text-ink">{formatNumber(company.newThisWeek)}</dd>
                    </div>
                    <div className="w-24">
                      <dt className="text-xs text-muted">Last checked</dt>
                      <dd className="text-ink">
                        <TimeAgo value={company.lastSuccessAt} />
                      </dd>
                    </div>
                  </dl>
                  <div className="flex shrink-0 items-center gap-0.5 pl-11 lg:pl-0">
                    {canEdit && (
                      <IconButton label={`Check ${company.name} now`} size="sm" loading={checking === company.id} onClick={() => rescan(company)}>
                        <RefreshCw className="h-4 w-4" />
                      </IconButton>
                    )}
                    {isSafeHref(company.url) && (
                      <a
                        href={company.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open the careers page of ${company.name}`}
                        title="Open the careers page"
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-sunken hover:text-ink"
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {data && data.length > 0 && <p className="mt-2 text-sm text-muted">{plural(companies.length, 'company', 'companies')} shown</p>}

      <AddCompanyDialog open={adding} onClose={() => setAdding(false)} defaultListId={listFilter || undefined} onAdded={() => mutate()} />
    </>
  );
}

export default function CompaniesPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={6} />}>
      <CompaniesView />
    </Suspense>
  );
}
