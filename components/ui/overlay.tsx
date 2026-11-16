'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/client/cn';
import { Button, type ButtonVariant } from './button';

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Prevent closing by Escape or backdrop click (while a request is in flight). */
  busy?: boolean;
}

const dialogSizes = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };

/**
 * Modal dialog built on the native <dialog> element, which provides the
 * accessibility behaviour that hand-rolled modals usually miss: focus is
 * trapped inside, the page behind is inert, Escape closes it, and focus
 * returns to the control that opened it.
 *
 * On small screens it docks to the bottom edge as a sheet.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md', busy }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={event => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      onClick={event => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === ref.current && !busy) onClose();
      }}
      className={cn(
        'm-0 w-full max-w-full bg-transparent p-0 open:flex',
        'fixed inset-x-0 bottom-0 top-auto max-h-[92dvh] flex-col',
        'sm:inset-0 sm:m-auto sm:max-h-[85dvh] sm:w-[calc(100%-2rem)]',
        dialogSizes[size],
      )}
    >
      {open && (
        <div className="flex max-h-[inherit] w-full animate-rise-in flex-col overflow-hidden rounded-t-xl border border-line bg-raised shadow-pop sm:rounded-xl">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-md font-semibold text-ink">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-1 text-sm text-muted">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => !busy && onClose()}
              aria-label="Close"
              className="-mr-1.5 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-sunken hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {children && <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>}
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-sunken/40 px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  /** When set, the user must type this text to enable the confirm button. */
  typeToConfirm?: string;
}

/**
 * Promise-based confirmation, replacing window.confirm():
 *
 *   const { confirm, element } = useConfirm();
 *   if (await confirm({ title: 'Delete watchlist?', tone: 'danger' })) { ... }
 *   return <>{element}</>;
 */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState('');

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>(resolve => {
        setTyped('');
        setState({ ...options, resolve });
      }),
    [],
  );

  const finish = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  const blocked = Boolean(state?.typeToConfirm) && typed.trim() !== state?.typeToConfirm;
  const variant: ButtonVariant = state?.tone === 'danger' ? 'danger' : 'primary';

  const element = (
    <Dialog
      open={state !== null}
      onClose={() => finish(false)}
      title={state?.title ?? ''}
      description={state?.description}
      size="sm"
      footer={
        <>
          <Button onClick={() => finish(false)}>{state?.cancelLabel ?? 'Cancel'}</Button>
          <Button variant={variant} disabled={blocked} onClick={() => finish(true)}>
            {state?.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      {state?.typeToConfirm ? (
        <label className="block text-sm text-muted">
          Type <span className="font-mono font-semibold text-ink">{state.typeToConfirm}</span> to confirm
          <input
            autoFocus
            value={typed}
            onChange={event => setTyped(event.target.value)}
            className="mt-2 h-9 w-full rounded-md border border-line-strong bg-surface px-3 text-md text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 sm:text-base"
          />
        </label>
      ) : undefined}
    </Dialog>
  );

  return { confirm, element };
}

// ---------------------------------------------------------------------------
// Dropdown menu
// ---------------------------------------------------------------------------

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  href?: string;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  /** Draws a separator above this item. */
  separator?: boolean;
}

export interface DropdownProps {
  /** The trigger's content; rendered inside a button. */
  trigger: ReactNode;
  label: string;
  items: MenuItem[];
  align?: 'start' | 'end';
  triggerClassName?: string;
  header?: ReactNode;
}

/** Menu button with arrow-key navigation, Escape to close and focus return. */
export function Dropdown({ trigger, label, items, align = 'end', triggerClassName, header }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  useEffect(() => {
    if (open) rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
  }, [open]);

  const move = (direction: 1 | -1) => {
    const nodes = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
    if (nodes.length === 0) return;
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    nodes[(index + direction + nodes.length) % nodes.length].focus();
  };

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => setOpen(value => !value)}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={event => {
            if (event.key === 'Escape') close();
            else if (event.key === 'ArrowDown') {
              event.preventDefault();
              move(1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              move(-1);
            } else if (event.key === 'Tab') close(false);
          }}
          className={cn(
            'absolute top-full z-50 mt-1.5 min-w-[13rem] animate-scale-in rounded-lg border border-line bg-raised p-1 shadow-pop',
            align === 'end' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
          )}
        >
          {header && <div className="border-b border-line px-2.5 pb-2 pt-1.5">{header}</div>}
          {items.map((item, index) => {
            const classes = cn(
              'flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-base outline-none',
              item.tone === 'danger' ? 'text-danger hover:bg-danger-soft focus:bg-danger-soft' : 'text-ink hover:bg-sunken focus:bg-sunken',
              item.disabled && 'pointer-events-none opacity-50',
              '[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:text-muted',
              item.tone === 'danger' && '[&_svg]:text-danger',
            );
            return (
              <div key={`${item.label}-${index}`}>
                {item.separator && <div className="my-1 border-t border-line" role="separator" />}
                {item.href ? (
                  <a role="menuitem" tabIndex={-1} href={item.href} aria-disabled={item.disabled} className={classes} onClick={() => setOpen(false)}>
                    {item.icon}
                    {item.label}
                  </a>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    aria-disabled={item.disabled}
                    className={classes}
                    onClick={() => {
                      close();
                      item.onSelect?.();
                    }}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs / segmented control
// ---------------------------------------------------------------------------

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number | null;
}

/** Underlined tab bar. Scrolls horizontally on narrow screens. */
export function Tabs<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (value: T) => void; options: SegmentOption<T>[]; label: string; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cn('scroll-slim -mb-px flex gap-5 overflow-x-auto border-b border-line', className)}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 border-b-2 px-0.5 pb-2.5 pt-1 text-base font-medium transition-colors',
              active ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {option.label}
            {option.count !== undefined && option.count !== null && (
              <span className={cn('tabular rounded px-1.5 text-xs', active ? 'bg-ink text-canvas' : 'bg-sunken text-muted')}>{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Compact mutually exclusive choice, e.g. a view switcher. */
export function Segmented<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (value: T) => void; options: SegmentOption<T>[]; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-md border border-line-strong bg-sunken p-0.5', className)}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn('h-7 rounded px-2.5 text-sm font-medium transition-colors', active ? 'bg-surface text-ink shadow-xs' : 'text-muted hover:text-ink')}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export function Pagination({ page, totalPages, total, pageSize, onChange, className }: { page: number; totalPages: number; total: number; pageSize: number; onChange: (page: number) => void; className?: string }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pagination" className={cn('flex items-center justify-between gap-3 px-4 py-3 text-sm text-muted', className)}>
      <span className="tabular">
        {from.toLocaleString()}&ndash;{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <span className="tabular hidden sm:inline">
          Page {page} of {totalPages}
        </span>
        <Button size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
}
