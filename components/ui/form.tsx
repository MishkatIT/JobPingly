'use client';

import { useId, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/client/cn';

const control =
  'w-full rounded-md border border-line-strong bg-surface text-ink placeholder:text-subtle shadow-xs transition-colors ' +
  'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 ' +
  'disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/20';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  // 16px text on small screens stops iOS zooming the page when a field is focused.
  return <input className={cn(control, 'h-9 px-3 text-md sm:text-base', className)} {...props} />;
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<'textarea'>) {
  return <textarea rows={rows} className={cn(control, 'min-h-[5rem] px-3 py-2 text-md leading-6 sm:text-base', className)} {...props} />;
}

/** `className` styles the <select>; use `wrapperClassName` for layout (flex-1, widths in flex rows). */
export function Select({ className, wrapperClassName, children, ...props }: ComponentProps<'select'> & { wrapperClassName?: string }) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <select className={cn(control, 'h-9 appearance-none pl-3 pr-8 text-md sm:text-base', className)} {...props}>
        {children}
      </select>
      <svg className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function Label({ className, children, ...props }: ComponentProps<'label'>) {
  return (
    <label className={cn('block text-sm font-medium text-ink', className)} {...props}>
      {children}
    </label>
  );
}

export interface FieldProps {
  label: ReactNode;
  /** Short helper text under the control. */
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  className?: string;
  /** Receives the ids to wire onto the control for accessibility. */
  children: (ids: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
}

/** Label, control, hint and error message, correctly associated for screen readers. */
export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {optional && <span className="text-xs text-subtle">Optional</span>}
      </div>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** A labelled on/off control. The whole row is the click target. */
export function Switch({ checked, onChange, label, description, disabled, className }: SwitchProps) {
  const id = useId();
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <label htmlFor={id} className={cn('block text-base font-medium text-ink', !disabled && 'cursor-pointer')}>
          {label}
        </label>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-transparent transition-colors',
          checked ? 'bg-accent' : 'bg-line-strong',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span className={cn('inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform', checked ? 'translate-x-[19px]' : 'translate-x-[2px]')} />
      </button>
    </div>
  );
}

export function Checkbox({ className, label, ...props }: ComponentProps<'input'> & { label: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        className={cn('mt-0.5 h-4 w-4 shrink-0 rounded-sm border-line-strong text-accent accent-[rgb(var(--accent))]', className)}
        {...props}
      />
      <label htmlFor={id} className="text-base text-ink">
        {label}
      </label>
    </div>
  );
}

export interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  max?: number;
  id?: string;
  'aria-describedby'?: string;
  /** Accessible name when the input is not labelled by a <Field>. */
  'aria-label'?: string;
  /** Visual tone of the chips. */
  tone?: 'neutral' | 'danger';
  disabled?: boolean;
}

/** Free-text list editor: type and press Enter or comma to add, Backspace to remove. */
export function TagInput({ value, onChange, placeholder, max = 20, tone = 'neutral', disabled, ...ids }: TagInputProps) {
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    const parts = raw
      .split(/[,\n]/)
      .map(part => part.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...value];
    for (const part of parts) {
      if (next.length >= max) break;
      if (!next.some(existing => existing.toLowerCase() === part.toLowerCase())) next.push(part.slice(0, 60));
    }
    onChange(next);
    setDraft('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add(draft);
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div
      className={cn(
        'flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2 py-1.5 shadow-xs',
        'focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20',
        disabled && 'bg-sunken opacity-70',
      )}
    >
      {value.map(tag => (
        <span
          key={tag}
          className={cn(
            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-sm font-medium',
            tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-sunken text-ink',
          )}
        >
          {tag}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(value.filter(item => item !== tag))}
            aria-label={`Remove ${tag}`}
            className="rounded-sm opacity-60 hover:opacity-100"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        {...ids}
        value={draft}
        disabled={disabled || value.length >= max}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => add(draft)}
        onPaste={event => {
          const text = event.clipboardData.getData('text');
          if (/[,\n]/.test(text)) {
            event.preventDefault();
            add(text);
          }
        }}
        placeholder={value.length === 0 ? placeholder : value.length >= max ? `Limit of ${max} reached` : ''}
        className="min-w-[8rem] flex-1 bg-transparent px-1 text-md text-ink placeholder:text-subtle focus:outline-none sm:text-base"
      />
    </div>
  );
}
