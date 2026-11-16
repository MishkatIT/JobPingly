'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { GoogleButton } from '@/components/auth/google-button';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Callout } from '@/components/ui/primitives';
import { api, ApiClientError, errorMessage } from '@/lib/client/api';
import { storeVerification } from '../verify/storage';

export function RegisterForm({ next, signupEnabled }: { next: string | null; signupEnabled: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (!signupEnabled) {
    return (
      <div>
        <h1 className="text-2xl">Sign-ups are paused</h1>
        <p className="mt-2 text-base text-muted">JobPingly is not accepting new accounts at the moment. Please check back soon.</p>
        <p className="mt-6 text-base">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-accent hover:text-accent-hover">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const result = await api<{ ticket: string; email: string }>('/api/auth/register', { body: { ...form, timezone } });
      storeVerification({ ticket: result.ticket, email: result.email, next });
      router.push('/verify');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'validation_error') setFieldErrors(err.fieldErrors);
      else setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl">Create your account</h1>
      <p className="mt-1.5 text-base text-muted">
        Already have one?{' '}
        <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-accent hover:text-accent-hover">
          Sign in
        </Link>
      </p>

      <div className="mt-8">
        <GoogleButton next={next} label="signup_with" />
      </div>

      <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
        <Field label="Name" error={fieldErrors.name}>
          {ids => <Input {...ids} autoComplete="name" required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} autoFocus />}
        </Field>
        <Field label="Email" error={fieldErrors.email}>
          {ids => <Input {...ids} type="email" autoComplete="email" required value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} />}
        </Field>
        <Field label="Password" error={fieldErrors.password} hint="At least 8 characters. A short phrase is easier to remember and harder to guess.">
          {ids => <Input {...ids} type="password" autoComplete="new-password" required value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} />}
        </Field>
        {error && <Callout tone="danger">{error}</Callout>}
        <Button type="submit" variant="primary" className="w-full" size="lg" loading={busy}>
          Create account
        </Button>
        <p className="text-xs leading-5 text-subtle">
          By creating an account you agree to the{' '}
          <Link href="/terms" className="underline">
            terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline">
            privacy notice
          </Link>
          .
        </p>
      </form>
    </div>
  );
}
