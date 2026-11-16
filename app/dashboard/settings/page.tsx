'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { ImageUp, Trash2 } from 'lucide-react';
import { UserAvatar } from '@/components/app/bits';
import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Badge, Callout, Card, CardBody, CardHeader, DetailRow, ErrorState, Skeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, errorMessage } from '@/lib/client/api';
import { formatDate, formatNumber } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';
import { detectBrowserTimezone, getSelectableTimezones } from '@/lib/utils/timezones';
import type { Profile } from './types';

const SOCIALS = [
  { key: 'website', label: 'Website' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'github', label: 'GitHub' },
  { key: 'twitter', label: 'X / Twitter' },
] as const;

const MAX_AVATAR_BYTES = 256 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Scales an image down to at most 256×256 so most photos fit the size limit. */
async function shrinkImage(file: File): Promise<string> {
  const source = await readAsDataUrl(file);
  if (file.type === 'image/gif') return source;
  const image = new Image();
  image.src = source;
  await image.decode();
  const scale = Math.min(1, 256 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.85);
}

export default function ProfileSettingsPage() {
  const { data, error, isLoading, mutate } = useApi<{ profile: Profile }>('/api/me');
  if (error) return <ErrorState description="Your profile could not be loaded." onRetry={() => mutate()} />;
  if (isLoading || !data) return <Skeleton className="h-96" />;
  return <ProfileForm key={data.profile.id} profile={data.profile} onSaved={() => mutate()} />;
}

function ProfileForm({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const toast = useToast();
  const { refresh } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ name: profile.name ?? '', timezone: profile.timezone, socials: { ...profile.socials } });
  const [avatar, setAvatar] = useState<string | null>(profile.avatarUrl);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const timezones = getSelectableTimezones();

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      setErrors({ avatarUrl: 'Use a PNG, JPEG, WebP or GIF image.' });
      return;
    }
    try {
      const dataUrl = await shrinkImage(file);
      if (dataUrl.length * 0.75 > MAX_AVATAR_BYTES) {
        setErrors({ avatarUrl: 'That image is too large even after resizing. Try a smaller one.' });
        return;
      }
      setErrors({});
      setAvatar(dataUrl);
      setAvatarChanged(true);
    } catch {
      setErrors({ avatarUrl: 'That image could not be read.' });
    }
  };

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      await api('/api/me', {
        method: 'PATCH',
        body: { name: form.name, timezone: form.timezone, socials: form.socials, ...(avatarChanged ? { avatarUrl: avatar } : {}) },
      });
      setAvatarChanged(false);
      toast.success('Profile saved');
      onSaved();
      await refresh();
    } catch (err) {
      if (err instanceof ApiClientError && Object.keys(err.fieldErrors).length > 0) setErrors(err.fieldErrors);
      else toast.error('Could not save', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader title="Profile" description="Your name appears on public watchlists you create. Your email address is never shown to other people." />
        <CardBody className="space-y-5">
          <div className="flex items-center gap-4">
            <UserAvatar name={form.name || profile.email} src={avatar} size="lg" />
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" icon={<ImageUp className="h-3.5 w-3.5" />} onClick={() => fileRef.current?.click()}>
                  {avatar ? 'Change photo' : 'Upload photo'}
                </Button>
                {avatar && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => {
                      setAvatar(null);
                      setAvatarChanged(true);
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={event => void pickAvatar(event.target.files?.[0])} />
              {errors.avatarUrl ? <p className="text-sm text-danger">{errors.avatarUrl}</p> : <p className="text-sm text-muted">Square images work best. It is resized automatically.</p>}
            </div>
          </div>

          <Field label="Name" error={errors.name}>
            {ids => <Input {...ids} value={form.name} maxLength={80} autoComplete="name" onChange={event => setForm({ ...form, name: event.target.value })} />}
          </Field>

          <Field label="Email" hint="To change your email address, contact support from the Help page.">
            {ids => <Input {...ids} value={profile.email} readOnly disabled />}
          </Field>

          <Field label="Time zone" error={errors.timezone} hint="Used for digest emails and dates.">
            {ids => (
              <div className="flex gap-2">
                <Select {...ids} value={form.timezone} onChange={event => setForm({ ...form, timezone: event.target.value })}>
                  {!timezones.includes(form.timezone) && <option value={form.timezone}>{form.timezone}</option>}
                  {timezones.map(zone => (
                    <option key={zone} value={zone}>
                      {zone.replace(/_/g, ' ')}
                    </option>
                  ))}
                </Select>
                <Button onClick={() => setForm({ ...form, timezone: detectBrowserTimezone() })}>Use this device&rsquo;s</Button>
              </div>
            )}
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Links" description="Shown on your public profile, next to watchlists you share." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          {SOCIALS.map(social => (
            <Field key={social.key} label={social.label} optional>
              {ids => (
                <Input
                  {...ids}
                  inputMode="url"
                  placeholder="https://"
                  value={form.socials[social.key] ?? ''}
                  onChange={event => setForm({ ...form, socials: { ...form.socials, [social.key]: event.target.value } })}
                />
              )}
            </Field>
          ))}
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button variant="primary" loading={busy} onClick={save}>
          Save profile
        </Button>
      </div>

      <Card>
        <CardHeader title="Plan and usage" />
        <dl className="divide-y divide-line px-4 sm:px-5">
          <DetailRow label="Plan">
            <Badge tone="accent">{profile.plan.label}</Badge>
          </DetailRow>
          <DetailRow label="Watchlists">
            {formatNumber(profile.usage.lists)} of {profile.limits.lists === null ? 'unlimited' : formatNumber(profile.limits.lists)}
          </DetailRow>
          <DetailRow label="Companies per watchlist">{profile.limits.companiesPerList === null ? 'Unlimited' : formatNumber(profile.limits.companiesPerList)}</DetailRow>
          <DetailRow label="Keywords per alert">{profile.limits.keywordsPerAlert === null ? 'Unlimited' : formatNumber(profile.limits.keywordsPerAlert)}</DetailRow>
          <DetailRow label="Member since">{formatDate(profile.createdAt)}</DetailRow>
        </dl>
        {profile.plan.id === 'free' && (
          <CardBody className="border-t border-line">
            <Callout tone="neutral">
              Need higher limits? They are available on request:{' '}
              <Link href="/help#contact" className="font-medium text-accent hover:text-accent-hover">
                contact us
              </Link>
              .
            </Callout>
          </CardBody>
        )}
      </Card>
    </>
  );
}
