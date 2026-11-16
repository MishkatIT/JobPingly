'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/button';
import { Checkbox, Field, Switch, TagInput } from '@/components/ui/form';
import { Card, CardBody, CardHeader, Callout } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, errorMessage } from '@/lib/client/api';
import { cn } from '@/lib/client/cn';
import { plural } from '@/lib/client/format';
import { EMPLOYMENT_LABELS, SENIORITY_LABELS, WORKPLACE_LABELS } from '@/lib/constants';
import { EMPTY_RULES, type MatchField, type MatchRules } from '@/lib/matching/rules';
import { explainMatch, type MatchReason } from '@/lib/matching/engine';
import { INHERIT_FREQUENCY } from '@/lib/utils/frequency';
import { FrequencySelect } from './frequency-select';

interface Preview {
  total: number;
  matching: number;
  summary: string;
  sample: { id: string; title: string; company: string; location: string | null; reasons: MatchReason[] }[];
}

const FIELD_OPTIONS: { value: MatchField; label: string }[] = [
  { value: 'title', label: 'Job title' },
  { value: 'department', label: 'Department or team' },
  { value: 'location', label: 'Location' },
  { value: 'description', label: 'Job description' },
];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(item => item !== value) : [...list, value];
}

export interface AlertSettings {
  alertsEnabled: boolean;
  digestFrequency: string;
  rules: MatchRules;
}

