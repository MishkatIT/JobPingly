'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/client/api';

export function InvitationActions({ invitationId, listId }: { invitationId: string; listId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [declined, setDeclined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const respond = async (action: 'accept' | 'decline') => {
    setBusy(action);
    setError(null);
    try {
      await api(`/api/invitations/${invitationId}`, { body: { action } });
      if (action === 'accept') router.push(`/dashboard/watchlists/${listId}`);
      else setDeclined(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (declined) return <p className="mt-6 text-base text-muted">Invitation declined. You can close this page.</p>;

  return (
    <div className="mt-6 space-y-3">
      {error && <Callout tone="danger">{error}</Callout>}
      <div className="flex gap-2">
        <Button variant="primary" loading={busy === 'accept'} disabled={busy !== null} onClick={() => respond('accept')}>
          Accept invitation
        </Button>
        <Button loading={busy === 'decline'} disabled={busy !== null} onClick={() => respond('decline')}>
          Decline
        </Button>
      </div>
    </div>
  );
}
