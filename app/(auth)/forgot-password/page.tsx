'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Callout } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/client/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/forgot-password', { body: { email } });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div>
        <MailCheck className="h-8 w-8 text-success" aria-hidden="true" />
        <h1 className="mt-4 text-2xl">Check your email</h1>
        <p className="mt-2 text-base text-muted">
          If <span className="font-medium text-ink">{email}</span> has a JobPingly account, we have sent a link to choose a new password. It works once and expires in an hour.
        </p>
        <Link href="/login" className="mt-6 inline-block font-medium text-accent hover:text-accent-hover">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl">Reset your password</h1>
      <p className="mt-2 text-base text-muted">Enter your account email and we will send you a link to choose a new password.</p>
      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <Field label="Email">
          {ids => <Input {...ids} type="email" autoComplete="email" required autoFocus value={email} onChange={event => setEmail(event.target.value)} />}
        </Field>
        {error && <Callout tone="danger">{error}</Callout>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          Send reset link
        </Button>
      </form>
      <Link href="/login" className="mt-6 inline-block text-sm text-muted hover:text-ink">
        Back to sign in
      </Link>
    </div>
  );
}
