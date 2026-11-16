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

export function LoginForm({ next, reason }: { next: string | null; reason: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ status: string; redirectTo?: string; ticket?: string; email?: string }>('/api/auth/login', { body: { email, password, next: next ?? undefined } });
      if (result.status === 'verification_required' && result.ticket) {
        storeVerification({ ticket: result.ticket, email: result.email ?? email, next });
        router.push('/verify');
        return;
      }
      // A full navigation so the signed-in layout loads with the new session.
      window.location.assign(result.redirectTo ?? '/dashboard');
    } catch (err) {
      setError(err instanceof ApiClientError && err.code === 'validation_error' ? Object.values(err.fieldErrors)[0] ?? err.message : errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl">Sign in to JobPingly</h1>
      <p className="mt-1.5 text-base text-muted">
        New here?{' '}
        <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-accent hover:text-accent-hover">
          Create an account
        </Link>
      </p>

      {reason === 'deleted' && (
        <Callout tone="success" className="mt-6">
          Your account and its data were deleted.
        </Callout>
      )}
      {reason === 'expired' && (
        <Callout tone="accent" className="mt-6">
          Your session ended. Please sign in again.
        </Callout>
      )}

      <div className="mt-8">
        <GoogleButton next={next} label="signin_with" />
      </div>

      <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
        <Field label="Email">
          {ids => <Input {...ids} type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} autoFocus />}
        </Field>
        <Field label="Password">
          {ids => (
            <div>
              <Input {...ids} type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
              <div className="mt-1.5 text-right">
                <Link href="/forgot-password" className="text-sm text-accent hover:text-accent-hover">
                  Forgot password?
                </Link>
              </div>
            </div>
          )}
        </Field>
        {error && <Callout tone="danger">{error}</Callout>}
        <Button type="submit" variant="primary" className="w-full" size="lg" loading={busy}>
          Sign in
        </Button>
        <p className="text-sm text-muted">If you signed up with Google, use the Google button above.</p>
      </form>
    </div>
  );
}
