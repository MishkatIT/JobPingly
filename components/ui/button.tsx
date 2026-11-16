import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/client/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'link';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const base =
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors duration-100 ' +
  'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 select-none';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover shadow-xs',
  accent: 'bg-accent text-accent-fg hover:bg-accent-hover shadow-xs',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-sunken shadow-xs',
  ghost: 'text-muted hover:bg-sunken hover:text-ink',
  danger: 'bg-danger-solid text-white hover:opacity-90 shadow-xs',
  link: 'text-accent hover:text-accent-hover underline-offset-4 hover:underline !px-0 !h-auto',
};

// Heights are at least 36px on touch layouts for the default size.
const sizes: Record<ButtonSize, string> = {
  xs: 'h-7 px-2 text-xs',
  sm: 'h-8 px-2.5 text-sm',
  md: 'h-9 px-3.5 text-base',
  lg: 'h-11 px-5 text-md',
};

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string): string {
  return cn(base, variants[variant], sizes[size], className);
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-4 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

interface SharedProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks interaction. */
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export type ButtonProps = SharedProps & ComponentProps<'button'>;

export function Button({ variant = 'secondary', size = 'md', loading, icon, iconRight, className, children, disabled, type, ...props }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
      {iconRight}
    </button>
  );
}

export type LinkButtonProps = SharedProps & Omit<ComponentProps<typeof Link>, 'className'> & { className?: string; external?: boolean };

/** A link that looks like a button. Use for navigation; use Button for actions. */
export function LinkButton({ variant = 'secondary', size = 'md', icon, iconRight, className, children, external, loading: _loading, ...props }: LinkButtonProps) {
  const classes = buttonClass(variant, size, className);
  if (external) {
    return (
      <a href={String(props.href)} target="_blank" rel="noopener noreferrer" className={classes}>
        {icon}
        {children}
        {iconRight}
      </a>
    );
  }
  return (
    <Link className={classes} {...props}>
      {icon}
      {children}
      {iconRight}
    </Link>
  );
}

export interface IconButtonProps extends ComponentProps<'button'> {
  /** Required: icon-only controls must have an accessible name. */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const iconSizes: Record<ButtonSize, string> = { xs: 'h-7 w-7', sm: 'h-8 w-8', md: 'h-9 w-9', lg: 'h-11 w-11' };

export function IconButton({ label, variant = 'ghost', size = 'md', loading, className, children, disabled, type, ...props }: IconButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      className={cn(base, variants[variant], iconSizes[size], '!px-0', className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}

export { Spinner };
