'use client';

import { useState } from 'react';
import { Laptop, LogOut, Smartphone } from 'lucide-react';
import { TimeAgo } from '@/components/app/bits';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { useConfirm } from '@/components/ui/overlay';
import { Badge, Card, CardBody, CardHeader, ErrorState, SkeletonRows } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, errorMessage } from '@/lib/client/api';
import { useApi } from '@/lib/client/use-api';
import type { Profile } from '../types';

interface Session {
  id: string;
  device: string;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  current: boolean;
}

export default function SecuritySettingsPage() {
  const { data, mutate } = useApi<{ profile: Profile }>('/api/me');
  return (
    <>
      <PasswordCard hasPassword={data?.profile.hasPassword ?? true} onChanged={() => mutate()} />
      {data?.profile.hasGoogle !== undefined && (
        <Card>
          <CardHeader title="Google sign-in" />
          <CardBody className="flex items-center justify-between gap-4">
            <p className="text-base text-muted">
              {data.profile.hasGoogle
                ? 'Your Google account is connected. You can sign in with Google or, if you set one, your password.'
                : 'Not connected. Signing in with Google using the same email address connects it automatically.'}
            </p>
            <Badge tone={data.profile.hasGoogle ? 'success' : 'neutral'}>{data.profile.hasGoogle ? 'Connected' : 'Not connected'}</Badge>
          </CardBody>
        </Card>
      )}
      <SessionsCard />
    </>
  );
}

function PasswordCard({ hasPassword, onChanged }: { hasPassword: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.newPassword !== form.confirm) {
      setErrors({ confirm: 'The two passwords do not match.' });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      await api('/api/me/password', { body: { currentPassword: hasPassword ? form.currentPassword : undefined, newPassword: form.newPassword } });
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success(hasPassword ? 'Password changed' : 'Password set', 'Other devices were signed out.');
      onChanged();
    } catch (err) {
      if (err instanceof ApiClientError && Object.keys(err.fieldErrors).length > 0) setErrors(err.fieldErrors);
      else toast.error('Could not change the password', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={hasPassword ? 'Password' : 'Set a password'}
        description={hasPassword ? 'Changing your password signs you out everywhere else.' : 'You sign in with Google. Add a password to also sign in with your email address.'}
      />
      <CardBody>
        <form onSubmit={submit} className="space-y-4">
          {hasPassword && (
            <Field label="Current password" error={errors.currentPassword}>
              {ids => <Input {...ids} type="password" autoComplete="current-password" required value={form.currentPassword} onChange={event => setForm({ ...form, currentPassword: event.target.value })} />}
            </Field>
          )}
          <Field label="New password" error={errors.newPassword} hint="At least 8 characters. Avoid passwords you use elsewhere.">
            {ids => <Input {...ids} type="password" autoComplete="new-password" required value={form.newPassword} onChange={event => setForm({ ...form, newPassword: event.target.value })} />}
          </Field>
          <Field label="Repeat the new password" error={errors.confirm}>
            {ids => <Input {...ids} type="password" autoComplete="new-password" required value={form.confirm} onChange={event => setForm({ ...form, confirm: event.target.value })} />}
          </Field>
          <Button type="submit" variant="primary" loading={busy}>
            {hasPassword ? 'Change password' : 'Set password'}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function SessionsCard() {
  const toast = useToast();
  const { confirm, element: confirmElement } = useConfirm();
  const { data, error, isLoading, mutate } = useApi<Session[]>('/api/me/sessions');
  const others = (data ?? []).filter(session => !session.current);

  const revoke = async (session: Session) => {
    try {
      await api(`/api/me/sessions/${session.id}`, { method: 'DELETE' });
      toast.success('Signed out of that device');
      await mutate();
    } catch (err) {
      toast.error('Could not sign out that device', errorMessage(err));
    }
  };

  const revokeOthers = async () => {
    const ok = await confirm({ title: 'Sign out of all other devices?', description: 'You stay signed in here.', confirmLabel: 'Sign out others' });
    if (!ok) return;
    try {
      const result = await api<{ revoked: number }>('/api/me/sessions', { method: 'DELETE' });
      toast.success(`Signed out of ${result.revoked} other ${result.revoked === 1 ? 'device' : 'devices'}`);
      await mutate();
    } catch (err) {
      toast.error('Could not sign out other devices', errorMessage(err));
    }
  };

  return (
    <Card>
      <CardHeader
        title="Where you are signed in"
        description="Sessions end after 30 days without use."
        action={
          others.length > 0 ? (
            <Button size="sm" icon={<LogOut className="h-3.5 w-3.5" />} onClick={revokeOthers}>
              Sign out others
            </Button>
          ) : undefined
        }
      />
      {error ? (
        <ErrorState description="Sessions could not be loaded." onRetry={() => mutate()} />
      ) : isLoading ? (
        <SkeletonRows rows={2} />
      ) : (
        <ul className="divide-y divide-line">
          {(data ?? []).map(session => {
            const mobile = /iphone|android|mobile|ipad/i.test(session.device);
            const Icon = mobile ? Smartphone : Laptop;
            return (
              <li key={session.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-sunken text-muted">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-base text-ink">
                    <span className="truncate">{session.device}</span>
                    {session.current && <Badge tone="success">This device</Badge>}
                  </p>
                  <p className="text-sm text-muted">
                    {session.ipAddress ? `${session.ipAddress} · ` : ''}
                    Last active <TimeAgo value={session.lastUsedAt ?? session.createdAt} />
                  </p>
                </div>
                {!session.current && (
                  <Button size="sm" variant="ghost" onClick={() => revoke(session)}>
                    Sign out
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {confirmElement}
    </Card>
  );
}
