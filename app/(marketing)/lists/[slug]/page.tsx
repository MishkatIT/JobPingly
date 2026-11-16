import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Building2, Users } from 'lucide-react';
import { CompanyAvatar, HealthStatus, UserAvatar } from '@/components/app/bits';
import { getServerSession } from '@/lib/auth/server';
import { formatDate, formatNumber, plural } from '@/lib/client/format';
import { publicListBySlug } from '@/lib/public/directory';
import { getSetting } from '@/lib/settings/store';
import { ListActions } from './list-actions';
import { PublicJobs } from './public-jobs';

const load = cache(async (slug: string) => {
  const session = await getServerSession();
  return { detail: await publicListBySlug(slug, session?.user.id ?? null), signedIn: Boolean(session) };
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { detail } = await load(slug);
  if (!detail) return { title: 'Watchlist not found' };
  const description =
    detail.list.description ||
    `${detail.companies.length} companies, ${detail.openJobs} open jobs. Follow this watchlist on JobPingly to get alerts when they post jobs that match you.`;
  return {
    title: detail.list.name,
    description,
    alternates: { canonical: `/lists/${detail.list.slug}` },
    openGraph: { title: `${detail.list.name} · JobPingly`, description, type: 'website' },
  };
}

export default async function PublicListPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(await getSetting('public_lists.enabled'))) notFound();
  const { detail, signedIn } = await load(slug);
  if (!detail) notFound();
  const { list, owner, companies, viewer } = detail;

  return (
    <div className="mx-auto max-w-content px-5 py-12 lg:px-8 lg:py-14">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/discover" className="hover:text-ink">
          Public watchlists
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">{list.name}</span>
      </nav>

      <header className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-3xl sm:text-4xl">{list.name}</h1>
          {list.description && <p className="mt-3 text-md leading-7 text-muted">{list.description}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
            <Link href={`/u/${owner.id}`} className="inline-flex items-center gap-2 hover:text-ink">
              <UserAvatar name={owner.name} src={owner.avatarUrl} size="sm" />
              {owner.name ?? 'A JobPingly user'}
            </Link>
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
              {plural(companies.length, 'company', 'companies')}
            </span>
            <span>{formatNumber(detail.openJobs)} open jobs</span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {plural(list.followers, 'follower')}
            </span>
            <span>Updated {formatDate(list.updatedAt)}</span>
          </div>
          {list.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {list.tags.map(tag => (
                <Link key={tag} href={`/discover?tag=${encodeURIComponent(tag)}`} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted hover:text-ink">
                  {tag}
                </Link>
              ))}
            </div>
          )}
        </div>
        <ListActions listId={list.id} slug={list.slug} name={list.name} signedIn={signedIn} isFollowing={viewer.isFollowing} isOwner={viewer.role === 'owner'} canEdit={viewer.canEdit} />
      </header>

      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <section aria-labelledby="companies-heading">
          <h2 id="companies-heading" className="text-lg">
            Companies
          </h2>
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
            {companies.map(company => (
              <li key={company.id} className="flex items-center gap-3 px-4 py-3">
                <CompanyAvatar name={company.name} logoUrl={company.logoUrl} />
                <div className="min-w-0 flex-1">
                  <a href={company.url} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-base font-medium text-ink hover:text-accent">
                    {company.name}
                  </a>
                  <HealthStatus health={company.health} label={company.health === 'active' ? undefined : company.healthLabel} className="text-xs text-muted" />
                </div>
                <span className="tabular shrink-0 text-sm text-muted">{plural(company.openJobs, 'open job')}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="jobs-heading">
          <h2 id="jobs-heading" className="text-lg">
            Open jobs
          </h2>
          <PublicJobs slug={list.slug} />
        </section>
      </div>
    </div>
  );
}