export function AlertRulesEditor({ listId, initial, keywordLimit, onSaved }: { listId: string; initial: AlertSettings; keywordLimit: number; onSaved: () => void }) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(initial.alertsEnabled);
  const [frequency, setFrequency] = useState(initial.digestFrequency || INHERIT_FREQUENCY);
  const [rules, setRules] = useState<MatchRules>({ ...EMPTY_RULES, ...initial.rules, include: initial.rules.include.length ? initial.rules.include : [[]] });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanRules = (): MatchRules => ({ ...rules, include: rules.include.filter(group => group.length > 0) });

  // Live preview, debounced, against the list's open jobs.
  useEffect(() => {
    const timer = setTimeout(async () => {
      setPreviewing(true);
      try {
        setPreview(await api<Preview>(`/api/lists/${listId}/alerts/preview`, { body: { rules: cleanRules() } }));
      } catch {
        setPreview(null);
      } finally {
        setPreviewing(false);
      }
    }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId, rules]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/lists/${listId}/alerts`, { method: 'PUT', body: { alertsEnabled: enabled, digestFrequency: frequency, rules: cleanRules() } });
      toast.success('Alert settings saved');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const setGroup = (index: number, value: string[]) => setRules(current => ({ ...current, include: current.include.map((group, i) => (i === index ? value : group)) }));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <Card>
          <CardBody className="space-y-5">
            <Switch
              checked={enabled}
              onChange={setEnabled}
              label="Email me about new matching jobs"
              description="When off, matches still appear in your job feed and notifications, but no email is sent for this watchlist."
            />
            <Field label="How often" hint="'Account default' uses the schedule from your notification settings.">
              {ids => <FrequencySelect {...ids} allowInherit value={frequency} onChange={setFrequency} disabled={!enabled} />}
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Keywords" description="A job must match at least one keyword from every group. Leave all groups empty to hear about every new job." />
          <CardBody className="space-y-4">
            {rules.include.map((group, index) => (
              <div key={index}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-medium text-ink">{index === 0 ? 'Any of these' : 'And any of these'}</span>
                  {rules.include.length > 1 && (
                    <IconButton label="Remove this group" size="xs" onClick={() => setRules(current => ({ ...current, include: current.include.filter((_, i) => i !== index) }))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  )}
                </div>
                <TagInput
                  aria-label={index === 0 ? 'Keywords: any of these' : `Keyword group ${index + 1}: and any of these`}
                  value={group}
                  onChange={value => setGroup(index, value)}
                  max={keywordLimit}
                  placeholder={index === 0 ? 'e.g. frontend, react, ui engineer' : 'e.g. senior, lead'}
                />
              </div>
            ))}
            {rules.include.length < 5 && (
              <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setRules(current => ({ ...current, include: [...current.include, []] }))}>
                Add an &ldquo;and&rdquo; group
              </Button>
            )}

            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink">Never if the title contains</span>
              <TagInput aria-label="Never if the title contains" value={rules.exclude} onChange={value => setRules({ ...rules, exclude: value })} max={keywordLimit} tone="danger" placeholder="e.g. intern, principal" />
            </div>

            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-ink">Look for keywords in</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {FIELD_OPTIONS.map(option => (
                  <Checkbox
                    key={option.value}
                    label={option.label}
                    checked={rules.fields.includes(option.value)}
                    onChange={() => {
                      const next = toggle(rules.fields, option.value);
                      if (next.length > 0) setRules({ ...rules, fields: next });
                    }}
                  />
                ))}
              </div>
            </fieldset>
            <Checkbox label="Match whole words only (recommended)" checked={rules.wholeWord} onChange={() => setRules({ ...rules, wholeWord: !rules.wholeWord })} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Filters" description="Many postings do not say whether they are remote, or what level they are. Choose whether those should still count." />
          <CardBody className="space-y-4">
            {(
              [
                ['Workplace', 'workplace', WORKPLACE_LABELS],
                ['Employment type', 'employment', EMPLOYMENT_LABELS],
                ['Level', 'seniority', SENIORITY_LABELS],
              ] as const
            ).map(([label, key, options]) => (
              <fieldset key={key}>
                <legend className="mb-1.5 text-sm font-medium text-ink">{label}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(options).map(([value, text]) => {
                    const active = (rules[key] as string[]).includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setRules({ ...rules, [key]: toggle(rules[key] as string[], value) })}
                        className={cn('h-7 rounded-full border px-2.5 text-sm', active ? 'border-ink bg-ink text-canvas' : 'border-line text-muted hover:text-ink')}
                      >
                        {text}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink">Locations</span>
              <TagInput aria-label="Locations" value={rules.locations} onChange={value => setRules({ ...rules, locations: value })} max={keywordLimit} placeholder="e.g. Dhaka, Remote, Singapore" />
            </div>
            <Checkbox
              label="Include jobs that do not state these details"
              checked={rules.includeUnknown}
              onChange={() => setRules({ ...rules, includeUnknown: !rules.includeUnknown })}
            />
          </CardBody>
        </Card>

        {error && <Callout tone="danger">{error}</Callout>}
        <div className="flex justify-end">
          <Button variant="primary" loading={saving} onClick={save}>
            Save alert settings
          </Button>
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader title="Preview" description="How your settings apply to this watchlist's open jobs right now." />
          <CardBody aria-live="polite">
            {preview ? (
              <div className={cn('transition-opacity', previewing && 'opacity-60')}>
                <p className="text-2xl font-semibold text-ink">
                  {plural(preview.matching, 'job')} <span className="text-base font-normal text-muted">of {preview.total.toLocaleString()} open</span>
                </p>
                <p className="mt-1 text-sm text-muted">{preview.summary}</p>
                {preview.sample.length > 0 && (
                  <ul className="mt-4 space-y-3 border-t border-line pt-4">
                    {preview.sample.map(job => (
                      <li key={job.id}>
                        <p className="text-sm font-medium text-ink">{job.title}</p>
                        <p className="text-xs text-muted">
                          {job.company}
                          {job.location ? ` · ${job.location}` : ''}
                        </p>
                        <p className="mt-0.5 text-xs text-subtle">{explainMatch(job.reasons)}</p>
                      </li>
                    ))}
                  </ul>
                )}
                {preview.total === 0 && <p className="mt-3 text-sm text-muted">This watchlist has no open jobs yet, so there is nothing to preview.</p>}
              </div>
            ) : (
              <p className="text-sm text-muted">{previewing ? 'Calculating…' : 'Preview unavailable.'}</p>
            )}
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}
