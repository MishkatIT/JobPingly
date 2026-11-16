'use client';

import { Suspense } from 'react';
import { RequirePermission } from '@/components/admin/bits';
import { useUrlFilters } from '@/components/admin/ops-bits';
import { useSession } from '@/components/app/session';
import { Tabs } from '@/components/ui/overlay';
import { PageHeader, SkeletonRows } from '@/components/ui/primitives';
import { useApi } from '@/lib/client/use-api';
import { ApprovalsTab } from './approvals-tab';
import { DeliveryTab } from './delivery-tab';
import { LogsTab } from './logs-tab';
import { QueueTab } from './queue-tab';
import { SendTab } from './send-tab';
import type { EmailStats } from './types';

type Tab = 'delivery' | 'logs' | 'approvals' | 'queue' | 'send';

function EmailsView() {
  const { can } = useSession();
  const { params, update } = useUrlFilters();
  const { data: stats, error, isLoading, mutate } = useApi<EmailStats>('/api/admin/emails', { refreshInterval: 60_000 });

  const tabs: { value: Tab; label: string; count?: number | null }[] = [
    { value: 'delivery', label: 'Delivery' },
    { value: 'logs', label: 'Sent emails' },
    { value: 'approvals', label: 'Approvals', count: stats ? stats.pending.approvals || null : null },
    { value: 'queue', label: 'Alert queue', count: stats ? stats.pending.alerts || null : null },
    ...(can('emails.send') ? [{ value: 'send' as const, label: 'Send' }] : []),
  ];
  const requested = params.get('tab') as Tab | null;
  const tab: Tab = tabs.some(item => item.value === requested) ? requested! : 'delivery';

  // Each tab keeps its own filters in the URL; switching tabs starts clean.
  const setTab = (value: Tab) => {
    const keep: Record<string, null> = {};
    for (const key of Array.from(params.keys())) if (key !== 'tab') keep[key] = null;
    update({ ...keep, tab: value === 'delivery' ? null : value });
  };

  return (
    <>
      <PageHeader title="Email" description="Delivery health, sending allowance, recipient approval and the job alert queue." />
      <Tabs label="Email sections" value={tab} onChange={setTab} options={tabs} />
      <div className="mt-6">
        {tab === 'delivery' && <DeliveryTab stats={stats} error={error} isLoading={isLoading} onChanged={() => mutate()} />}
        {tab === 'logs' && <LogsTab />}
        {tab === 'approvals' && <ApprovalsTab stats={stats} onChanged={() => mutate()} />}
        {tab === 'queue' && <QueueTab onChanged={() => mutate()} />}
        {tab === 'send' && <SendTab stats={stats} onChanged={() => mutate()} />}
      </div>
    </>
  );
}

export default function AdminEmailsPage() {
  return (
    <RequirePermission permission="emails.read">
      <Suspense fallback={<SkeletonRows rows={6} />}>
        <EmailsView />
      </Suspense>
    </RequirePermission>
  );
}
