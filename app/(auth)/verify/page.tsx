'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Callout } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, errorMessage } from '@/lib/client/api';
import { clearVerification, readVerification, type PendingVerification } from './storage';

export default function VerifyPage() {
  const toast = useToast();
  const [pending, setPending] = useState<PendingVerification | null | undefined>(undefined);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(60);

  useEffect(() => {
    setPending(readVerification());
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (pending === undefined) return <div className="h-64" aria-busy="true" />;

  if (!pending) {
    return (
      <div>
        <h1 className="text-2xl">Confirm your email</h1>
        <p className="mt-2 text-base text-muted">This page needs the sign-up you started in this browser tab. Start again and we will send a new code.</p>
        <div className="mt-6 flex gap-3">
          <Link href="/register" className="font-medium text-accent hover:text-accent-hover">
            Create an account
          </Link>
          <Link href="/login" className="text-muted hover:text-ink">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ redirectTo: string }>('/api/auth/verify', { body: { ticket: pending.ticket, code: code.replace(/\D/g, ''), next: pending.next ?? undefined } });
      clearVerification();
      window.location.assign(result.redirectTo);
    } catch (err) {
      setError(err instanceof ApiClientError && err.code === 'validation_error' ? Object.values(err.fieldErrors)[0] ?? err.message : errorMessage(err));
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      const result = await api<{ sent: boolean; retryAfterSeconds: number }>('/api/auth/resend', { body: { ticket: pending.ticket } });
      if (result.sent) {
        toast.success('A new code is on its way');
        setCooldown(60);
        setCode('');
        setError(null);
      } else {
        setCooldown(result.retryAfterSeconds);
      }
    } catch (err) {
      toast.error('Could not send a new code', errorMessage(err));
    }
  };

  return (
    <div>
      <h1 className="text-2xl">Check your email</h1>
      <p className="mt-2 text-base text-muted">
        We sent a 6-digit code to <span className="font-medium text-ink">{pending.email}</span>. It expires in 10 minutes.
      </p>
      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <Field label="Verification code" error={error}>
          {ids => (
            <Input
              {...ids}
              value={code}
              onChange={event => setCode(event.target.value.replace(/[^\d\s]/g, '').slice(0, 7))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={7}
              autoFocus
              className="h-12 text-center font-mono text-2xl tracking-[0.4em]"
            />
          )}
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={code.replace(/\D/g, '').length !== 6}>
          Confirm and continue
        </Button>
      </form>
      <div className="mt-6 space-y-2 text-sm text-muted">
        <p>
          Did not get it? Check your spam folder, or{' '}
          {cooldown > 0 ? (
            <span>request a new code in {cooldown}s.</span>
          ) : (
            <button type="button" onClick={resend} className="font-medium text-accent hover:text-accent-hover">
              send a new code
            </button>
          )}
        </p>
        <p>
          Wrong address?{' '}
          <Link href="/register" onClick={clearVerification} className="font-medium text-accent hover:text-accent-hover">
            Start again
          </Link>
        </p>
      </div>
      {process.env.NODE_ENV !== 'production' && (
        <Callout tone="neutral" className="mt-6">
          Development: emails are printed in the server console instead of being sent.
        </Callout>
      )}
    </div>
  );
}
