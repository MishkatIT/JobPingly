'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Select } from '@/components/ui/form';
import { cn } from '@/lib/client/cn';
import { formatDateTime } from '@/lib/client/format';
import { nextSearch } from './bits';

/** Reads filters from the URL and writes changes back without scrolling. Use inside <Suspense>. */
export function useUrlFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const update = useCallback(
    (changes: Record<string, string | number | null | undefined>) => router.replace(`${pathname}${nextSearch(params, changes)}`, { scroll: false }),
    [router, pathname, params],
  );
  return { params, update };
}

/** A compact labelled select for filter bars. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <label className={cn('block sm:w-48', className)}>
      <span className="sr-only">{label}</span>
      <Select value={value} onChange={event => onChange(event.target.value)} aria-label={label}>
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString('en-US');
  if (typeof value === 'string') {
    // ISO timestamps are easier to read as dates.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return formatDateTime(value);
    return value;
  }
  if (Array.isArray(value)) return value.map(item => (typeof item === 'object' ? JSON.stringify(item) : String(item))).join(', ');
  return JSON.stringify(value);
}

const KEY_LABELS: Record<string, string> = {
  from: 'From',
  to: 'To',
  email: 'Email',
  emails: 'Emails',
  reason: 'Reason',
  count: 'Count',
  name: 'Name',
  change: 'Change',
  subject: 'Subject',
  audience: 'Audience',
  sent: 'Sent',
  failed: 'Failed',
  skipped: 'Skipped',
  cycleDays: 'Rotation length (days)',
  users: 'Users',
  discarded: 'Discarded',
  emailsSent: 'Emails sent',
  items: 'Items',
  filters: 'Filters',
  self: 'Own account',
  via: 'Via',
  revoked: 'Sessions ended',
  ownerId: 'Owner id',
};

function labelFor(key: string): string {
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  const spaced = key.replace(/[_.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Audit metadata and similar JSON shown as readable key/value pairs. */
export function MetadataList({ data, className }: { data: unknown; className?: string }) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return <span className="text-sm text-muted">{data === null || data === undefined ? '—' : formatValue(data)}</span>;
  }
  const entries = Object.entries(data as Record<string, unknown>).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return <span className="text-sm text-muted">—</span>;
  return (
    <dl className={cn('grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-1 text-sm', className)}>
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-muted">{labelFor(key)}</dt>
          <dd className="min-w-0 break-words text-ink">
            {value && typeof value === 'object' && !Array.isArray(value) ? <MetadataList data={value} /> : formatValue(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Renders stored email HTML for inspection. `sandbox=""` gives the frame an
 * opaque origin with scripts, forms, popups and top navigation all disabled,
 * so a stored message can never act on the admin's session.
 */
export function SafeEmailFrame({ html, title, className }: { html: string; title: string; className?: string }) {
  return <iframe title={title} sandbox="" srcDoc={html} referrerPolicy="no-referrer" className={cn('h-[60dvh] w-full rounded-md border border-line bg-white', className)} />;
}

export interface BannerConfig {
  enabled: boolean;
  message: string;
  type: 'info' | 'success' | 'warning';
  linkUrl: string;
  linkText: string;
  bannerId: string;
}

/** Static copy of the site announcement bar (components/marketing/announcement.tsx) for previews. */
export function BannerPreview({ banner }: { banner: BannerConfig }) {
  if (!banner.message.trim()) return <p className="rounded-md border border-dashed border-line px-4 py-3 text-sm text-muted">Write a message to see the preview.</p>;
  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border text-sm',
        banner.type === 'warning' ? 'border-warning/25 bg-warning-soft' : banner.type === 'success' ? 'border-success/20 bg-success-soft' : 'border-accent/15 bg-accent-soft',
      )}
    >
      <div className="flex items-center gap-3 px-4 py-2">
        <p className="min-w-0 flex-1 text-ink">
          {banner.message}
          {banner.linkUrl && (
            <>
              {' '}
              <span className="font-medium text-accent underline-offset-2">{banner.linkText || 'Learn more'}</span>
            </>
          )}
        </p>
        <X className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
      </div>
    </div>
  );
}

/** A small "label: value" stack used in dense admin cards. */
export function KeyValue({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-base text-ink">{children}</dd>
    </div>
  );
}

/** Link to a user's admin page when the id is known, plain text otherwise. */
export function UserLink({ id, children }: { id: string | null | undefined; children: ReactNode }) {
  if (!id) return <>{children}</>;
  return (
    <Link href={`/admin/users/${id}`} className="text-ink hover:text-accent">
      {children}
    </Link>
  );
}
