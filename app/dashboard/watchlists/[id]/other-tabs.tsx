'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, UserPlus, X } from 'lucide-react';
import { useRevalidateWorkspace } from '@/components/app/add-company-dialog';
import { UserAvatar } from '@/components/app/bits';
import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Switch, TagInput, Textarea } from '@/components/ui/form';
import { useConfirm } from '@/components/ui/overlay';
import { Badge, Card, CardBody, CardHeader, Callout, EmptyState, ErrorState, SkeletonRows } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, errorMessage } from '@/lib/client/api';
import { formatRelative } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';
import type { ListDetail } from './types';

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

interface Member {
  id: string;
  userId: string;
  role: string;
  status: string;
  name: string | null;
  email: string | null;
  createdAt: string;
}

export function MembersTab({ detail }: { detail: ListDetail }) {
  const toast = useToast();
  const router = useRouter();
  const { user } = useSession();
  const { confirm, element: confirmElement } = useConfirm();
  const listId = detail.list.id;
  const { data, error, isLoading, mutate } = useApi<Member[]>(`/api/lists/${listId}/members`);
  const [invite, setInvite] = useState({ email: '', role: 'editor' });
  const [busy, setBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setInviteError(null);
    try {
      await api(`/api/lists/${listId}/members`, { body: invite });
      toast.success('Invitation sent', `If ${invite.email} has a JobPingly account, they will get an email and a notification.`);
      setInvite({ email: '', role: 'editor' });
      await mutate();
    } catch (err) {
      setInviteError(err instanceof ApiClientError ? (err.fieldErrors.email ?? err.message) : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (member: Member) => {
    const self = member.userId === user.id;
    const ok = await confirm({
      title: self ? 'Leave this watchlist?' : `Remove ${member.name ?? 'this member'}?`,
      description: self ? 'You will no longer be able to edit it.' : 'They will no longer be able to edit this watchlist.',
      confirmLabel: self ? 'Leave' : 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/lists/${listId}/members/${member.id}`, { method: 'DELETE' });
      if (self) {
        router.push('/dashboard/watchlists');
        return;
      }
      await mutate();
    } catch (err) {
      toast.error('Could not remove', errorMessage(err));
    }
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader title="People who maintain this watchlist" />
        {error ? (
          <ErrorState description="Members could not be loaded." onRetry={() => mutate()} />
        ) : isLoading ? (
          <SkeletonRows rows={2} />
        ) : (
          <ul className="divide-y divide-line">
            <li className="flex items-center gap-3 px-5 py-3">
              <UserAvatar name={detail.list.owner.name} size="sm" />
              <span className="flex-1 text-base text-ink">{detail.list.owner.name ?? 'Owner'}</span>
              <Badge tone="neutral">Owner</Badge>
            </li>
            {(data ?? []).map(member => (
              <li key={member.id} className="flex items-center gap-3 px-5 py-3">
                <UserAvatar name={member.name ?? member.email} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base text-ink">{member.name ?? member.email ?? 'Member'}</p>
                  {member.email && member.name && <p className="truncate text-sm text-muted">{member.email}</p>}
                </div>
                <Badge tone={member.status === 'pending' ? 'warning' : 'outline'}>
                  {member.status === 'pending' ? 'Invited' : member.role === 'moderator' ? 'Moderator' : 'Editor'}
                </Badge>
                {(detail.access.canManageMembers || member.userId === user.id) && (
                  <Button size="sm" variant="ghost" onClick={() => remove(member)}>
                    {member.userId === user.id ? 'Leave' : 'Remove'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {detail.access.canManageMembers && (
        <Card>
          <CardHeader title="Invite someone" description="Editors can add and remove companies. Moderators can also edit the details and review suggestions." />
          <CardBody className="space-y-4">
            <Field label="Their JobPingly email" error={inviteError}>
              {ids => <Input {...ids} type="email" value={invite.email} onChange={event => setInvite({ ...invite, email: event.target.value })} />}
            </Field>
            <Field label="Role">
              {ids => (
                <Select {...ids} value={invite.role} onChange={event => setInvite({ ...invite, role: event.target.value })}>
                  <option value="editor">Editor</option>
                  <option value="moderator">Moderator</option>
                </Select>
              )}
            </Field>
            <Button variant="primary" icon={<UserPlus className="h-4 w-4" />} loading={busy} disabled={!invite.email.trim()} onClick={send}>
              Send invitation
            </Button>
          </CardBody>
        </Card>
      )}
      {confirmElement}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

interface Suggestion {
  id: string;
  url: string;
  companyName: string | null;
  createdAt: string;
  contributor: string | null;
}

export function SuggestionsTab({ detail, onChanged }: { detail: ListDetail; onChanged: () => void }) {
  const toast = useToast();
  const revalidate = useRevalidateWorkspace();
  const listId = detail.list.id;
  const { data, error, isLoading, mutate } = useApi<Suggestion[]>(`/api/lists/${listId}/suggestions`);
  const [busyId, setBusyId] = useState<string | null>(null);

  const review = async (suggestion: Suggestion, action: 'approve' | 'reject') => {
    setBusyId(suggestion.id);
    try {
      await api(`/api/lists/${listId}/suggestions/${suggestion.id}`, { body: { action } });
      toast.success(action === 'approve' ? 'Added to the watchlist' : 'Suggestion rejected');
      await mutate();
      onChanged();
      if (action === 'approve') void revalidate();
    } catch (err) {
      toast.error('Could not review the suggestion', errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <ErrorState description="Suggestions could not be loaded." onRetry={() => mutate()} />;
  if (isLoading) return <SkeletonRows rows={3} />;
  if (!data || data.length === 0) {
    return <EmptyState className="rounded-lg border border-dashed border-line" title="No suggestions waiting" description="When someone suggests a company for this public watchlist, it appears here for you to approve." />;
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
      {data.map(suggestion => (
        <li key={suggestion.id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium text-ink">{suggestion.companyName ?? suggestion.url}</p>
            <p className="truncate text-sm text-muted">
              {suggestion.url} · suggested by {suggestion.contributor ?? 'a JobPingly user'} {formatRelative(suggestion.createdAt)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" icon={<X className="h-3.5 w-3.5" />} disabled={busyId === suggestion.id} onClick={() => review(suggestion, 'reject')}>
              Reject
            </Button>
            <Button size="sm" variant="primary" icon={<Check className="h-3.5 w-3.5" />} loading={busyId === suggestion.id} onClick={() => review(suggestion, 'approve')}>
              Add
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function SettingsTab({ detail, onChanged }: { detail: ListDetail; onChanged: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const { confirm, element: confirmElement } = useConfirm();
  const [form, setForm] = useState({
    name: detail.list.name,
    description: detail.list.description ?? '',
    tags: detail.list.tags,
    isPublic: detail.list.visibility === 'public',
    pinned: detail.list.pinned,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/lists/${detail.list.id}`, {
        method: 'PATCH',
        body: {
          ...(detail.access.canEditDetails ? { name: form.name, description: form.description || null, tags: form.tags } : {}),
          ...(detail.access.canChangeVisibility ? { visibility: form.isPublic ? 'public' : 'private' } : {}),
          ...(detail.access.role === 'owner' ? { pinned: form.pinned } : {}),
        },
      });
      toast.success('Watchlist updated');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? (Object.values(err.fieldErrors)[0] ?? err.message) : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete this watchlist?',
      description: `“${detail.list.name}” will be removed for you and for everyone following it. Your alerts for it stop immediately.`,
      confirmLabel: 'Delete watchlist',
      tone: 'danger',
      typeToConfirm: detail.list.name,
    });
    if (!ok) return;
    try {
      await api(`/api/lists/${detail.list.id}`, { method: 'DELETE' });
      toast.success('Watchlist deleted');
      router.push('/dashboard/watchlists');
    } catch (err) {
      toast.error('Could not delete', errorMessage(err));
    }
  };

  const goingPublic = form.isPublic && detail.list.visibility !== 'public';
  const goingPrivate = !form.isPublic && detail.list.visibility === 'public';

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardBody className="space-y-4">
          <Field label="Name">
            {ids => <Input {...ids} value={form.name} maxLength={80} disabled={!detail.access.canEditDetails} onChange={event => setForm({ ...form, name: event.target.value })} />}
          </Field>
          <Field label="Description" optional>
            {ids => <Textarea {...ids} rows={3} maxLength={300} value={form.description} disabled={!detail.access.canEditDetails} onChange={event => setForm({ ...form, description: event.target.value })} />}
          </Field>
          <Field label="Tags" optional>
            {ids => <TagInput {...ids} value={form.tags} max={8} disabled={!detail.access.canEditDetails} onChange={tags => setForm({ ...form, tags })} />}
          </Field>
          {detail.access.canChangeVisibility && (
            <Switch
              checked={form.isPublic}
              onChange={isPublic => setForm({ ...form, isPublic })}
              label="Public"
              description="Anyone can view the companies on this list and follow it. Your own keywords stay private."
            />
          )}
          {goingPublic && <Callout tone="accent">The list will get a public page and appear in the directory once it has at least one company.</Callout>}
          {goingPrivate && <Callout tone="warning">People following this list will stop seeing its jobs and receiving its alerts.</Callout>}
          {detail.access.role === 'owner' && (
            <Switch checked={form.pinned} onChange={pinned => setForm({ ...form, pinned })} label="Pin to the top" description="Pinned watchlists are listed first." />
          )}
          {error && <Callout tone="danger">{error}</Callout>}
          <Button variant="primary" loading={busy} onClick={save}>
            Save changes
          </Button>
        </CardBody>
      </Card>

      {detail.access.canDelete && (
        <Card className="border-danger/30">
          <CardHeader title="Delete watchlist" description="This removes the list for everyone who follows it." />
          <CardBody>
            <Button variant="danger" onClick={remove}>
              Delete this watchlist
            </Button>
          </CardBody>
        </Card>
      )}
      {confirmElement}
    </div>
  );
}
