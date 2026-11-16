'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { Bell, BellRing, Briefcase, CheckCheck, CircleAlert, CircleCheck, Info, ListPlus, Settings, Trash2, UserPlus, type LucideIcon } from 'lucide-react';
import { TimeAgo } from '@/components/app/bits';
import { Button, IconButton, LinkButton } from '@/components/ui/button';
import { Pagination, Tabs } from '@/components/ui/overlay';
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/client/api';
import { cn } from '@/lib/client/cn';
import { useApi } from '@/lib/client/use-api';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

const ICONS: Record<string, { icon: LucideIcon; className: string }> = {
  job_match: { icon: Briefcase, className: 'text-accent' },
  job_updated: { icon: Briefcase, className: 'text-muted' },
  source_failed: { icon: CircleAlert, className: 'text-warning' },
  source_recovered: { icon: CircleCheck, className: 'text-success' },
  list_invite: { icon: UserPlus, className: 'text-accent' },
  contribution: { icon: ListPlus, className: 'text-accent' },
  reminder: { icon: BellRing, className: 'text-accent' },
  system: { icon: Info, className: 'text-muted' },
};

const PAGE_SIZE = 30;

/** Only same-site paths are followed; anything else is ignored. */
function internalLink(link: string | null): string | null {
  return link && link.startsWith('/') && !link.startsWith('//') ? link : null;
}

export default function NotificationsPage() {
  const router = useRouter();
  const toast = useToast();
  const { mutate: globalMutate } = useSWRConfig();
  const [view, setView] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const { data, meta, error, isLoading, mutate } = useApi<Notification[]>(`/api/notifications?page=${page}&pageSize=${PAGE_SIZE}${view === 'unread' ? '&unread=1' : ''}`);
  const unread = Number(meta?.unread ?? 0);
  const [busy, setBusy] = useState(false);

  // Refreshes this list and the unread badge in the sidebar, which has its own query.
  const refreshBadge = () => void globalMutate(key => typeof key === 'string' && key.startsWith('/api/notifications'));

  const markAll = async () => {
    setBusy(true);
    try {
      await api('/api/notifications', { body: { all: true } });
      refreshBadge();
    } catch (err) {
      toast.error('Could not mark as read', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const open = async (item: Notification) => {
    if (!item.readAt) {
      try {
        await api('/api/notifications', { body: { ids: [item.id] } });
        refreshBadge();
      } catch {
        // Reading the notification matters more than the read marker.
      }
    }
    const link = internalLink(item.link);
    if (link) router.push(link);
  };

  const remove = async (item: Notification) => {
    try {
      await api(`/api/notifications/${item.id}`, { method: 'DELETE' });
      refreshBadge();
    } catch (err) {
      toast.error('Could not delete', errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        description="New matching jobs, problems with companies you follow, invitations and reminders."
        actions={
          <>
            <LinkButton href="/dashboard/settings/notifications" variant="ghost" icon={<Settings className="h-4 w-4" />}>
              Settings
            </LinkButton>
            <Button icon={<CheckCheck className="h-4 w-4" />} disabled={unread === 0} loading={busy} onClick={markAll}>
              Mark all as read
            </Button>
          </>
        }
      />

      <Tabs
        label="Notification filter"
        value={view}
        onChange={value => {
          setView(value);
          setPage(1);
        }}
        options={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: 'Unread', count: meta ? unread : null },
        ]}
      />

      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface">
        {error ? (
          <ErrorState description="Notifications could not be loaded." onRetry={() => mutate()} />
        ) : isLoading ? (
          <SkeletonRows rows={6} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={<Bell />}
            title={view === 'unread' ? 'You are all caught up' : 'No notifications yet'}
            description={view === 'unread' ? undefined : 'When a job matches your alerts or something needs your attention, it shows up here.'}
          />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {data.map(item => {
                const entry = ICONS[item.type] ?? ICONS.system;
                const Icon = entry.icon;
                const link = internalLink(item.link);
                return (
                  <li key={item.id} className={cn('group relative flex gap-3 px-4 py-3.5 sm:px-5', !item.readAt && 'bg-accent-soft/40')}>
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface">
                      <Icon className={cn('h-4 w-4', entry.className)} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <button type="button" onClick={() => open(item)} className={cn('text-left text-base text-ink', link && 'hover:text-accent', !item.readAt && 'font-semibold')}>
                        {!item.readAt && <span className="sr-only">Unread: </span>}
                        {item.title}
                      </button>
                      {item.body && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{item.body}</p>}
                      <TimeAgo value={item.createdAt} className="mt-1 block text-xs text-subtle" />
                    </div>
                    <div className="flex shrink-0 items-start gap-1">
                      {!item.readAt && <span className="mt-3 h-2 w-2 rounded-full bg-accent" aria-hidden="true" />}
                      <IconButton label="Delete notification" size="sm" onClick={() => remove(item)} className="opacity-100 sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100">
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Pagination page={page} totalPages={Number(meta?.totalPages ?? 1)} total={Number(meta?.total ?? data.length)} pageSize={PAGE_SIZE} onChange={setPage} className="border-t border-line" />
          </>
        )}
      </div>
      <p className="mt-3 text-sm text-muted">
        Notifications are kept for 60 days. Email alerts are configured per watchlist in{' '}
        <Link href="/dashboard/watchlists" className="font-medium text-accent hover:text-accent-hover">
          Watchlists
        </Link>
        .
      </p>
    </>
  );
}
