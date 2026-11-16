'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { Ellipsis, ExternalLink, EyeOff, ListChecks, RotateCcw, Star, StarOff, Trash2 } from 'lucide-react';
import { RequirePermission, SearchInput } from '@/components/admin/bits';
import { UserLink, useUrlFilters } from '@/components/admin/ops-bits';
import { TimeAgo } from '@/components/app/bits';
import { useSession } from '@/components/app/session';
import { Dropdown, Pagination, Tabs, useConfirm, type MenuItem } from '@/components/ui/overlay';
import { Badge, EmptyState, ErrorState, PageHeader, SkeletonRows, Table, TableWrap, Td, Th, Tr } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage, qs } from '@/lib/client/api';
import { formatDate, formatNumber } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';

interface AdminList {
  id: string;
  name: string;
  slug: string;
  visibility: string;
  featuredAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string | null;
  companies: number;
  followers: number;
}

type State = 'active' | 'public' | 'featured' | 'trash';
type Action = 'feature' | 'unfeature' | 'make_private' | 'trash' | 'restore';

const STATES: { value: State; label: string }[] = [
  { value: 'active', label: 'All live' },
  { value: 'public', label: 'Public' },
  { value: 'featured', label: 'Featured' },
  { value: 'trash', label: 'Trash' },
];

const PAGE_SIZE = 25;

const DONE: Record<Action, string> = {
  feature: 'Featured on Discover',
  unfeature: 'No longer featured',
  make_private: 'Made private',
  trash: 'Moved to trash',
  restore: 'Restored',
};

