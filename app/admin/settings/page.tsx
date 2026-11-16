'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Lock, Megaphone } from 'lucide-react';
import { RequirePermission } from '@/components/admin/bits';
import { BannerPreview, type BannerConfig } from '@/components/admin/ops-bits';
import { TimeAgo } from '@/components/app/bits';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/form';
import { useConfirm } from '@/components/ui/overlay';
import { Callout, Card, CardBody, CardHeader, ErrorState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, errorMessage } from '@/lib/client/api';
import { useApi } from '@/lib/client/use-api';

interface Setting {
  key: string;
  type: 'boolean' | 'number' | 'string' | 'select' | 'json';
  default: unknown;
  label: string;
  description: string;
  category: string;
  permission?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  options?: { value: string; label: string }[];
  unit?: string;
  managedElsewhere?: boolean;
  value: unknown;
  editable: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface SettingsResponse {
  categories: { id: string; label: string; description: string }[];
  settings: Setting[];
}

/** Switch changes that can lock people out or stop the service get a confirmation step. */
const RISKY: Record<string, { when: boolean; title: string; description: string; confirmLabel: string }> = {
  'auth.signup_enabled': { when: false, title: 'Stop new sign-ups?', description: 'The registration form and Google sign-up will reject new accounts. Existing users can still sign in.', confirmLabel: 'Stop sign-ups' },
  'auth.login_enabled': { when: false, title: 'Block sign-in?', description: 'Only staff accounts will be able to sign in until this is turned back on.', confirmLabel: 'Block sign-in' },
  'platform.maintenance_mode': { when: true, title: 'Turn on maintenance mode?', description: 'Everyone except staff sees the maintenance notice and cannot make changes. Monitoring keeps running.', confirmLabel: 'Turn on' },
  'scraper.enabled': { when: false, title: 'Stop monitoring?', description: 'No scheduled scans will start until monitoring is turned back on. Alerts already queued are still delivered.', confirmLabel: 'Stop monitoring' },
  'notifications.enabled': { when: false, title: 'Stop job alert emails?', description: 'No job alert emails are sent while this is off. Sign-in codes and password resets are unaffected.', confirmLabel: 'Stop alert emails' },
  'monitoring.respect_robots_txt': { when: false, title: 'Ignore robots.txt?', description: 'JobPinglyBot would read career pages whose owners have asked crawlers not to. Only do this if you have permission from those sites.', confirmLabel: 'Ignore robots.txt' },
};

function permissionNote(setting: Setting): string {
  if (setting.permission === 'settings.sensitive') return 'Only an owner can change this.';
  if (setting.permission === 'workers.manage') return 'Requires permission to manage monitoring.';
  return 'Your role cannot change this.';
}

function SettingsView() {
  const { data, error, isLoading, mutate } = useApi<SettingsResponse>('/api/admin/settings');

  if (error) return <ErrorState description={errorMessage(error)} onRetry={() => mutate()} />;
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const banner = data.settings.find(setting => setting.key === 'banner.config');

  return (
    <div className="space-y-6">
      {banner && <BannerEditor setting={banner} onSaved={() => mutate()} />}

      {data.categories.map(category => {
        const settings = data.settings.filter(setting => setting.category === category.id && !setting.managedElsewhere);
        if (settings.length === 0) return null;
        return (
          <Card key={category.id}>
            <CardHeader title={category.label} description={category.description} />
            <ul className="divide-y divide-line">
              {settings.map(setting => (
                <li key={setting.key} className="px-4 py-4 sm:px-5">
                  <SettingRow key={`${setting.key}:${JSON.stringify(setting.value)}`} setting={setting} onSaved={() => mutate()} />
                </li>
              ))}
            </ul>
          </Card>
        );
      })}

      <Callout tone="neutral">
        The digest frequency policy and digest staggering are edited in{' '}
        <Link href="/admin/emails?tab=delivery" className="font-medium text-accent hover:text-accent-hover">
          Email → Delivery
        </Link>
        . Every change on this page is recorded in the{' '}
        <Link href="/admin/audit?targetType=setting" className="font-medium text-accent hover:text-accent-hover">
          audit log
        </Link>
        .
      </Callout>
    </div>
  );
}

function useSaveSetting(onSaved: () => void) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (key: string, value: unknown, label: string) => {
    setBusy(true);
    setError(null);
    try {
      await api('/api/admin/settings', { method: 'PUT', body: { key, value } });
      toast.success(`${label} saved`);
      onSaved();
      return true;
    } catch (err) {
      const message = err instanceof ApiClientError ? (err.fieldErrors.value ?? err.message) : errorMessage(err);
      setError(message);
      toast.error('Could not save the setting', message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { save, busy, error };
}

function Meta({ setting }: { setting: Setting }) {
  if (!setting.updatedAt) return <span className="text-xs text-subtle">Default value</span>;
  return (
    <span className="text-xs text-subtle">
      Changed <TimeAgo value={setting.updatedAt} />
      {setting.updatedBy ? ` by ${setting.updatedBy}` : ''}
    </span>
  );
}

function SettingRow({ setting, onSaved }: { setting: Setting; onSaved: () => void }) {
  const { confirm, element: confirmElement } = useConfirm();
  const { save, busy, error } = useSaveSetting(onSaved);
  const initialText = setting.type === 'json' ? JSON.stringify(setting.value ?? {}, null, 2) : String(setting.value ?? '');
  const [draft, setDraft] = useState(initialText);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const locked = !setting.editable;

  if (setting.type === 'boolean') {
    const checked = setting.value === true;
    const toggle = async (next: boolean) => {
      const risky = RISKY[setting.key];
      if (risky && risky.when === next) {
        const ok = await confirm({ title: risky.title, description: risky.description, confirmLabel: risky.confirmLabel, tone: 'danger' });
        if (!ok) return;
      }
      await save(setting.key, next, setting.label);
    };
    return (
      <div>
        <Switch checked={checked} onChange={value => void toggle(value)} label={setting.label} description={setting.description} disabled={locked || busy} />
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Meta setting={setting} />
          {locked && (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Lock className="h-3 w-3" aria-hidden="true" /> {permissionNote(setting)}
            </span>
          )}
        </div>
        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
        {confirmElement}
      </div>
    );
  }

  const dirty = draft !== initialText;
  const submit = async () => {
    let value: unknown = draft;
    if (setting.type === 'number') {
      if (draft.trim() === '' || !Number.isFinite(Number(draft))) {
        setJsonError('Enter a number.');
        return;
      }
      value = Number(draft);
    } else if (setting.type === 'json') {
      try {
        value = JSON.parse(draft);
      } catch {
        setJsonError('This is not valid JSON.');
        return;
      }
    }
    setJsonError(null);
    await save(setting.key, value, setting.label);
  };

  const hint = [
    setting.description,
    setting.type === 'number' && (setting.min !== undefined || setting.max !== undefined)
      ? `Allowed: ${setting.min ?? '…'} to ${setting.max?.toLocaleString('en-US') ?? '…'}${setting.unit ? ` ${setting.unit}` : ''}.`
      : null,
    setting.key.startsWith('limits.') && setting.min === -1 ? 'Use -1 for no limit.' : null,
    `Default: ${setting.type === 'json' ? 'see documentation' : String(setting.default)}${setting.unit && setting.type === 'number' ? ` ${setting.unit}` : ''}.`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div>
      <Field label={setting.label} hint={hint} error={jsonError ?? error}>
        {ids => (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            {setting.type === 'number' ? (
              <div className="flex items-center gap-2">
                <Input {...ids} type="number" inputMode="decimal" min={setting.min} max={setting.max} step="any" value={draft} disabled={locked} onChange={event => setDraft(event.target.value)} className="w-40" />
                {setting.unit && <span className="text-sm text-muted">{setting.unit}</span>}
              </div>
            ) : setting.type === 'select' && setting.options ? (
              <Select {...ids} value={draft} disabled={locked} onChange={event => setDraft(event.target.value)} className="sm:w-72">
                {setting.options.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            ) : setting.type === 'json' || (setting.maxLength ?? 0) > 120 ? (
              <Textarea {...ids} rows={setting.type === 'json' ? 6 : 2} maxLength={setting.maxLength} value={draft} disabled={locked} onChange={event => setDraft(event.target.value)} className={setting.type === 'json' ? 'font-mono text-sm' : undefined} />
            ) : (
              <Input {...ids} maxLength={setting.maxLength} value={draft} disabled={locked} onChange={event => setDraft(event.target.value)} className="sm:max-w-md" />
            )}
            {!locked && dirty && (
              <div className="flex shrink-0 gap-2">
                <Button variant="primary" size="sm" loading={busy} onClick={submit} className="h-9">
                  Save
                </Button>
                <Button
                  size="sm"
                  className="h-9"
                  disabled={busy}
                  onClick={() => {
                    setDraft(initialText);
                    setJsonError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}
      </Field>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Meta setting={setting} />
        {locked && (
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <Lock className="h-3 w-3" aria-hidden="true" /> {permissionNote(setting)}
          </span>
        )}
      </div>
    </div>
  );
}

function toBanner(value: unknown): BannerConfig {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const type = ['info', 'success', 'warning'].includes(String(raw.type)) ? (raw.type as BannerConfig['type']) : 'info';
  return {
    enabled: raw.enabled === true,
    message: typeof raw.message === 'string' ? raw.message : '',
    type,
    linkUrl: typeof raw.linkUrl === 'string' ? raw.linkUrl : '',
    linkText: typeof raw.linkText === 'string' ? raw.linkText : '',
    bannerId: typeof raw.bannerId === 'string' ? raw.bannerId : '',
  };
}

/** A link must be a site path or an https address; anything else is dropped by /api/banner. */
function linkProblem(url: string): string | null {
  const value = url.trim();
  if (!value) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? null : 'Use an https:// address or a path on this site such as /pricing.';
  } catch {
    return 'Use an https:// address or a path on this site such as /pricing.';
  }
}

function BannerEditor({ setting, onSaved }: { setting: Setting; onSaved: () => void }) {
  const stored = toBanner(setting.value);
  const [form, setForm] = useState<BannerConfig>(stored);
  const { save, busy, error } = useSaveSetting(onSaved);
  const locked = !setting.editable;
  const problem = linkProblem(form.linkUrl);
  const dirty = JSON.stringify(form) !== JSON.stringify(stored);

  const publish = async (next: BannerConfig) => {
    // A new id whenever the content changes, so people who dismissed the old announcement see the new one.
    const contentChanged = next.message !== stored.message || next.linkUrl !== stored.linkUrl || next.linkText !== stored.linkText || next.type !== stored.type;
    const bannerId = contentChanged || !next.bannerId ? `b-${Date.now().toString(36)}` : next.bannerId;
    const value = { ...next, message: next.message.trim(), linkUrl: next.linkUrl.trim(), linkText: next.linkText.trim(), bannerId };
    if (await save('banner.config', value, 'Announcement')) setForm(value);
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-muted" aria-hidden="true" /> Site announcement
          </span>
        }
        description="A bar shown at the top of the public site and the dashboard. People can dismiss it; changing the text shows it to them again."
        action={<Meta setting={setting} />}
      />
      <CardBody className="space-y-4">
        {locked && <Callout tone="neutral">{permissionNote(setting)}</Callout>}
        <Switch checked={form.enabled} onChange={enabled => setForm({ ...form, enabled })} label="Show the announcement" disabled={locked || busy} />
        <Field label="Message" hint={`${form.message.length}/300 characters. Plain text.`}>
          {ids => <Textarea {...ids} rows={2} maxLength={300} value={form.message} disabled={locked} onChange={event => setForm({ ...form, message: event.target.value })} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)_12rem]">
          <Field label="Style">
            {ids => (
              <Select {...ids} value={form.type} disabled={locked} onChange={event => setForm({ ...form, type: event.target.value as BannerConfig['type'] })}>
                <option value="info">Information</option>
                <option value="success">Good news</option>
                <option value="warning">Warning</option>
              </Select>
            )}
          </Field>
          <Field label="Link" optional error={problem}>
            {ids => <Input {...ids} inputMode="url" placeholder="/pricing or https://…" value={form.linkUrl} disabled={locked} onChange={event => setForm({ ...form, linkUrl: event.target.value })} />}
          </Field>
          <Field label="Link text" optional>
            {ids => <Input {...ids} maxLength={40} placeholder="Learn more" value={form.linkText} disabled={locked} onChange={event => setForm({ ...form, linkText: event.target.value })} />}
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink">Preview</p>
          <BannerPreview banner={form} />
        </div>
        {error && <Callout tone="danger">{error}</Callout>}
        {!locked && (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" loading={busy} disabled={!dirty || Boolean(problem) || (form.enabled && !form.message.trim())} onClick={() => publish(form)}>
              {form.enabled ? 'Publish announcement' : 'Save'}
            </Button>
            {dirty && (
              <Button disabled={busy} onClick={() => setForm(stored)}>
                Discard changes
              </Button>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function AdminSettingsPage() {
  return (
    <RequirePermission permission="settings.read">
      <PageHeader title="Settings" description="Platform switches, limits and the site announcement. Changes take effect within about 30 seconds." />
      <SettingsView />
    </RequirePermission>
  );
}
