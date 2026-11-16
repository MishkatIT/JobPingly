'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/client/api';

export function UnsubscribeForm({ token, maskedEmail, alreadyUnsubscribed }: { token: string; maskedEmail: string; alreadyUnsubscribed: boolean }) {
  const [unsubscribed, setUnsubscribed] = useState(alreadyUnsubscribed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (resubscribe: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/unsubscribe?token=${encodeURIComponent(token)}${resubscribe ? '&action=resubscribe' : ''}`, { method: 'POST', body: {} });
      setUnsubscribed(!resubscribe);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {unsubscribed ? (
        <>
          <h1 className="text-2xl">You are unsubscribed</h1>
          <p className="mt-2 text-base text-muted">
            {maskedEmail} will no longer receive job alert emails. Account emails such as password resets are still sent. New matches keep appearing in your dashboard.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button loading={busy} onClick={() => submit(true)}>
              Turn alert emails back on
            </Button>
            <Link href="/dashboard/settings/notifications" className="text-base font-medium text-accent hover:text-accent-hover">
              Notification settings
            </Link>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-2xl">Stop job alert emails?</h1>
          <p className="mt-2 text-base text-muted">
            {maskedEmail} will stop receiving job alert emails from JobPingly. You can turn them back on at any time. To get fewer emails instead, change how often they are sent in your notification settings.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button variant="primary" loading={busy} onClick={() => submit(false)}>
              Unsubscribe
            </Button>
            <Link href="/dashboard/settings/notifications" className="text-base font-medium text-accent hover:text-accent-hover">
              Change how often instead
            </Link>
          </div>
        </>
      )}
      {error && (
        <Callout tone="danger" className="mt-4">
          {error}
        </Callout>
      )}
    </div>
  );
}
