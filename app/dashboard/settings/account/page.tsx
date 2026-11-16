'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button, buttonClass } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Dialog } from '@/components/ui/overlay';
import { Callout, Card, CardBody, CardHeader, Skeleton } from '@/components/ui/primitives';
import { api, ApiClientError, errorMessage } from '@/lib/client/api';
import { useApi } from '@/lib/client/use-api';
import type { Profile } from '../types';

export default function AccountSettingsPage() {
  const { data } = useApi<{ profile: Profile }>('/api/me');
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <Card>
        <CardHeader title="Download your data" description="Your profile, watchlists, alert keywords, tracker and recent notifications as a JSON file." />
        <CardBody>
          <a href="/api/me/export" download className={buttonClass('secondary', 'md')}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Download my data
          </a>
        </CardBody>
      </Card>

      <Card className="border-danger/30">
        <CardHeader title="Delete account" description="Permanently deletes your account, your watchlists (including public ones other people follow), alerts and tracker. This cannot be undone." />
        <CardBody>
          {!data ? (
            <Skeleton className="h-9 w-40" />
          ) : data.profile.role === 'owner' ? (
            <Callout tone="neutral">The platform owner account cannot be deleted. Transfer ownership to another account first.</Callout>
          ) : (
            <Button variant="danger" onClick={() => setDeleting(true)}>
              Delete my account
            </Button>
          )}
        </CardBody>
      </Card>

      {data && <DeleteAccountDialog open={deleting} profile={data.profile} onClose={() => setDeleting(false)} />}
    </>
  );
}

function DeleteAccountDialog({ open, profile, onClose }: { open: boolean; profile: Profile; onClose: () => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/api/me', { method: 'DELETE', body: profile.hasPassword ? { password: value } : { email: value } });
      window.location.assign(new URL('/login?reason=deleted', window.location.origin).href);
    } catch (err) {
      setError(err instanceof ApiClientError ? (Object.values(err.fieldErrors)[0] ?? err.message) : errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        setValue('');
        setError(null);
        onClose();
      }}
      busy={busy}
      size="sm"
      title="Delete your account?"
      description="Everything is removed immediately and cannot be recovered. Consider downloading your data first."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} disabled={!value.trim()} onClick={remove}>
            Delete permanently
          </Button>
        </>
      }
    >
      <Field label={profile.hasPassword ? 'Enter your password to confirm' : `Type ${profile.email} to confirm`} error={error}>
        {ids => <Input {...ids} type={profile.hasPassword ? 'password' : 'email'} autoComplete={profile.hasPassword ? 'current-password' : 'off'} value={value} onChange={event => setValue(event.target.value)} autoFocus />}
      </Field>
    </Dialog>
  );
}
