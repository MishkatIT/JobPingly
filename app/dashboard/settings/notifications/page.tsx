'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FrequencySelect } from '@/components/app/frequency-select';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Switch } from '@/components/ui/form';
import { Callout, Card, CardBody, CardHeader, ErrorState, Skeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, errorMessage } from '@/lib/client/api';
import { formatDateTime } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';
import { detectBrowserTimezone, getSelectableTimezones } from '@/lib/utils/timezones';

interface Preferences {
  emailEnabled: boolean;
  frequency: string;
  digestHour: number;
  digestMinute: number;
  timezone: string;
  settings: { inApp: boolean; jobChanges: boolean; sourceFailures: boolean };
  approval: string;
  platformEmailEnabled: boolean;
  enforced: { frequency: string; description: string } | null;
  schedule: { description: string; nextAt: string | null; dueNow: boolean; lastSentAt: string | null };
}

const pad = (value: number) => String(value).padStart(2, '0');

export default function NotificationSettingsPage() {
  const { data, error, isLoading, mutate } = useApi<Preferences>('/api/me/preferences');
  if (error) return <ErrorState description="Your notification settings could not be loaded." onRetry={() => mutate()} />;
  if (isLoading || !data) return <Skeleton className="h-96" />;
  return <PreferencesForm initial={data} onSaved={next => mutate({ data: next }, { revalidate: false })} />;
}

function PreferencesForm({ initial, onSaved }: { initial: Preferences; onSaved: (next: Preferences) => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    emailEnabled: initial.emailEnabled,
    frequency: initial.frequency,
    time: `${pad(initial.digestHour)}:${pad(initial.digestMinute)}`,
    timezone: initial.timezone,
    settings: initial.settings,
  });
  const [current, setCurrent] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const timezones = getSelectableTimezones();

  const save = async () => {
    setBusy(true);
    setErrors({});
    const [hour, minute] = form.time.split(':').map(Number);
    try {
      const next = await api<Preferences>('/api/me/preferences', {
        method: 'PUT',
        body: {
          emailEnabled: form.emailEnabled,
          frequency: form.frequency,
          digestHour: Number.isFinite(hour) ? hour : 8,
          digestMinute: Number.isFinite(minute) ? minute : 0,
          timezone: form.timezone,
          settings: form.settings,
        },
      });
      setCurrent(next);
      onSaved(next);
      toast.success('Notification settings saved');
    } catch (err) {
      if (err instanceof ApiClientError && Object.keys(err.fieldErrors).length > 0) setErrors(err.fieldErrors);
      else toast.error('Could not save', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const setSetting = (key: keyof Preferences['settings'], value: boolean) => setForm({ ...form, settings: { ...form.settings, [key]: value } });

  return (
    <>
      <Card>
        <CardHeader title="Email alerts" description="New jobs that match your alerts are collected and sent together, so you get one email instead of many." />
        <CardBody className="space-y-5">
          {!current.platformEmailEnabled && <Callout tone="warning">Email delivery is paused for everyone at the moment. Matches still appear in JobPingly.</Callout>}
          {current.approval === 'pending' && form.emailEnabled && (
            <Callout tone="neutral" title="Waiting for approval">
              Email alerts for new accounts are switched on after a quick review. Until then, matches appear in your job feed and notifications.
            </Callout>
          )}
          {current.approval === 'unapproved' && (
            <Callout tone="warning" title="Email alerts are not available for this account">
              Contact us from the{' '}
              <Link href="/help#contact" className="font-medium text-accent hover:text-accent-hover">
                Help page
              </Link>{' '}
              if you think this is a mistake.
            </Callout>
          )}

          <Switch checked={form.emailEnabled} onChange={emailEnabled => setForm({ ...form, emailEnabled })} label="Send me email alerts" description="Turning this off stops all alert emails. Each watchlist can also be switched off on its own." />

          {current.enforced ? (
            <Callout tone="neutral" title="Schedule set by JobPingly">
              Alerts are currently sent {current.enforced.description.charAt(0).toLowerCase() + current.enforced.description.slice(1)} for everyone.
            </Callout>
          ) : (
            <>
              <Field label="How often" error={errors.frequency} hint="Watchlists set to “Account default” use this. A watchlist can override it.">
                {ids => <FrequencySelect {...ids} value={form.frequency} onChange={frequency => setForm({ ...form, frequency })} disabled={!form.emailEnabled} />}
              </Field>
              {form.frequency !== 'realtime' && (
                <Field label="Send at" hint="Digests go out at this time in your time zone; interval schedules are aligned to it.">
                  {ids => <Input {...ids} type="time" step={300} className="w-36" value={form.time} disabled={!form.emailEnabled} onChange={event => setForm({ ...form, time: event.target.value })} />}
                </Field>
              )}
            </>
          )}

          <Field label="Time zone" error={errors.timezone}>
            {ids => (
              <div className="flex gap-2">
                <Select {...ids} value={form.timezone} onChange={event => setForm({ ...form, timezone: event.target.value })}>
                  {!timezones.includes(form.timezone) && <option value={form.timezone}>{form.timezone}</option>}
                  {timezones.map(zone => (
                    <option key={zone} value={zone}>
                      {zone.replace(/_/g, ' ')}
                    </option>
                  ))}
                </Select>
                <Button onClick={() => setForm({ ...form, timezone: detectBrowserTimezone() })}>Use this device&rsquo;s</Button>
              </div>
            )}
          </Field>

          {current.emailEnabled && (
            <div className="rounded-md border border-line bg-sunken/50 px-3.5 py-3 text-sm text-muted">
              <p>
                <span className="font-medium text-ink">Current schedule:</span> {current.schedule.description}
              </p>
              {current.schedule.nextAt && (
                <p className="mt-0.5">
                  Next possible email: {current.schedule.dueNow ? 'with the next check' : formatDateTime(current.schedule.nextAt)} (only sent when there is something new).
                </p>
              )}
              {current.schedule.lastSentAt && <p className="mt-0.5">Last email: {formatDateTime(current.schedule.lastSentAt)}</p>}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="In-app notifications" description="Shown in the Notifications page and the bell in the sidebar." />
        <CardBody className="space-y-5">
          <Switch checked={form.settings.inApp} onChange={value => setSetting('inApp', value)} label="New matching jobs" description="A short summary when a company posts jobs that match your alerts." />
          <Switch checked={form.settings.jobChanges} onChange={value => setSetting('jobChanges', value)} label="Changes to jobs you saved" description="When a job in your tracker is edited or taken down." />
          <Switch checked={form.settings.sourceFailures} onChange={value => setSetting('sourceFailures', value)} label="Problems with your companies" description="When a careers page on one of your watchlists can no longer be checked." />
          <p className="text-sm text-muted">Invitations and reminders you set yourself are always shown.</p>
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button variant="primary" loading={busy} onClick={save}>
          Save notification settings
        </Button>
      </div>
    </>
  );
}
