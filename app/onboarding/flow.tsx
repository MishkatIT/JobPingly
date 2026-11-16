'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { FrequencySelect } from '@/components/app/frequency-select';
import { Button } from '@/components/ui/button';
import { Field, TagInput, Textarea } from '@/components/ui/form';
import { Callout } from '@/components/ui/primitives';
import { api, ApiClientError, errorMessage } from '@/lib/client/api';
import { plural } from '@/lib/client/format';
import { EMPTY_RULES } from '@/lib/matching/rules';
import { detectBrowserTimezone } from '@/lib/utils/timezones';

interface ImportResult {
  added: { name: string }[];
  skipped: { url: string; reason: string }[];
}

type Step = 'companies' | 'alerts' | 'done';

export function OnboardingFlow({ firstName, next }: { firstName: string | null; next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('companies');
  const [listId, setListId] = useState<string | null>(null);
  const [links, setLinks] = useState('');
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);
  const [frequency, setFrequency] = useState('daily');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async (destination: string) => {
    setBusy(true);
    try {
      await api('/api/me/onboarding', { method: 'POST', body: {} });
    } catch {
      // Not being marked as onboarded only means this page may be shown again.
    }
    router.push(destination);
    router.refresh();
  };

  const addCompanies = async () => {
    setBusy(true);
    setError(null);
    try {
      let id = listId;
      if (!id) {
        const created = await api<{ id: string }>('/api/lists', { body: { name: 'My companies', visibility: 'private' } });
        id = created.id;
        setListId(id);
      }
      const result = await api<ImportResult>(`/api/lists/${id}/companies/import`, { body: { text: links } });
      setImported(result);
      if (result.added.length > 0 && result.skipped.length === 0) setStep('alerts');
    } catch (err) {
      setError(err instanceof ApiClientError ? (Object.values(err.fieldErrors)[0] ?? err.message) : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const saveAlerts = async () => {
    if (!listId) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/lists/${listId}/alerts`, {
        method: 'PUT',
        body: { alertsEnabled: true, digestFrequency: 'inherit', rules: { ...EMPTY_RULES, include: keywords.length > 0 ? [keywords] : [], exclude } },
      });
      await api('/api/me/preferences', { method: 'PUT', body: { frequency, timezone: detectBrowserTimezone(), emailEnabled: true } });
      await api('/api/me/onboarding', { method: 'POST', body: {} });
      setStep('done');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'done') {
    return (
      <div className="rounded-xl border border-line bg-surface p-6 sm:p-8">
        <CircleCheck className="h-8 w-8 text-success" aria-hidden="true" />
        <h1 className="mt-4 text-2xl">You are all set</h1>
        <p className="mt-2 text-base text-muted">
          JobPingly is reading {imported ? plural(imported.added.length, 'careers page') : 'your careers pages'} now. Open jobs appear in your dashboard within a few minutes, and you will hear about new ones as they are posted.
        </p>
        <Button variant="primary" size="lg" className="mt-6 w-full sm:w-auto" onClick={() => router.push(next)}>
          Go to my dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-6 sm:p-8">
      <p className="text-sm text-muted">Step {step === 'companies' ? 1 : 2} of 2</p>

      {step === 'companies' ? (
        <>
          <h1 className="mt-1 text-2xl">{firstName ? `Welcome, ${firstName}.` : 'Welcome.'} Which companies do you want to work for?</h1>
          <p className="mt-2 text-base text-muted">Paste the careers page of each company, one per line. JobPingly checks them for you and tells you when a new job appears.</p>

          <Field label="Careers page links" className="mt-6" error={error} hint="Job-board links work best, for example jobs.lever.co/…, boards.greenhouse.io/… or jobs.ashbyhq.com/…">
            {ids => (
              <Textarea
                {...ids}
                rows={6}
                value={links}
                onChange={event => setLinks(event.target.value)}
                className="font-mono text-sm"
                placeholder={'https://company-one.com/careers\nhttps://jobs.lever.co/company-two'}
                autoFocus
              />
            )}
          </Field>

          {imported && (
            <div className="mt-4 space-y-2">
              {imported.added.length > 0 && <Callout tone="success">Added {imported.added.map(item => item.name).join(', ')}.</Callout>}
              {imported.skipped.length > 0 && (
                <Callout tone="warning" title={`${plural(imported.skipped.length, 'link')} could not be added`}>
                  <ul className="mt-1 space-y-1">
                    {imported.skipped.map(item => (
                      <li key={item.url}>
                        <span className="font-medium text-ink">{item.url}</span>: {item.reason}
                      </li>
                    ))}
                  </ul>
                </Callout>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1 text-sm sm:flex-row sm:gap-4">
              <button type="button" className="text-left text-muted hover:text-ink" disabled={busy} onClick={() => finish(next)}>
                Skip for now
              </button>
              <Link href="/discover" className="text-muted hover:text-ink" onClick={() => void api('/api/me/onboarding', { method: 'POST', body: {} }).catch(() => undefined)}>
                Browse public watchlists instead
              </Link>
            </div>
            {imported && imported.added.length > 0 ? (
              <Button variant="primary" onClick={() => setStep('alerts')}>
                Continue
              </Button>
            ) : (
              <Button variant="primary" loading={busy} disabled={!links.trim()} onClick={addCompanies}>
                Add companies
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <h1 className="mt-1 text-2xl">What kind of jobs are you looking for?</h1>
          <p className="mt-2 text-base text-muted">We only alert you about jobs that match. Leave this empty to hear about every new job at your companies.</p>

          <div className="mt-6 space-y-5">
            <Field label="Job titles or skills" optional hint="A job matches if its title, team or location contains any of these.">
              {ids => <TagInput {...ids} value={keywords} onChange={setKeywords} max={20} placeholder="e.g. frontend, react, product designer" />}
            </Field>
            <Field label="Never alert me about" optional>
              {ids => <TagInput {...ids} value={exclude} onChange={setExclude} max={20} tone="danger" placeholder="e.g. intern, principal" />}
            </Field>
            <Field label="Email me" hint={`Digests are sent in your time zone (${detectBrowserTimezone().replace(/_/g, ' ')}). You can change this any time in Settings.`}>
              {ids => <FrequencySelect {...ids} value={frequency} onChange={setFrequency} />}
            </Field>
            {error && <Callout tone="danger">{error}</Callout>}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep('companies')}>
              Back
            </Button>
            <Button variant="primary" loading={busy} onClick={saveAlerts}>
              Finish
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
