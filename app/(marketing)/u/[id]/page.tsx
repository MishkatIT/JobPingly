import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { UserAvatar } from '@/components/app/bits';
import { formatDate, plural } from '@/lib/client/format';
import { publicProfile } from '@/lib/public/directory';
import { isSafeHref } from '@/lib/security/ssrf-client';

const load = cache((id: string) => publicProfile(id));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const profile = await load((await params).id);
  return profile ? { title: `${profile.user.name ?? 'Curator'}'s watchlists` } : { title: 'Profile not found' };
}

const SOCIAL_LABELS: Record<string, string> = { website: 'Website', linkedin: 'LinkedIn', github: 'GitHub', twitter: 'X / Twitter' };

export default async function CuratorPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await load((await params).id);
  if (!profile) notFound();
  const { user, lists } = profile;
  const socials = Object.entries(user.socials as Record<string, string>).filter(([, url]) => isSafeHref(url));

  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <div className="flex items-center gap-4">
        <UserAvatar name={user.name} src={user.avatarUrl} size="lg" />
        <div>
          <h1 className="text-2xl">{user.name ?? 'A JobPingly user'}</h1>
          <p className="text-sm text-muted">Member since {formatDate(user.createdAt, { month: 'long', year: 'numeric' })}</p>
        </div>
      </div>
      {socials.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-3 text-sm">
          {socials.map(([key, url]) => (
            <li key={key}>
              <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:text-accent-hover">
                {SOCIAL_LABELS[key] ?? key}
              </a>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 text-lg">Public watchlists</h2>
      <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
        {lists.map(list => (
          <li key={list.id} className="px-4 py-3.5">
            <Link href={`/lists/${list.slug}`} className="text-base font-medium text-ink hover:text-accent">
              {list.name}
            </Link>
            {list.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{list.description}</p>}
            <p className="mt-1 text-xs text-subtle">
              {plural(list.companies, 'company', 'companies')} · {plural(list.followers, 'follower')}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
