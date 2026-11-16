'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, Copy, Link2, Plus } from 'lucide-react';
import { Button, LinkButton } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Dialog } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, errorMessage } from '@/lib/client/api';

interface Props {
  listId: string;
  slug: string;
  name: string;
  signedIn: boolean;
  isFollowing: boolean;
  isOwner: boolean;
  canEdit: boolean;
}

export function ListActions({ listId, slug, name, signedIn, isFollowing, isOwner, canEdit }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [following, setFollowing] = useState(isFollowing);
  const [busy, setBusy] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestion, setSuggestion] = useState({ url: '', companyName: '' });
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const next = `?next=${encodeURIComponent(`/lists/${slug}`)}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast.success('Link copied');
  };

  if (!signedIn) {
    return (
      <div className="flex flex-wrap gap-2">
        <LinkButton href={`/register${next}`} variant="primary" icon={<Plus className="h-4 w-4" />}>
          Follow for alerts
        </LinkButton>
        <Button onClick={copyLink} icon={<Link2 className="h-4 w-4" />}>
          Copy link
        </Button>
      </div>
    );
  }

  if (isOwner || canEdit) {
    return (
      <div className="flex flex-wrap gap-2">
        <LinkButton href={`/dashboard/watchlists/${listId}`} variant="primary">
          Manage watchlist
        </LinkButton>
        <Button onClick={copyLink} icon={<Link2 className="h-4 w-4" />}>
          Copy link
        </Button>
      </div>
    );
  }

  const toggleFollow = async () => {
    setBusy('follow');
    try {
      if (following) {
        await api(`/api/lists/${listId}/follow`, { method: 'DELETE' });
        setFollowing(false);
        toast.success('Unfollowed', `You will no longer get alerts from “${name}”.`);
      } else {
        await api(`/api/lists/${listId}/follow`, { method: 'POST', body: {} });
        setFollowing(true);
        toast.info('Following', 'Set your keywords to choose which jobs you hear about.', {
          label: 'Set up alerts',
          onClick: () => router.push(`/dashboard/watchlists/${listId}?tab=alerts`),
        });
      }
      router.refresh();
    } catch (error) {
      toast.error('Something went wrong', errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const copyList = async () => {
    setBusy('copy');
    try {
      const created = await api<{ id: string }>(`/api/lists/${listId}/duplicate`, { method: 'POST', body: {} });
      toast.success('Copied to your watchlists');
      router.push(`/dashboard/watchlists/${created.id}`);
    } catch (error) {
      toast.error('Could not copy this watchlist', errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const submitSuggestion = async () => {
    setBusy('suggest');
    setSuggestError(null);
    try {
      await api(`/api/lists/${listId}/suggestions`, { method: 'POST', body: { url: suggestion.url, companyName: suggestion.companyName || null } });
      toast.success('Suggestion sent', 'The owner will review it.');
      setSuggestion({ url: '', companyName: '' });
      setSuggestOpen(false);
    } catch (error) {
      setSuggestError(error instanceof ApiClientError ? (error.fieldErrors.url ?? error.message) : errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant={following ? 'secondary' : 'primary'} loading={busy === 'follow'} onClick={toggleFollow} icon={following ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}>
        {following ? 'Following' : 'Follow for alerts'}
      </Button>
      <Button loading={busy === 'copy'} onClick={copyList} icon={<Copy className="h-4 w-4" />}>
        Copy to my watchlists
      </Button>
      <Button variant="ghost" onClick={() => setSuggestOpen(true)}>
        Suggest a company
      </Button>

      <Dialog
        open={suggestOpen}
        onClose={() => setSuggestOpen(false)}
        busy={busy === 'suggest'}
        title={`Suggest a company for “${name}”`}
        description="The owner of this watchlist decides whether to add it."
        footer={
          <>
            <Button onClick={() => setSuggestOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy === 'suggest'} onClick={submitSuggestion}>
              Send suggestion
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Careers page or job board link" error={suggestError}>
            {ids => <Input {...ids} placeholder="jobs.lever.co/company" value={suggestion.url} onChange={event => setSuggestion({ ...suggestion, url: event.target.value })} />}
          </Field>
          <Field label="Company name" optional>
            {ids => <Input {...ids} value={suggestion.companyName} onChange={event => setSuggestion({ ...suggestion, companyName: event.target.value })} />}
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
