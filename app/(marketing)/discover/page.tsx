import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, Search, Star, Users } from 'lucide-react';
import { UserAvatar } from '@/components/app/bits';
import { LinkButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/primitives';
import { formatNumber, plural } from '@/lib/client/format';
import { cn } from '@/lib/client/cn';
import { DIRECTORY_SORTS, popularTags, publicDirectory, type DirectorySort } from '@/lib/public/directory';
import { getSetting } from '@/lib/settings/store';

export const metadata: Metadata = {
  title: 'Public watchlists',
  description: 'Curated lists of companies to follow for job alerts: browse, follow with your own keywords, or copy one as a starting point.',
};

const PAGE_SIZE = 24;
const SORT_LABELS: Record<DirectorySort, string> = { popular: 'Most followed', newest: 'Newest', companies: 'Most companies', jobs: 'Most open jobs' };

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.slice(0, 100) : '';
  const tag = typeof params.tag === 'string' ? params.tag.slice(0, 30) : '';
  const sort = (DIRECTORY_SORTS as readonly string[]).includes(String(params.sort)) ? (params.sort as DirectorySort) : 'popular';
  const page = Math.max(1, Math.min(500, Number(params.page) || 1));

  if (!(await getSetting('public_lists.enabled'))) {
    return (
      <div className="mx-auto max-w-content px-5 py-20 lg:px-8">
        <EmptyState title="The directory is not available right now" description="Public watchlists have been turned off by the site administrator." />
      </div>
    );
  }

  const [{ items, total }, tags] = await Promise.all([publicDirectory({ q: q || undefined, tag: tag || undefined, sort, page, pageSize: PAGE_SIZE }), popularTags(14)]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (overrides: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams();
    const merged = { q, tag, sort: sort === 'popular' ? '' : sort, page: '', ...overrides };
    for (const [key, value] of Object.entries(merged)) if (value) search.set(key, String(value));
    const text = search.toString();
    return text ? `/discover?${text}` : '/discover';
  };

  return (
    <div className="mx-auto max-w-content px-5 py-12 lg:px-8 lg:py-16">
      <div className="max-w-2xl">
        <h1 className="text-3xl sm:text-4xl">Public watchlists</h1>
        <p className="mt-3 text-md leading-7 text-muted">
          Lists of companies curated by JobPingly users. Follow one to get alerts with your own keywords, or copy it as a starting point for your own.
        </p>
      </div>

      <form action="/discover" method="get" className="mt-8 flex flex-col gap-3 sm:flex-row" role="search">
        <label className="relative flex-1">
          <span className="sr-only">Search watchlists</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by list name, description or company"
            className="h-10 w-full rounded-md border border-line-strong bg-surface pl-9 pr-3 text-md text-ink placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 sm:text-base"
          />
        </label>
        {tag && <input type="hidden" name="tag" value={tag} />}
        <label className="flex items-center gap-2 text-sm text-muted">
          <span>Sort</span>
          <select name="sort" defaultValue={sort} className="h-10 rounded-md border border-line-strong bg-surface px-3 text-base text-ink">
            {DIRECTORY_SORTS.map(option => (
              <option key={option} value={option}>
                {SORT_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-10 rounded-md bg-primary px-4 text-base font-medium text-primary-fg hover:bg-primary-hover">
          Search
        </button>
      </form>

      {tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Filter by tag">
          <Link href={href({ tag: '', page: '' })} className={cn('rounded-full border px-3 py-1 text-sm', !tag ? 'border-ink bg-ink text-canvas' : 'border-line text-muted hover:text-ink')}>
            All
          </Link>
          {tags.map(item => (
            <Link
              key={item.tag}
              href={href({ tag: item.tag, page: '' })}
              className={cn('rounded-full border px-3 py-1 text-sm', tag === item.tag ? 'border-ink bg-ink text-canvas' : 'border-line text-muted hover:text-ink')}
            >
              {item.tag}
            </Link>
          ))}
        </div>
      )}

      <p className="mt-8 text-sm text-muted" aria-live="polite">
        {plural(total, 'watchlist')}
        {q ? ` matching “${q}”` : ''}
        {tag ? ` tagged “${tag}”` : ''}
      </p>

      {items.length === 0 ? (
        <EmptyState
          className="mt-6 rounded-lg border border-dashed border-line"
          icon={<Search />}
          title={q || tag ? 'No watchlists match' : 'No public watchlists yet'}
          description={q || tag ? 'Try a different search, or clear the filters.' : 'When people publish a watchlist it appears here.'}
          action={
            q || tag ? (
              <LinkButton href="/discover">Clear filters</LinkButton>
            ) : (
              <LinkButton href="/register" variant="primary">
                Create the first one
              </LinkButton>
            )
          }
        />
      ) : (
        <ul className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map(list => (
            <li key={list.id}>
              <Link href={`/lists/${list.slug}`} className="group flex h-full flex-col rounded-lg border border-line bg-surface p-5 transition-colors hover:border-line-strong">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-md font-semibold text-ink group-hover:text-accent">{list.name}</h2>
                  {list.featured && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">
                      <Star className="h-3 w-3" aria-hidden="true" /> Featured
                    </span>
                  )}
                </div>
                {list.description && <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-muted">{list.description}</p>}
                {list.topCompanies.length > 0 && (
                  <p className="mt-3 line-clamp-1 text-sm text-ink">
                    {list.topCompanies.join(', ')}
                    {list.companies > list.topCompanies.length ? ` and ${list.companies - list.topCompanies.length} more` : ''}
                  </p>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4 text-sm text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {plural(list.companies, 'company', 'companies')}
                  </span>
                  <span>{formatNumber(list.openJobs)} open jobs</span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatNumber(list.followers)}
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-sm text-muted">
                  <UserAvatar name={list.owner.name} src={list.owner.avatarUrl} size="sm" />
                  <span className="truncate">{list.owner.name ?? 'A JobPingly user'}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-between text-sm">
          {page > 1 ? <LinkButton href={href({ page: page - 1 })}>Previous</LinkButton> : <span />}
          <span className="text-muted">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? <LinkButton href={href({ page: page + 1 })}>Next</LinkButton> : <span />}
        </nav>
      )}
    </div>
  );
}
