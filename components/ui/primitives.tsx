import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/client/cn';

// ---------------------------------------------------------------------------
// Badge & status
// ---------------------------------------------------------------------------

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'outline';

const tones: Record<Tone, string> = {
  neutral: 'bg-sunken text-muted',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  outline: 'border border-line-strong text-muted',
};

export function Badge({ tone = 'neutral', className, children, ...props }: ComponentProps<'span'> & { tone?: Tone }) {
  return (
    <span className={cn('inline-flex h-5 items-center gap-1 whitespace-nowrap rounded px-1.5 text-xs font-medium', tones[tone], className)} {...props}>
      {children}
    </span>
  );
}

const dots: Record<Exclude<Tone, 'outline'>, string> = {
  neutral: 'bg-subtle',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

/** A coloured dot with a text label. Colour is never the only signal. */
export function StatusDot({ tone = 'neutral', pulse, children, className }: { tone?: Exclude<Tone, 'outline'>; pulse?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm text-ink', className)}>
      <span className="relative flex h-2 w-2 shrink-0">
        {pulse && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', dots[tone])} />}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', dots[tone])} />
      </span>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('rounded-lg border border-line bg-surface', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-line px-4 py-3 sm:px-5', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardBody({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('p-4 sm:p-5', className)} {...props}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page structure
// ---------------------------------------------------------------------------

export function PageHeader({ title, description, actions, eyebrow, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; className?: string }) {
  return (
    <header className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-sm text-muted">{eyebrow}</div>}
        <h1 className="truncate text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-base text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A figure with a label. `hint` adds context such as a comparison or a time range. */
export function Stat({ label, value, hint, tone, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: 'success' | 'warning' | 'danger'; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="truncate text-sm text-muted">{label}</dt>
      <dd className={cn('tabular mt-1 text-2xl font-semibold', tone === 'success' && 'text-success', tone === 'warning' && 'text-warning', tone === 'danger' && 'text-danger')}>{value}</dd>
      {hint && <div className="mt-0.5 truncate text-xs text-subtle">{hint}</div>}
    </div>
  );
}

/** A row of stats separated by hairlines; wraps to two columns on small screens. */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4', className)}>
      {children}
    </dl>
  );
}

export function StatCell({ className, ...props }: ComponentProps<typeof Stat>) {
  return <Stat className={cn('bg-surface p-4', className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Feedback states
// ---------------------------------------------------------------------------

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4', className)} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('divide-y divide-line', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="hidden h-3 w-16 sm:block" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      {icon && <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-sunken text-muted [&_svg]:h-5 [&_svg]:w-5">{icon}</div>}
      {/* h2: empty states often follow the page's h1 directly, and headings must not skip levels. */}
      <h2 className="text-md font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1.5 max-w-sm text-base text-muted">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', description, onRetry, className }: { title?: ReactNode; description?: ReactNode; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-danger-soft text-danger">
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
          <path d="M10 6.5v4m0 3h.01M3.4 15.5h13.2a1 1 0 0 0 .87-1.5L10.87 3a1 1 0 0 0-1.74 0L2.53 14a1 1 0 0 0 .87 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="text-md font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1.5 max-w-sm text-base text-muted">{description}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-4 h-9 rounded-md border border-line-strong bg-surface px-3.5 text-base font-medium text-ink shadow-xs hover:bg-sunken">
          Try again
        </button>
      )}
    </div>
  );
}

/** Inline message block for forms and panels. */
export function Callout({ tone = 'neutral', title, children, className }: { tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'; title?: ReactNode; children?: ReactNode; className?: string }) {
  const styles: Record<string, string> = {
    neutral: 'border-line bg-sunken text-muted',
    accent: 'border-accent/20 bg-accent-soft text-ink',
    success: 'border-success/20 bg-success-soft text-ink',
    warning: 'border-warning/25 bg-warning-soft text-ink',
    danger: 'border-danger/25 bg-danger-soft text-ink',
  };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-md border px-3.5 py-3 text-sm', styles[tone], className)}>
      {title && <div className="font-semibold text-ink">{title}</div>}
      {children && <div className={cn(title && 'mt-0.5', 'leading-6')}>{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** Scrolls horizontally on narrow screens instead of breaking the page layout. */
export function TableWrap({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('scroll-slim w-full overflow-x-auto', className)}>{children}</div>;
}

export function Table({ className, children, ...props }: ComponentProps<'table'>) {
  return (
    <table className={cn('w-full min-w-[640px] border-collapse text-left text-base', className)} {...props}>
      {children}
    </table>
  );
}

export function Th({ className, children, ...props }: ComponentProps<'th'>) {
  return (
    <th scope="col" className={cn('whitespace-nowrap border-b border-line bg-sunken/60 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted', className)} {...props}>
      {children}
    </th>
  );
}

export function Td({ className, children, ...props }: ComponentProps<'td'>) {
  return (
    <td className={cn('border-b border-line px-4 py-3 align-middle text-ink', className)} {...props}>
      {children}
    </td>
  );
}

export function Tr({ className, children, ...props }: ComponentProps<'tr'>) {
  return (
    <tr className={cn('transition-colors hover:bg-sunken/50 [&:last-child>td]:border-b-0', className)} {...props}>
      {children}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-surface px-1 font-mono text-2xs text-muted">{children}</kbd>;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-t border-line', className)} />;
}

/** Definition list row used on detail pages. */
export function DetailRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-base text-ink">{children}</dd>
    </div>
  );
}
