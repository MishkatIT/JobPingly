'use client';

import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, CircleDashed, CirclePause, LoaderCircle, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/client/cn';
import { formatDateTime, formatRelative, initials } from '@/lib/client/format';
import { EMPLOYMENT_LABELS, SENIORITY_LABELS, WORKPLACE_LABELS, type EmploymentType, type Seniority, type WorkplaceType } from '@/lib/constants';
import { Badge } from '@/components/ui/primitives';

/** A company's logo, or a neutral monogram when it has none. */
export function CompanyAvatar({ name, logoUrl, size = 'md', className }: { name: string; logoUrl?: string | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const [failed, setFailed] = useState(false);
  const dimension = size === 'sm' ? 'h-6 w-6 text-2xs' : size === 'lg' ? 'h-11 w-11 text-base' : 'h-8 w-8 text-xs';
  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn('shrink-0 rounded-md border border-line bg-surface object-contain', dimension, className)}
      />
    );
  }
  return (
    <span aria-hidden="true" className={cn('flex shrink-0 items-center justify-center rounded-md border border-line bg-sunken font-semibold text-muted', dimension, className)}>
      {initials(name)}
    </span>
  );
}

export function UserAvatar({ name, src, size = 'md', className }: { name: string | null; src?: string | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const [failed, setFailed] = useState(false);
  const dimension = size === 'sm' ? 'h-6 w-6 text-2xs' : size === 'lg' ? 'h-14 w-14 text-lg' : 'h-8 w-8 text-xs';
  if (src && !failed) {
    return <img src={src} alt="" onError={() => setFailed(true)} className={cn('shrink-0 rounded-full object-cover', dimension, className)} />;
  }
  return (
    <span aria-hidden="true" className={cn('flex shrink-0 items-center justify-center rounded-full bg-ink font-semibold text-canvas', dimension, className)}>
      {initials(name)}
    </span>
  );
}

const HEALTH = {
  active: { label: 'Healthy', icon: CircleCheck, className: 'text-success' },
  pending: { label: 'Waiting for first scan', icon: CircleDashed, className: 'text-subtle' },
  degraded: { label: 'Having trouble', icon: TriangleAlert, className: 'text-warning' },
  broken: { label: 'Failing', icon: CircleAlert, className: 'text-danger' },
  paused: { label: 'Paused', icon: CirclePause, className: 'text-muted' },
  scanning: { label: 'Scanning…', icon: LoaderCircle, className: 'text-accent' },
} as const;

/** Monitoring health as an icon plus words, never colour alone. */
export function HealthStatus({ health, label, className }: { health: string; label?: string; className?: string }) {
  const entry = HEALTH[health as keyof typeof HEALTH] ?? HEALTH.pending;
  const Icon = entry.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm text-ink', className)}>
      <Icon className={cn('h-3.5 w-3.5 shrink-0', entry.className, health === 'scanning' && 'animate-spin')} aria-hidden="true" />
      {label ?? entry.label}
    </span>
  );
}

/** Relative time that updates itself, with the exact time on hover. */
export function TimeAgo({ value, className, prefix }: { value: string | Date | null | undefined; className?: string; prefix?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick(count => count + 1), 60_000);
    return () => clearInterval(timer);
  }, []);
  if (!value) return <span className={className}>—</span>;
  const date = new Date(value);
  return (
    <time dateTime={date.toISOString()} title={formatDateTime(date)} className={className} suppressHydrationWarning>
      {prefix}
      {formatRelative(date)}
    </time>
  );
}

/** Workplace, employment type and seniority as quiet tags. */
export function JobFacets({ workplaceType, employmentType, seniority, className }: { workplaceType?: string | null; employmentType?: string | null; seniority?: string | null; className?: string }) {
  // "Internship" already says it; an "Intern" seniority tag next to it would repeat it.
  const repeatsInternship = seniority === 'intern' && employmentType === 'internship';
  const tags = [
    workplaceType ? WORKPLACE_LABELS[workplaceType as WorkplaceType] : null,
    employmentType ? EMPLOYMENT_LABELS[employmentType as EmploymentType] : null,
    seniority && !repeatsInternship ? SENIORITY_LABELS[seniority as Seniority] : null,
  ].filter(Boolean) as string[];
  if (tags.length === 0) return null;
  return (
    <span className={cn('inline-flex flex-wrap gap-1', className)}>
      {tags.map(tag => (
        <Badge key={tag} tone="outline">
          {tag}
        </Badge>
      ))}
    </span>
  );
}

/** Small key/value line used in dense cards. */
export function Meta({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 text-sm text-muted [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0', className)}>{children}</span>;
}
