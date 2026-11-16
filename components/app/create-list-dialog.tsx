'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Switch, TagInput, Textarea } from '@/components/ui/form';
import { Dialog } from '@/components/ui/overlay';
import { Callout } from '@/components/ui/primitives';
import { api, ApiClientError, errorMessage } from '@/lib/client/api';

export function CreateListDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', description: '', isPublic: false, tags: [] as string[] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const list = await api<{ id: string }>('/api/lists', {
        body: { name: form.name, description: form.description || null, visibility: form.isPublic ? 'public' : 'private', tags: form.tags },
      });
      setForm({ name: '', description: '', isPublic: false, tags: [] });
      onClose();
      router.push(`/dashboard/watchlists/${list.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? (err.fieldErrors.name ?? err.message) : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      title="New watchlist"
      description="Group companies you want to follow together. You can change everything later."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!form.name.trim()} onClick={create}>
            Create watchlist
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          {ids => <Input {...ids} value={form.name} maxLength={80} placeholder="e.g. Remote-friendly fintech" onChange={event => setForm({ ...form, name: event.target.value })} autoFocus />}
        </Field>
        <Field label="Description" optional>
          {ids => <Textarea {...ids} rows={2} maxLength={300} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} />}
        </Field>
        <Field label="Tags" optional hint="Help people find it in the directory if you make it public.">
          {ids => <TagInput {...ids} value={form.tags} max={8} onChange={tags => setForm({ ...form, tags })} placeholder="e.g. fintech, bangladesh" />}
        </Field>
        <Switch
          checked={form.isPublic}
          onChange={isPublic => setForm({ ...form, isPublic })}
          label="Public"
          description="Anyone can see the companies and follow the list. Your alert keywords always stay private."
        />
        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Dialog>
  );
}
