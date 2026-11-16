'use client';

import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ArrowLeft, Bell, BellOff, Check, Copy, Globe, Lock, Plus, Users } from 'lucide-react';
import { AlertRulesEditor } from '@/components/app/alert-rules-editor';
import { useRevalidateWorkspace } from '@/components/app/add-company-dialog';
import { useSession } from '@/components/app/session';
import { Button, LinkButton } from '@/components/ui/button';
import { Tabs } from '@/components/ui/overlay';
import { Badge, ErrorState, Skeleton, StatCell, StatGrid } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/client/api';
import { formatNumber, plural } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';
import { EMPTY_RULES } from '@/lib/matching/rules';
import { formatFrequencyShortLabel } from '@/lib/utils/frequency';
import { CompaniesTab } from './companies-tab';
import { MembersTab, SettingsTab, SuggestionsTab } from './other-tabs';
import type { ListDetail } from './types';

type Tab = 'companies' | 'alerts' | 'members' | 'suggestions' | 'settings';

function WatchlistView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const revalidate = useRevalidateWorkspace();
  const { user } = useSession();
  const { data, error, isLoading, mutate } = useApi<ListDetail>(`/api/lists/${id}`);
  const { data: profile } = useApi<{ profile: { limits: { keywordsPerAlert: number | null } } }>('/api/me');
  const [busy, setBusy] = useState<string | null>(null);

  if (error) return <ErrorState title="Watchlist not found" description="It may have been deleted, made private, or you may not have access." />;
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-20" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { list, access, stats, subscription } = data;
  const isMember = access.role !== 'viewer';
  const tabs: { value: Tab; label: string; count?: number | null }[] = [
    { value: 'companies', label: 'Companies', count: stats.companies },
    { value: 'alerts', label: 'Your alerts' },
    ...(isMember ? [{ value: 'members' as const, label: 'Members' }] : []),
    ...(access.canReviewSuggestions && list.visibility === 'public' ? [{ value: 'suggestions' as const, label: 'Suggestions', count: stats.pendingSuggestions || null }] : []),
    ...(access.canEditDetails || access.canChangeVisibility ? [{ value: 'settings' as const, label: 'Settings' }] : []),
  ];
  const requested = params.get('tab') as Tab | null;
  const tab: Tab = tabs.some(item => item.value === requested) ? requested! : 'companies';
  const setTab = (value: Tab) => router.replace(`${pathname}${value === 'companies' ? '' : `?tab=${value}`}`, { scroll: false });

  const refresh = () => {
    void mutate();
    void revalidate();
  };

  const follow = async () => {
    setBusy('follow');
    try {
      if (access.isFollowing) await api(`/api/lists/${list.id}/follow`, { method: 'DELETE' });
      else await api(`/api/lists/${list.id}/follow`, { method: 'POST', body: {} });
      toast.success(access.isFollowing ? 'Unfollowed' : 'Following', access.isFollowing ? undefined : 'Set your keywords in “Your alerts”.');
      refresh();
    } catch (err) {
      toast.error('Something went wrong', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const duplicate = async () => {
    setBusy('copy');
    try {
      const created = await api<{ id: string }>(`/api/lists/${list.id}/duplicate`, { method: 'POST', body: {} });
      toast.success('Copied to a new private watchlist');
      router.push(`/dashboard/watchlists/${created.id}`);
    } catch (err) {
      toast.error('Could not copy', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const hasSubscription = Boolean(subscription);

  return (
    <>
      <Link href="/dashboard/watchlists" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Watchlists
      </Link>

      <header className="mt-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl">{list.name}</h1>
            {list.visibility === 'public' ? (
              <Badge tone="outline">
                <Globe className="h-3 w-3" aria-hidden="true" /> Public
              </Badge>
            ) : (
              <Badge tone="outline">
                <Lock className="h-3 w-3" aria-hidden="true" /> Private
              </Badge>
            )}
            {access.role !== 'owner' && <Badge tone="neutral">{access.role === 'viewer' ? (access.isFollowing ? 'Following' : 'Viewing') : access.role === 'moderator' ? 'Moderator' : 'Editor'}</Badge>}
          </div>
          {list.description && <p className="mt-1.5 max-w-prose text-base text-muted">{list.description}</p>}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {list.owner.id !== user.id && <span>By {list.owner.name ?? 'a JobPingly user'}</span>}
            {list.visibility === 'public' && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                {plural(list.followers, 'follower')}
              </span>
            )}
            {subscription && (
              <span className="inline-flex items-center gap-1">
                {subscription.alertsEnabled ? <Bell className="h-3.5 w-3.5" aria-hidden="true" /> : <BellOff className="h-3.5 w-3.5" aria-hidden="true" />}
                {subscription.alertsEnabled ? `${subscription.summary} · ${formatFrequencyShortLabel(subscription.digestFrequency)}` : 'Alerts off'}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {list.visibility === 'public' && (
            <LinkButton href={`/lists/${list.slug}`} variant="ghost" icon={<Globe className="h-4 w-4" />}>
              Public page
            </LinkButton>
          )}
          {access.role === 'viewer' && (
            <Button variant={access.isFollowing ? 'secondary' : 'primary'} loading={busy === 'follow'} onClick={follow} icon={access.isFollowing ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}>
              {access.isFollowing ? 'Following' : 'Follow'}
            </Button>
          )}
          <Button loading={busy === 'copy'} onClick={duplicate} icon={<Copy className="h-4 w-4" />}>
            {access.role === 'owner' ? 'Duplicate' : 'Copy to my lists'}
          </Button>
        </div>
      </header>

      <StatGrid className="mt-6">
        <StatCell label="Companies" value={formatNumber(stats.companies)} />
        <StatCell label="Open jobs" value={<Link href={`/dashboard/jobs?view=all&list=${list.id}`} className="hover:text-accent">{formatNumber(stats.openJobs)}</Link>} />
        <StatCell label="New this week" value={formatNumber(stats.newThisWeek)} />
        <StatCell label="Companies with issues" value={formatNumber(stats.issues)} tone={stats.issues > 0 ? 'warning' : undefined} />
      </StatGrid>

      <Tabs label="Watchlist sections" className="mt-8" value={tab} onChange={setTab} options={tabs} />

      <div className="mt-6">
        {tab === 'companies' && <CompaniesTab detail={data} onChanged={refresh} />}
        {tab === 'alerts' &&
          (hasSubscription || isMember ? (
            <AlertRulesEditor
              key={JSON.stringify(subscription)}
              listId={list.id}
              keywordLimit={profile?.profile.limits.keywordsPerAlert ?? 20}
              initial={{
                alertsEnabled: subscription?.alertsEnabled ?? true,
                digestFrequency: subscription?.digestFrequency ?? 'inherit',
                rules: subscription?.rules ?? EMPTY_RULES,
              }}
              onSaved={refresh}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-line px-6 py-12 text-center">
              <p className="text-md font-semibold text-ink">Follow this watchlist to get alerts</p>
              <p className="mt-1 text-base text-muted">You choose your own keywords; the owner never sees them.</p>
              <Button variant="primary" className="mt-4" loading={busy === 'follow'} onClick={follow}>
                Follow
              </Button>
            </div>
          ))}
        {tab === 'members' && <MembersTab detail={data} />}
        {tab === 'suggestions' && <SuggestionsTab detail={data} onChanged={refresh} />}
        {tab === 'settings' && <SettingsTab key={list.updatedAt} detail={data} onChanged={refresh} />}
      </div>
    </>
  );
}

export default function WatchlistPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <WatchlistView />
    </Suspense>
  );
}
