'use client';

import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { useSession } from '@/components/app/session';
import { Input } from '@/components/ui/form';
import { Badge, ErrorState, type Tone } from '@/components/ui/primitives';
import type { Permission } from '@/lib/auth/rbac';

/** Renders children only when the signed-in staff member has the permission. */
export function Can({ permission, children, fallback = null }: { permission: Permission; children: ReactNode; fallback?: ReactNode }) {
  const { can } = useSession();
  return <>{can(permission) ? children : fallback}</>;
}

/** Whole-page guard for admin pages; the API enforces the same rule. */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useSession();
  if (!can(permission)) return <ErrorState title="You do not have access to this page" description="Ask an owner if you need this permission." />;
  return <>{children}</>;
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (value: string) => void; placeholder: string; className?: string }) {
  return (
    <label className={className ?? 'relative w-full sm:max-w-xs'}>
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
      <Input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="pl-9" />
    </label>
  );
}

const SOURCE_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: 'Healthy', tone: 'success' },
  pending: { label: 'Pending', tone: 'neutral' },
  degraded: { label: 'Degraded', tone: 'warning' },
  broken: { label: 'Broken', tone: 'danger' },
  paused: { label: 'Paused', tone: 'outline' },
};

export function SourceStatusBadge({ status, pending }: { status: string; pending?: boolean }) {
  const entry = pending ? SOURCE_STATUS.pending : (SOURCE_STATUS[status] ?? { label: status, tone: 'neutral' as Tone });
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

const EMAIL_STATUS: Record<string, Tone> = {
  sent: 'success',
  delivered: 'success',
  opened: 'success',
  clicked: 'success',
  queued: 'neutral',
  pending: 'neutral',
  skipped: 'outline',
  failed: 'danger',
  bounced: 'danger',
  blocked: 'danger',
  spam: 'danger',
  complained: 'danger',
  deferred: 'warning',
};

export function EmailStatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge tone="neutral">Unknown</Badge>;
  return <Badge tone={EMAIL_STATUS[status] ?? 'neutral'}>{status.replace(/_/g, ' ')}</Badge>;
}

/** Shared query-string updater for filter bars that keep their state in the URL. */
export function nextSearch(current: URLSearchParams, changes: Record<string, string | number | null | undefined>, resetPage = true): string {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined || value === '') next.delete(key);
    else next.set(key, String(value));
  }
  if (resetPage && !('page' in changes)) next.delete('page');
  const query = next.toString();
  return query ? `?${query}` : '';
}
