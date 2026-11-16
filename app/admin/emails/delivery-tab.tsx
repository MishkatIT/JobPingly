'use client';

import { useState } from 'react';
import { Can, EmailStatusBadge } from '@/components/admin/bits';
import { FrequencySelect } from '@/components/app/frequency-select';
import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { BarChart } from '@/components/ui/chart';
import { Field, Input, Switch } from '@/components/ui/form';
import { useConfirm } from '@/components/ui/overlay';
import { Callout, Card, CardBody, CardHeader, ErrorState, Skeleton, StatCell, StatGrid, Table, TableWrap, Td, Th, Tr } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/client/api';
import { cn } from '@/lib/client/cn';
import { formatNumber, formatPercent } from '@/lib/client/format';
import { formatFrequencyShortLabel } from '@/lib/utils/frequency';
import { TEMPLATE_LABELS, type EmailStats } from './types';

const pad = (value: number) => String(value).padStart(2, '0');

export function DeliveryTab({ stats, error, isLoading, onChanged }: { stats: EmailStats | undefined; error: Error | undefined; isLoading: boolean; onChanged: () => void }) {
  if (error) return <ErrorState description={errorMessage(error)} onRetry={onChanged} />;
  if (isLoading || !stats) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-56" />
      </div>
    );
  }

  const { today, policy } = stats;
  const usedShare = today.dailyLimit > 0 ? today.sentToday / today.dailyLimit : 0;

  return (
    <div className="space-y-6">
      {stats.provider !== 'brevo' && (
        <Callout tone="warning" title="Emails are not being delivered">
          The email provider is in console mode: messages are written to the server log instead of being sent. Set BREVO_API_KEY (and BREVO_SENDER_EMAIL) to deliver real email.
        </Callout>
      )}
      {!policy.notificationsEnabled && (
        <Callout tone="warning" title="Job alert emails are switched off">
          The master switch in Settings is off, so no digests are sent. Sign-in codes and password resets are unaffected.
        </Callout>
      )}

      <StatGrid>
        <StatCell label="Sent today" value={formatNumber(today.sentToday)} hint={`${formatPercent(usedShare)} of the ${formatNumber(today.dailyLimit)} daily limit`} tone={usedShare >= 0.9 ? 'warning' : undefined} />
        <StatCell label="Failed today" value={formatNumber(today.failedToday)} tone={today.failedToday > 0 ? 'danger' : undefined} />
        <StatCell label="Left today" value={formatNumber(today.remaining)} hint={`${formatNumber(policy.safetyBuffer)} kept for sign-in and account emails`} />
        <StatCell label="Alerts waiting" value={formatNumber(stats.pending.alerts)} hint={`for ${formatNumber(stats.pending.recipients)} ${stats.pending.recipients === 1 ? 'person' : 'people'}`} />
      </StatGrid>

      <Card>
        <CardBody>
          <BarChart
            title="Emails per day"
            description="Last 14 days, all email types"
            data={stats.series}
            x="day"
            stacked
            series={[
              { key: 'sent', label: 'Sent', color: 'var(--chart-1)' },
              { key: 'failed', label: 'Failed', color: 'var(--chart-critical)' },
            ]}
          />
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title="By type" description="Last 30 days" />
          {stats.byTemplate.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">No emails in the last 30 days.</p>
          ) : (
            <TableWrap>
              <Table className="min-w-0">
                <thead>
                  <tr>
                    <Th>Type</Th>
                    <Th className="text-right">Sent</Th>
                    <Th className="text-right">Failed</Th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byTemplate.map(row => (
                    <Tr key={row.template}>
                      <Td>{TEMPLATE_LABELS[row.template] ?? row.template}</Td>
                      <Td className="tabular text-right">{formatNumber(row.sent)}</Td>
                      <Td className={cn('tabular text-right', row.failed > 0 && 'text-danger')}>{formatNumber(row.failed)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="What happened after sending" description={stats.webhookConfigured ? 'Reported by the email provider, last 30 days' : 'Last 30 days'} />
          {!stats.webhookConfigured && (
            <CardBody className="border-b border-line">
              <Callout tone="neutral">
                Delivery reports are not set up, so bounces and spam complaints are not tracked. Set BREVO_WEBHOOK_SECRET and point the provider&rsquo;s webhook to /api/webhooks/brevo.
              </Callout>
            </CardBody>
          )}
          {stats.delivery.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">No sent emails in the last 30 days.</p>
          ) : (
            <TableWrap>
              <Table className="min-w-0">
                <thead>
                  <tr>
                    <Th>Status</Th>
                    <Th className="text-right">Emails</Th>
                  </tr>
                </thead>
                <tbody>
                  {stats.delivery.map(row => (
                    <Tr key={row.status}>
                      <Td>{row.status === 'not reported' ? <span className="text-muted">Not reported</span> : <EmailStatusBadge status={row.status} />}</Td>
                      <Td className="tabular text-right">{formatNumber(row.count)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Sending setup" />
        <dl className="grid gap-4 px-4 py-4 text-sm sm:grid-cols-3 sm:px-5">
          <div>
            <dt className="text-muted">Provider</dt>
            <dd className="mt-0.5 text-ink">{stats.provider === 'brevo' ? 'Brevo' : 'Console (not delivered)'}</dd>
          </div>
          <div>
            <dt className="text-muted">Sender address</dt>
            <dd className="mt-0.5 break-all text-ink">{stats.sender || '—'}</dd>
          </div>
          <div>
            <dt className="text-muted">New recipients</dt>
            <dd className="mt-0.5 text-ink">{policy.requireApproval ? 'Need approval before alerts are sent' : 'Approved automatically'}</dd>
          </div>
        </dl>
      </Card>

      <FrequencyPolicyCard stats={stats} onChanged={onChanged} />
      <StaggeringCard stats={stats} onChanged={onChanged} />
    </div>
  );
}

async function saveSettings(changes: [string, unknown][]) {
  for (const [key, value] of changes) {
    await api('/api/admin/settings', { method: 'PUT', body: { key, value } });
  }
}

function FrequencyPolicyCard({ stats, onChanged }: { stats: EmailStats; onChanged: () => void }) {
  const toast = useToast();
  const { can } = useSession();
  const { confirm, element: confirmElement } = useConfirm();
  const editable = can('settings.manage');
  const { policy } = stats;
  const initial = {
    enforced: policy.globalPolicyEnforced,
    frequency: policy.enforcedFrequencyValue || 'daily',
    pinned: policy.enforcedDigestHour !== null,
    time: `${pad(policy.enforcedDigestHour ?? 8)}:${pad(policy.enforcedDigestMinute ?? 0)}`,
  };
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const save = async () => {
    if (form.enforced && !initial.enforced) {
      const ok = await confirm({
        title: 'Enforce one schedule for everyone?',
        description: `Every account that is not exempt will get alerts on the “${formatFrequencyShortLabel(form.frequency)}” schedule, whatever they chose themselves.`,
        confirmLabel: 'Enforce',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const [hour, minute] = form.time.split(':').map(Number);
      const changes: [string, unknown][] = [];
      if (form.frequency !== initial.frequency) changes.push(['notifications.enforced_frequency_value', form.frequency]);
      if (form.pinned !== initial.pinned || form.time !== initial.time) {
        changes.push(['notifications.enforced_digest_hour', form.pinned && Number.isFinite(hour) ? hour : -1]);
        changes.push(['notifications.enforced_digest_minute', form.pinned && Number.isFinite(minute) ? minute : -1]);
      }
      // The switch goes last, so enforcement never starts with a half-saved schedule.
      if (form.enforced !== initial.enforced) changes.push(['notifications.enforce_frequency', form.enforced]);
      await saveSettings(changes);
      toast.success('Delivery schedule saved');
      onChanged();
    } catch (err) {
      toast.error('Could not save the schedule', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Digest schedule" description="By default everyone chooses how often they get alerts. You can override that, for example to stay within the daily sending limit." />
      <CardBody className="space-y-5">
        <Switch
          checked={form.enforced}
          onChange={enforced => setForm({ ...form, enforced })}
          label="Use one schedule for everyone"
          description="Accounts marked as exempt on their user page keep their own schedule."
          disabled={!editable || busy}
        />
        <Field label="Schedule">{ids => <FrequencySelect {...ids} value={form.frequency} onChange={frequency => setForm({ ...form, frequency })} disabled={!editable || !form.enforced} />}</Field>
        <Switch
          checked={form.pinned}
          onChange={pinned => setForm({ ...form, pinned })}
          label="Send at a fixed time"
          description="Same local time for everyone, in each person's own time zone. When off, people keep the time they chose."
          disabled={!editable || !form.enforced || busy}
        />
        {form.pinned && form.enforced && (
          <Field label="Time">{ids => <Input {...ids} type="time" step={300} className="w-36" value={form.time} disabled={!editable} onChange={event => setForm({ ...form, time: event.target.value })} />}</Field>
        )}
        {!editable ? (
          <p className="text-sm text-muted">Changing the schedule requires permission to manage settings.</p>
        ) : (
          <div className="flex gap-2">
            <Button variant="primary" loading={busy} disabled={!dirty} onClick={save}>
              Save schedule
            </Button>
            {dirty && (
              <Button disabled={busy} onClick={() => setForm(initial)}>
                Discard
              </Button>
            )}
          </div>
        )}
      </CardBody>
      {confirmElement}
    </Card>
  );
}

function StaggeringCard({ stats, onChanged }: { stats: EmailStats; onChanged: () => void }) {
  const toast = useToast();
  const { can } = useSession();
  const { confirm, element: confirmElement } = useConfirm();
  const editable = can('settings.manage');
  const { policy, cohorts } = stats;
  const initial = { enabled: policy.cohortGroupingEnabled, ratio: String(Math.round(policy.cohortPressureRatio * 100)) };
  const [form, setForm] = useState(initial);
  const [cycleDays, setCycleDays] = useState(String(cohorts.cycleDays));
  const [busy, setBusy] = useState<'save' | 'rebalance' | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const ratioValue = Number(form.ratio);
  const ratioValid = form.ratio.trim() !== '' && Number.isFinite(ratioValue) && ratioValue >= 0 && ratioValue <= 100;
  const days = Number(cycleDays);
  const daysValid = Number.isInteger(days) && days >= 1 && days <= 30;
  const totalUsers = cohorts.distribution.reduce((sum, item) => sum + item.users, 0);
  const largest = Math.max(1, ...cohorts.distribution.map(item => item.users));

  const save = async () => {
    setBusy('save');
    try {
      const changes: [string, unknown][] = [];
      if (form.ratio !== initial.ratio) changes.push(['email.cohort_pressure_ratio', Math.round(ratioValue) / 100]);
      if (form.enabled !== initial.enabled) changes.push(['email.cohort_grouping_enabled', form.enabled]);
      await saveSettings(changes);
      toast.success('Staggering saved');
      onChanged();
    } catch (err) {
      toast.error('Could not save', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const rebalance = async () => {
    const ok = await confirm({
      title: `Spread recipients over ${days} ${days === 1 ? 'group' : 'groups'}?`,
      description: 'Everyone who gets alert emails is reassigned to a group, evenly and in sign-up order. Nothing is sent.',
      confirmLabel: 'Rebalance',
    });
    if (!ok) return;
    setBusy('rebalance');
    try {
      const result = await api<{ users: number; cycleDays: number }>('/api/admin/emails/cohorts', { body: { cycleDays: days } });
      toast.success(`Spread ${formatNumber(result.users)} recipients over ${result.cycleDays} ${result.cycleDays === 1 ? 'group' : 'groups'}`);
      onChanged();
    } catch (err) {
      toast.error('Could not rebalance', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Staggering under pressure"
        description="When a day's sending allowance is nearly used up, digests (never instant alerts) are spread across rotating groups instead of being dropped."
      />
      <CardBody className="space-y-5">
        <Switch checked={form.enabled} onChange={enabled => setForm({ ...form, enabled })} label="Stagger digests when the limit is nearly reached" disabled={!editable || busy !== null} />
        <Field
          label="Start staggering after"
          error={ratioValid ? null : 'Enter a percentage from 0 to 100.'}
          hint={`Currently ${formatNumber(policy.cohortPressureThreshold)} digests a day: ${formatPercent(policy.cohortPressureRatio)} of the ${formatNumber(policy.effectiveDigestLimit)} digests the daily limit leaves room for.`}
        >
          {ids => (
            <div className="flex items-center gap-2">
              <Input {...ids} type="number" min={0} max={100} step={5} className="w-24" value={form.ratio} disabled={!editable || !form.enabled} onChange={event => setForm({ ...form, ratio: event.target.value })} />
              <span className="text-sm text-muted">% of the digest allowance</span>
            </div>
          )}
        </Field>
        {editable && (
          <div className="flex gap-2">
            <Button variant="primary" loading={busy === 'save'} disabled={!dirty || !ratioValid || busy !== null} onClick={save}>
              Save
            </Button>
            {dirty && (
              <Button disabled={busy !== null} onClick={() => setForm(initial)}>
                Discard
              </Button>
            )}
          </div>
        )}

        <div className="border-t border-line pt-5">
          <p className="text-base font-medium text-ink">Groups</p>
          <p className="mt-0.5 text-sm text-muted">
            {formatNumber(totalUsers)} alert {totalUsers === 1 ? 'recipient is' : 'recipients are'} split over {cohorts.cycleDays} {cohorts.cycleDays === 1 ? 'group' : 'groups'}. Today is group {cohorts.todayCohort}; under pressure, only today&rsquo;s group gets its digest.
          </p>
          <ul className="mt-3 space-y-1.5" aria-label="Recipients per group">
            {cohorts.distribution.map(item => (
              <li key={item.group} className="grid grid-cols-[5.5rem_minmax(0,1fr)_4rem] items-center gap-3 text-sm">
                <span className={cn('text-muted', item.group === cohorts.todayCohort && 'font-medium text-ink')}>
                  Group {item.group}
                  {item.group === cohorts.todayCohort ? ' (today)' : ''}
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
                  <span className="block h-full rounded-full" style={{ width: `${(item.users / largest) * 100}%`, background: 'var(--chart-1)' }} />
                </span>
                <span className="tabular text-right text-ink">{formatNumber(item.users)}</span>
              </li>
            ))}
          </ul>
          <Can permission="emails.manage">
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <Field label="Number of groups" error={daysValid ? null : 'From 1 to 30.'}>
                {ids => <Input {...ids} type="number" min={1} max={30} className="w-24" value={cycleDays} onChange={event => setCycleDays(event.target.value)} />}
              </Field>
              <Button loading={busy === 'rebalance'} disabled={!daysValid || busy !== null} onClick={rebalance} className="mb-px">
                Rebalance groups
              </Button>
            </div>
          </Can>
        </div>
      </CardBody>
      {confirmElement}
    </Card>
  );
}
