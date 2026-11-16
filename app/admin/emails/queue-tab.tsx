'use client';

import { useState } from 'react';
import { Inbox, Play, RefreshCw, Send, Trash2 } from 'lucide-react';
import { Can } from '@/components/admin/bits';
import { UserLink } from '@/components/admin/ops-bits';
import { TimeAgo } from '@/components/app/bits';
import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/overlay';
import { Callout, Card, CardHeader, EmptyState, ErrorState, Skeleton, StatCell, StatGrid, Table, TableWrap, Td, Th, Tr } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/client/api';
import { formatNumber, plural } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';

interface Diagnostics {
  wouldSend: number;
  wouldDeliverItems: number;
  recipientsWithPending: number;
  deferred: { userId: string; email: string; reason: string }[];
  deferredByReason: { reason: string; count: number }[];
  errors: string[];
  pendingByUser: { userId: string; email: string; items: number; oldest: string }[];
}

interface ProcessResult {
  usersConsidered: number;
  emailsSent: number;
  itemsDelivered: number;
  itemsSettledWithoutSending: number;
  deferred: { userId: string; email: string; reason: string }[];
  errors: string[];
}

type QueueAction = 'process' | 'flush' | 'clear';

export function QueueTab({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const { can } = useSession();
  const { confirm, element: confirmElement } = useConfirm();
  // Runs the alert processor as a dry run on the server: nothing is sent or changed.
  const { data, error, isLoading, isRefreshing, mutate } = useApi<Diagnostics>('/api/admin/emails/queue');
  const [busy, setBusy] = useState<QueueAction | null>(null);
  const [lastRun, setLastRun] = useState<{ action: QueueAction; result: ProcessResult | { discarded: number } } | null>(null);

  const run = async (action: QueueAction) => {
    const pendingItems = data?.pendingByUser.reduce((sum, row) => sum + row.items, 0) ?? 0;
    const prompts: Record<QueueAction, Parameters<typeof confirm>[0]> = {
      process: {
        title: 'Process the queue now?',
        description: 'Runs the same delivery step the worker runs on its schedule. Emails go only to people whose digest is due, within the daily limit.',
        confirmLabel: 'Process now',
      },
      flush: {
        title: 'Send every waiting alert now?',
        description: 'Ignores each person’s schedule, the daily limit and staggering. Everyone with waiting alerts gets an email immediately. Use only to recover from an outage.',
        confirmLabel: 'Send everything',
        tone: 'danger',
        typeToConfirm: 'SEND',
      },
      clear: {
        title: 'Discard every waiting alert?',
        description: `The waiting alerts${pendingItems ? ` (at least ${formatNumber(pendingItems)})` : ''} are marked as handled and never emailed. The jobs stay visible in people's dashboards. This cannot be undone.`,
        confirmLabel: 'Discard alerts',
        tone: 'danger',
        typeToConfirm: 'DISCARD',
      },
    };
    if (!(await confirm(prompts[action]))) return;
    setBusy(action);
    try {
      const result = await api<ProcessResult | { discarded: number }>('/api/admin/emails/queue', { body: { action } });
      setLastRun({ action, result });
      if ('discarded' in result) toast.success(`Discarded ${plural(result.discarded, 'alert')}`);
      else toast.success(`Sent ${plural(result.emailsSent, 'email')}`, `${plural(result.itemsDelivered, 'alert')} delivered.`);
      await mutate();
      onChanged();
    } catch (err) {
      toast.error('The queue action failed', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-prose text-sm text-muted">
          New matches wait here until each person&rsquo;s digest is due. The figures below come from a dry run of the delivery step, so nothing is sent while you look.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button icon={<RefreshCw className="h-4 w-4" />} loading={isRefreshing} onClick={() => mutate()}>
            Refresh
          </Button>
          <Can permission="emails.manage">
            <Button variant="primary" icon={<Play className="h-4 w-4" />} loading={busy === 'process'} disabled={busy !== null} onClick={() => run('process')}>
              Process now
            </Button>
          </Can>
        </div>
      </div>

      {lastRun && (
        <Callout tone="success" title={lastRun.action === 'clear' ? 'Queue cleared' : lastRun.action === 'flush' ? 'Everything was sent' : 'Queue processed'}>
          {'discarded' in lastRun.result ? (
            `${plural(lastRun.result.discarded, 'alert')} discarded.`
          ) : (
            <>
              {plural(lastRun.result.emailsSent, 'email')} sent with {plural(lastRun.result.itemsDelivered, 'alert')}; {plural(lastRun.result.itemsSettledWithoutSending, 'alert')} closed without
              sending (job closed, recipient opted out or repeated failures); {plural(lastRun.result.deferred.length, 'person', 'people')} still waiting.
              {lastRun.result.errors.length > 0 && <span className="mt-1 block text-danger">Errors: {lastRun.result.errors.join('; ')}</span>}
            </>
          )}
        </Callout>
      )}

      {error ? (
        <ErrorState description={errorMessage(error)} onRetry={() => mutate()} />
      ) : isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <>
          <StatGrid>
            <StatCell label="People with waiting alerts" value={formatNumber(data.recipientsWithPending)} />
            <StatCell label="Would get an email now" value={formatNumber(data.wouldSend)} hint={`${plural(data.wouldDeliverItems, 'alert')} in total`} />
            <StatCell label="Held back for now" value={formatNumber(data.deferredByReason.reduce((sum, row) => sum + row.count, 0))} hint="Not due yet, over the limit or staggered" />
            <StatCell label="Errors in the dry run" value={formatNumber(data.errors.length)} tone={data.errors.length > 0 ? 'danger' : undefined} />
          </StatGrid>

          {data.errors.length > 0 && (
            <Callout tone="danger" title="The dry run reported problems">
              <ul className="list-disc pl-4">
                {data.errors.slice(0, 10).map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
              </ul>
            </Callout>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <CardHeader title="Why alerts are waiting" />
              {data.deferredByReason.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted">Nothing is being held back.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.deferredByReason.map(row => (
                    <li key={row.reason} className="flex items-start justify-between gap-4 px-5 py-2.5 text-sm">
                      <span className="text-ink">{row.reason}</span>
                      <span className="tabular shrink-0 font-medium text-ink">{formatNumber(row.count)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="overflow-hidden">
              <CardHeader title="Waiting longest" description="Up to 50 people, oldest alert first" />
              {data.pendingByUser.length === 0 ? (
                <EmptyState icon={<Inbox />} title="The queue is empty" className="py-10" />
              ) : (
                <TableWrap className="max-h-80 overflow-y-auto">
                  <Table className="min-w-0">
                    <thead>
                      <tr>
                        <Th>Recipient</Th>
                        <Th className="text-right">Alerts</Th>
                        <Th>Oldest</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.pendingByUser.map(row => (
                        <Tr key={row.userId}>
                          <Td className="max-w-[14rem] truncate">
                            <UserLink id={can('users.read') ? row.userId : null}>{row.email}</UserLink>
                          </Td>
                          <Td className="tabular text-right">{formatNumber(row.items)}</Td>
                          <Td className="whitespace-nowrap text-sm text-muted">
                            <TimeAgo value={row.oldest} />
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </Card>
          </div>

          <Can permission="emails.manage">
            <Card className="border-danger/30">
              <CardHeader title="Recovery actions" description="For outages and mistakes. Both are recorded in the audit log." />
              <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row">
                <div className="flex-1">
                  <Button variant="danger" icon={<Send className="h-4 w-4" />} loading={busy === 'flush'} disabled={busy !== null || data.recipientsWithPending === 0} onClick={() => run('flush')}>
                    Send everything now
                  </Button>
                  <p className="mt-1.5 text-sm text-muted">Ignores schedules, the daily limit and staggering.</p>
                </div>
                <div className="flex-1">
                  <Button icon={<Trash2 className="h-4 w-4" />} loading={busy === 'clear'} disabled={busy !== null || data.recipientsWithPending === 0} onClick={() => run('clear')}>
                    Discard all waiting alerts
                  </Button>
                  <p className="mt-1.5 text-sm text-muted">For example after a bad scan produced false matches.</p>
                </div>
              </div>
            </Card>
          </Can>
        </>
      )}
      {confirmElement}
    </div>
  );
}
