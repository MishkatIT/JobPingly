'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Callout } from '@/components/ui/primitives';
import { api, ApiClientError, errorMessage } from '@/lib/client/api';

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!/^[a-f0-9]{64}$/.test(token)) {
    return (
      <div>
        <h1 className="text-2xl">This link is not valid</h1>
        <p className="mt-2 text-base text-muted">Password reset links work once and expire after an hour.</p>
        <Link href="/forgot-password" className="mt-6 inline-block font-medium text-accent hover:text-accent-hover">
          Request a new link
        </Link>
      </div>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ redirectTo: string }>('/api/auth/reset-password', { body: { token, password } });
      window.location.assign(result.redirectTo);
    } catch (err) {
      setError(err instanceof ApiClientError && err.code === 'validation_error' ? Object.values(err.fieldErrors)[0] ?? err.message : errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl">Choose a new password</h1>
      <p className="mt-2 text-base text-muted">You will be signed in, and signed out on every other device.</p>
      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <Field label="New password" hint="At least 8 characters.">
          {ids => <Input {...ids} type="password" autoComplete="new-password" required autoFocus value={password} onChange={event => setPassword(event.target.value)} />}
        </Field>
        <Field label="Confirm new password">
          {ids => <Input {...ids} type="password" autoComplete="new-password" required value={confirm} onChange={event => setConfirm(event.target.value)} />}
        </Field>
        {error && <Callout tone="danger">{error}</Callout>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          Save password and sign in
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="h-64" />}>
      <ResetForm />
    </Suspense>
  );
}
