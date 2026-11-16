'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Dialog } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, errorMessage } from '@/lib/client/api';

const CATEGORIES = [
  { value: 'general', label: 'General feedback' },
  { value: 'feature_request', label: 'Feature request' },
  { value: 'broken_url', label: 'A company is not being tracked correctly' },
  { value: 'ui_bug', label: 'Something on the site is broken' },
  { value: 'scraper_bug', label: 'Jobs are missing or wrong' },
];

/** Feedback and problem reports. Signed-in users are identified automatically. */
export function FeedbackDialog({ trigger, signedIn, defaultCategory = 'general', targetUrl }: { trigger: (open: () => void) => ReactNode; signedIn: boolean; defaultCategory?: string; targetUrl?: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ category: defaultCategory, subject: '', description: '', email: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    setBusy(true);
    setFieldErrors({});
    try {
      await api('/api/issues', {
        body: { category: form.category, subject: form.subject, description: form.description, email: signedIn ? undefined : form.email || undefined, targetUrl },
      });
      toast.success('Thanks — we received your message.');
      setForm({ category: defaultCategory, subject: '', description: '', email: '' });
      setOpen(false);
    } catch (error) {
      if (error instanceof ApiClientError) setFieldErrors(error.fieldErrors);
      toast.error('Could not send your message', errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {trigger(() => setOpen(true))}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        busy={busy}
        title="Send feedback"
        description="Report a problem or tell us what would make JobPingly more useful."
        footer={
          <>
            <Button onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={submit}>
              Send
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Topic">
            {ids => (
              <Select {...ids} value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}>
                {CATEGORIES.map(category => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Subject" error={fieldErrors.subject}>
            {ids => <Input {...ids} value={form.subject} maxLength={140} onChange={event => setForm({ ...form, subject: event.target.value })} />}
          </Field>
          <Field label="Details" error={fieldErrors.description} hint="What happened, and what did you expect? Include company names or links if relevant.">
            {ids => <Textarea {...ids} rows={5} value={form.description} maxLength={5000} onChange={event => setForm({ ...form, description: event.target.value })} />}
          </Field>
          {!signedIn && (
            <Field label="Your email" error={fieldErrors.email} hint="So we can reply.">
              {ids => <Input {...ids} type="email" autoComplete="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} />}
            </Field>
          )}
        </div>
      </Dialog>
    </>
  );
}
