'use client';

import { useState } from 'react';
import { Eye, Send } from 'lucide-react';
import { SafeEmailFrame } from '@/components/admin/ops-bits';
import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { useConfirm } from '@/components/ui/overlay';
import { Callout, Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, errorMessage } from '@/lib/client/api';
import { formatNumber, plural } from '@/lib/client/format';
import type { EmailStats } from './types';

const AUDIENCES = [
  { value: 'all', label: 'Everyone who receives email', description: 'Verified, active accounts that have not unsubscribed.' },
  { value: 'active30', label: 'People active in the last 30 days', description: 'The same, limited to people who used JobPingly in the last 30 days.' },
  { value: 'alerts_on', label: 'People with at least one alert switched on', description: 'The same, limited to people following a watchlist with email alerts on.' },
] as const;

type Audience = (typeof AUDIENCES)[number]['value'];

interface BroadcastPreview {
  recipients: number;
  wouldSend: number;
  remainingToday: number;
  preview: { subject: string; html: string };
}

export function SendTab({ stats, onChanged }: { stats: EmailStats | undefined; onChanged: () => void }) {
  const consoleMode = stats ? stats.provider !== 'brevo' : false;
  return (
    <div className="max-w-3xl space-y-6">
      {consoleMode && (
        <Callout tone="warning" title="Console mode">
          The email provider is not configured, so anything sent here is written to the server log instead of being delivered.
        </Callout>
      )}
      <TestEmailCard onChanged={onChanged} />
      <BroadcastCard onChanged={onChanged} />
    </div>
  );
}

function TestEmailCard({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const { user } = useSession();
  const [to, setTo] = useState(user.email);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ sent: boolean; simulated: boolean }>('/api/admin/emails/test', { body: { to: to.trim(), note: note.trim() || null } });
      if (result.simulated) toast.info('Test email logged', 'The provider is in console mode, so it was written to the server log instead of being delivered.');
      else toast.success('Test email sent', `Check the inbox of ${to.trim()}.`);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? (err.fieldErrors.to ?? err.message) : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Send a test email" description="Checks that the email provider accepts messages. It counts towards today's sending limit." />
      <CardBody className="space-y-4">
        <Field label="Send to" error={error}>
          {ids => <Input {...ids} type="email" value={to} onChange={event => setTo(event.target.value)} className="sm:max-w-sm" />}
        </Field>
        <Field label="Note" optional hint="Added to the message, for example to tell test emails apart.">
          {ids => <Input {...ids} maxLength={300} value={note} onChange={event => setNote(event.target.value)} />}
        </Field>
        <Button variant="primary" icon={<Send className="h-4 w-4" />} loading={busy} disabled={!to.trim()} onClick={send}>
          Send test email
        </Button>
      </CardBody>
    </Card>
  );
}

function BroadcastCard({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const { confirm, element: confirmElement } = useConfirm();
  const [form, setForm] = useState<{ subject: string; message: string; audience: Audience }>({ subject: '', message: '', audience: 'all' });
  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const [result, setResult] = useState<{ recipients: number; sent: number; failed: number; skipped: number } | null>(null);
  const [busy, setBusy] = useState<'preview' | 'send' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Any edit invalidates the preview, so what is sent is always what was reviewed.
  const edit = (changes: Partial<typeof form>) => {
    setForm(current => ({ ...current, ...changes }));
    setPreview(null);
    setResult(null);
  };

  const body = { subject: form.subject.trim(), message: form.message.trim(), audience: form.audience };

  const runPreview = async () => {
    setBusy('preview');
    setError(null);
    try {
      setPreview(await api<BroadcastPreview>('/api/admin/emails/broadcast', { body: { ...body, dryRun: true } }));
    } catch (err) {
      setError(err instanceof ApiClientError ? (Object.values(err.fieldErrors)[0] ?? err.message) : errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (!preview) return;
    const ok = await confirm({
      title: `Send this announcement to ${plural(preview.wouldSend, 'person', 'people')}?`,
      description:
        preview.wouldSend < preview.recipients
          ? `${formatNumber(preview.recipients - preview.wouldSend)} of the ${formatNumber(preview.recipients)} recipients will be skipped because of today's sending limit. Emails cannot be recalled once sent.`
          : 'Emails cannot be recalled once sent.',
      confirmLabel: 'Send announcement',
      tone: 'danger',
      typeToConfirm: 'SEND',
    });
    if (!ok) return;
    setBusy('send');
    setError(null);
    try {
      const sent = await api<{ recipients: number; sent: number; failed: number; skipped: number }>('/api/admin/emails/broadcast', { body: { ...body, dryRun: false } });
      setResult(sent);
      setPreview(null);
      toast.success(`Announcement sent to ${plural(sent.sent, 'person', 'people')}`);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const audience = AUDIENCES.find(item => item.value === form.audience)!;

  return (
    <Card>
      <CardHeader title="Send an announcement" description="A plain-text email to many users, with an unsubscribe link. Preview it first; you will see exactly how many people it goes to." />
      <CardBody className="space-y-4">
        <Field label="Subject">{ids => <Input {...ids} maxLength={140} value={form.subject} onChange={event => edit({ subject: event.target.value })} />}</Field>
        <Field label="Message" hint={`${form.message.length.toLocaleString('en-US')}/10,000 characters. Plain text; line breaks are kept. Each email starts with “Hi <first name>,”.`}>
          {ids => <Textarea {...ids} rows={8} maxLength={10_000} value={form.message} onChange={event => edit({ message: event.target.value })} />}
        </Field>
        <Field label="Recipients" hint={audience.description}>
          {ids => (
            <Select {...ids} value={form.audience} onChange={event => edit({ audience: event.target.value as Audience })} className="sm:max-w-md">
              {AUDIENCES.map(item => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {error && <Callout tone="danger">{error}</Callout>}

        {result && (
          <Callout tone={result.failed > 0 ? 'warning' : 'success'} title="Announcement sent">
            {plural(result.sent, 'email')} sent{result.failed > 0 ? `, ${formatNumber(result.failed)} failed` : ''}
            {result.skipped > 0 ? `, ${formatNumber(result.skipped)} skipped because of the daily limit (send the announcement again tomorrow to reach them; people who already got it would get it twice)` : ''}.
          </Callout>
        )}

        {preview && (
          <div className="space-y-3 rounded-md border border-line p-3">
            <p className="text-sm text-ink">
              <span className="font-semibold">{formatNumber(preview.wouldSend)}</span> of {plural(preview.recipients, 'matching recipient')} will get this email now.
              {preview.wouldSend < preview.recipients && (
                <span className="text-warning"> Only {formatNumber(preview.remainingToday)} more emails can be sent today (at most 500 per announcement).</span>
              )}
            </p>
            <SafeEmailFrame html={preview.preview.html} title="Announcement preview" className="h-[50dvh]" />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button icon={<Eye className="h-4 w-4" />} loading={busy === 'preview'} disabled={busy !== null || !body.subject || !body.message} onClick={runPreview}>
            {preview ? 'Preview again' : 'Preview'}
          </Button>
          <Button variant="primary" icon={<Send className="h-4 w-4" />} loading={busy === 'send'} disabled={busy !== null || !preview || preview.wouldSend === 0} onClick={send}>
            {preview ? `Send to ${plural(preview.wouldSend, 'person', 'people')}` : 'Send'}
          </Button>
        </div>
      </CardBody>
      {confirmElement}
    </Card>
  );
}