function WatchlistsView() {
  const toast = useToast();
  const { can } = useSession();
  const { confirm, element: confirmElement } = useConfirm();
  const { params, update } = useUrlFilters();
  const stateParam = params.get('state') as State | null;
  const state: State = STATES.some(item => item.value === stateParam) ? stateParam! : 'active';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState(params.get('q') ?? '');

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.get('q') ?? '') !== search.trim()) update({ q: search.trim() || null });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const { data, meta, error, isLoading, mutate } = useApi<AdminList[]>(`/api/admin/lists${qs({ state, q: params.get('q') ?? '', page, pageSize: PAGE_SIZE })}`);

  const run = async (list: AdminList, action: Action) => {
    if (action === 'trash' || action === 'make_private') {
      const ok = await confirm({
        title: action === 'trash' ? `Move “${list.name}” to the trash?` : `Make “${list.name}” private?`,
        description:
          action === 'trash'
            ? 'It disappears for the owner and every follower, and alerts already queued for it are cancelled. It can be restored from the trash.'
            : 'Followers who are not members will no longer see it, and it leaves the public directory.',
        confirmLabel: action === 'trash' ? 'Move to trash' : 'Make private',
        tone: 'danger',
      });
      if (!ok) return;
    }
    try {
      await api(`/api/admin/lists/${list.id}`, { body: { action } });
      toast.success(DONE[action]);
      await mutate();
    } catch (err) {
      toast.error('Could not update the watchlist', errorMessage(err));
    }
  };

  const purge = async (list: AdminList) => {
    const ok = await confirm({
      title: 'Delete this watchlist permanently?',
      description: 'Its companies, followers, alert settings and history are removed for good. This cannot be undone.',
      confirmLabel: 'Delete permanently',
      tone: 'danger',
      typeToConfirm: list.name,
    });
    if (!ok) return;
    try {
      await api(`/api/admin/lists/${list.id}`, { method: 'DELETE' });
      toast.success('Watchlist deleted permanently');
      await mutate();
    } catch (err) {
      toast.error('Could not delete the watchlist', errorMessage(err));
    }
  };

  const menuFor = (list: AdminList): MenuItem[] => {
    const items: MenuItem[] = [];
    if (list.visibility === 'public' && !list.deletedAt) items.push({ label: 'Open public page', icon: <ExternalLink />, href: `/lists/${encodeURIComponent(list.slug)}` });
    if (can('lists.manage')) {
      if (list.deletedAt) {
        items.push({ label: 'Restore', icon: <RotateCcw />, onSelect: () => run(list, 'restore') });
      } else {
        if (list.visibility === 'public') {
          items.push(
            list.featuredAt
              ? { label: 'Stop featuring', icon: <StarOff />, onSelect: () => run(list, 'unfeature') }
              : { label: 'Feature on Discover', icon: <Star />, onSelect: () => run(list, 'feature') },
          );
          items.push({ label: 'Make private', icon: <EyeOff />, onSelect: () => run(list, 'make_private') });
        }
        items.push({ label: 'Move to trash', icon: <Trash2 />, tone: 'danger', separator: items.length > 0, onSelect: () => run(list, 'trash') });
      }
    }
    if (list.deletedAt && can('lists.delete')) items.push({ label: 'Delete permanently', icon: <Trash2 />, tone: 'danger', separator: true, onSelect: () => purge(list) });
    return items;
  };

  const total = Number(meta?.total ?? 0);

  return (
    <>
      <PageHeader title="Watchlists" description="Every watchlist on the platform. Feature good public lists on Discover; trash spam or abusive ones." />

      <Tabs label="Watchlist state" value={state} onChange={value => update({ state: value === 'active' ? null : value })} options={STATES} />

      <div className="mt-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name, slug or owner email" className="relative block w-full sm:max-w-sm" />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface">
        {error ? (
          <ErrorState description={errorMessage(error)} onRetry={() => mutate()} />
        ) : isLoading ? (
          <SkeletonRows rows={8} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={<ListChecks />}
            title={params.get('q') ? 'No watchlists match your search' : state === 'trash' ? 'The trash is empty' : state === 'featured' ? 'No featured watchlists' : 'No watchlists here'}
            description={state === 'featured' && !params.get('q') ? 'Feature a public watchlist from its menu to show it on the Discover page.' : undefined}
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Watchlist</Th>
                    <Th>Owner</Th>
                    <Th className="text-right">Companies</Th>
                    <Th className="text-right">Followers</Th>
                    <Th>{state === 'trash' ? 'Trashed' : 'Updated'}</Th>
                    <Th className="w-12">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(list => {
                    const items = menuFor(list);
                    return (
                      <Tr key={list.id}>
                        <Td>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {list.visibility === 'public' && !list.deletedAt ? (
                              <Link href={`/lists/${encodeURIComponent(list.slug)}`} className="font-medium text-ink hover:text-accent">
                                {list.name}
                              </Link>
                            ) : (
                              <span className="font-medium text-ink">{list.name}</span>
                            )}
                            <Badge tone="outline">{list.visibility === 'public' ? 'Public' : 'Private'}</Badge>
                            {list.featuredAt && <Badge tone="accent">Featured</Badge>}
                            {list.deletedAt && <Badge tone="danger">In trash</Badge>}
                          </div>
                          <p className="mt-0.5 text-xs text-subtle">Created {formatDate(list.createdAt)}</p>
                        </Td>
                        <Td className="max-w-[16rem]">
                          <UserLink id={can('users.read') ? list.ownerId : null}>
                            <span className="block truncate">{list.ownerName ?? list.ownerEmail}</span>
                          </UserLink>
                          {list.ownerName && <span className="block truncate text-xs text-muted">{list.ownerEmail}</span>}
                        </Td>
                        <Td className="tabular text-right">{formatNumber(list.companies)}</Td>
                        <Td className="tabular text-right">{formatNumber(list.followers)}</Td>
                        <Td className="whitespace-nowrap text-sm text-muted">
                          <TimeAgo value={list.deletedAt ?? list.updatedAt} />
                        </Td>
                        <Td>
                          {items.length > 0 && (
                            <Dropdown
                              label={`Actions for ${list.name}`}
                              triggerClassName="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-sunken hover:text-ink"
                              trigger={<Ellipsis className="h-4 w-4" aria-hidden="true" />}
                              items={items}
                            />
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
            <Pagination page={page} totalPages={Number(meta?.totalPages ?? 1)} total={total} pageSize={PAGE_SIZE} onChange={next => update({ page: next })} className="border-t border-line" />
          </>
        )}
      </div>
      {state === 'trash' && can('lists.delete') && <p className="mt-3 text-sm text-muted">Watchlists must be in the trash before they can be deleted permanently.</p>}
      {confirmElement}
    </>
  );
}

export default function AdminWatchlistsPage() {
  return (
    <RequirePermission permission="lists.read">
      <Suspense fallback={<SkeletonRows rows={8} />}>
        <WatchlistsView />
      </Suspense>
    </RequirePermission>
  );
}
