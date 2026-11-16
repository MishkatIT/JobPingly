'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BellOff, Globe, ListChecks, Lock, Pin, Plus, Search, Users } from 'lucide-react';
import { CreateListDialog } from '@/components/app/create-list-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { Badge, Callout, EmptyState, ErrorState, PageHeader, SkeletonRows } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/client/api';
import { formatNumber, plural } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';
import { formatFrequencyShortLabel } from '@/lib/utils/frequency';

interface Watchlist {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  tags: string[];
  pinned: boolean;
  followers: number;
  relation: 'owner' | 'editor' | 'moderator' | 'follower';
  owner: { id: string; name: string | null };
  companies: number;
  openJobs: number;
  newThisWeek: number;
  issues: number;
  alerts: { enabled: boolean; frequency: string; summary: string } | null;
}

interface Invitation {
  id: string;
  listName: string;
  inviterName: string | null;
  role: string;
}

const GROUPS: { relation: Watchlist['relation'][]; title: string; description: string }[] = [
  { relation: ['owner'], title: 'Your watchlists', description: 'Lists you created.' },
  { relation: ['editor', 'moderator'], title: 'Shared with you', description: 'Lists you help maintain.' },
  { relation: ['follower'], title: 'Following', description: 'Public lists by other people. Your keywords apply only to you.' },
];

export default function WatchlistsPage() {
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<Watchlist[]>('/api/lists');
  const { data: invitations, mutate: refreshInvitations } = useApi<Invitation[]>('/api/me/invitations');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? []).filter(list => !term || list.name.toLowerCase().includes(term) || list.tags.some(tag => tag.includes(term)));
  }, [data, search]);

  const respond = async (invitation: Invitation, action: 'accept' | 'decline') => {
    try {
      await api(`/api/invitations/${invitation.id}`, { body: { action } });
      await Promise.all([refreshInvitations(), mutate()]);
      toast.success(action === 'accept' ? `You joined “${invitation.listName}”` : 'Invitation declined');
    } catch (err) {
      toast.error('Something went wrong', errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Watchlists"
        description="Groups of companies, each with its own alert keywords."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            New watchlist
          </Button>
        }
      />

      {invitations?.map(invitation => (
        <Callout key={invitation.id} tone="accent" className="mb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              <strong className="text-ink">{invitation.inviterName ?? 'Someone'}</strong> invited you to help maintain <strong className="text-ink">{invitation.listName}</strong> as{' '}
              {invitation.role === 'moderator' ? 'a moderator' : 'an editor'}.
            </span>
            <span className="flex gap-2">
              <Button size="sm" onClick={() => respond(invitation, 'decline')}>
                Decline
              </Button>
              <Button size="sm" variant="primary" onClick={() => respond(invitation, 'accept')}>
                Accept
              </Button>
            </span>
          </div>
        </Callout>
      ))}

      {data && data.length > 5 && (
        <label className="relative mb-4 block max-w-sm">
          <span className="sr-only">Search watchlists</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name or tag" className="pl-9" />
        </label>
      )}

      {error ? (
        <ErrorState description="Your watchlists could not be loaded." onRetry={() => mutate()} />
      ) : isLoading ? (
        <div className="rounded-lg border border-line bg-surface">
          <SkeletonRows rows={4} />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          className="rounded-lg border border-dashed border-line"
          icon={<ListChecks />}
          title="No watchlists yet"
          description="Create a watchlist for the companies you want to work for, or follow one of the public lists."
          action={
            <>
              <Link href="/discover" className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3.5 text-base font-medium text-ink shadow-xs hover:bg-sunken">
                Browse public lists
              </Link>
              <Button variant="primary" onClick={() => setCreating(true)}>
                Create a watchlist
              </Button>
            </>
          }
        />
      ) : (
        <div className="space-y-8">
          {GROUPS.map(group => {
            const lists = filtered.filter(list => group.relation.includes(list.relation));
            if (lists.length === 0) return null;
            return (
              <section key={group.title} aria-labelledby={`group-${group.title}`}>
                <h2 id={`group-${group.title}`} className="text-base font-semibold">
                  {group.title}
                </h2>
                <p className="text-sm text-muted">{group.description}</p>
                <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                  {lists.map(list => (
                    <li key={list.id}>
                      <Link href={`/dashboard/watchlists/${list.id}`} className="flex flex-col gap-3 px-4 py-4 hover:bg-sunken/50 sm:flex-row sm:items-center sm:px-5">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {list.pinned && <Pin className="h-3.5 w-3.5 text-subtle" aria-label="Pinned" />}
                            <span className="text-base font-semibold text-ink">{list.name}</span>
                            {list.visibility === 'public' ? (
                              <Badge tone="outline">
                                <Globe className="h-3 w-3" aria-hidden="true" /> Public
                              </Badge>
                            ) : (
                              <Badge tone="outline">
                                <Lock className="h-3 w-3" aria-hidden="true" /> Private
                              </Badge>
                            )}
                            {list.issues > 0 && <Badge tone="warning">{plural(list.issues, 'issue')}</Badge>}
                          </div>
                          <p className="mt-1 truncate text-sm text-muted">
                            {list.relation === 'follower' ? `By ${list.owner.name ?? 'a JobPingly user'} · ` : ''}
                            {list.alerts ? (list.alerts.enabled ? `${list.alerts.summary} · ${formatFrequencyShortLabel(list.alerts.frequency)}` : 'Alerts off') : 'No alerts set'}
                          </p>
                        </div>
                        <dl className="grid shrink-0 grid-cols-3 gap-6 text-sm sm:w-auto">
                          <div>
                            <dt className="text-xs text-muted">Companies</dt>
                            <dd className="tabular font-medium text-ink">{formatNumber(list.companies)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted">Open jobs</dt>
                            <dd className="tabular font-medium text-ink">{formatNumber(list.openJobs)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted">New this week</dt>
                            <dd className="tabular font-medium text-ink">{formatNumber(list.newThisWeek)}</dd>
                          </div>
                        </dl>
                        {list.visibility === 'public' && list.relation === 'owner' && (
                          <span className="hidden shrink-0 items-center gap-1 text-xs text-muted lg:inline-flex">
                            <Users className="h-3 w-3" aria-hidden="true" />
                            {list.followers}
                          </span>
                        )}
                        {list.alerts && !list.alerts.enabled && <BellOff className="hidden h-4 w-4 shrink-0 text-subtle sm:block" aria-label="Alerts off" />}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <CreateListDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
