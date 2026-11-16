'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { cn } from '@/lib/client/cn';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string, action?: ToastItem['action']) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = { success: CheckCircle2, error: CircleAlert, info: Info };

/**
 * Toast notifications. Announced to screen readers through a polite live
 * region (errors assertively). Kept to three at a time; each closes itself.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems(current => current.filter(item => item.id !== id)), []);

  const push = useCallback(
    (item: Omit<ToastItem, 'id'>) => {
      const id = nextId.current++;
      setItems(current => [...current.slice(-2), { ...item, id }]);
      setTimeout(() => dismiss(id), item.tone === 'error' ? 7000 : 4500);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, description) => push({ tone: 'success', title, description }),
      error: (title, description) => push({ tone: 'error', title, description }),
      info: (title, description, action) => push({ tone: 'info', title, description, action }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[380px]">
        {items.map(item => {
          const Icon = ICONS[item.tone];
          return (
            <div
              key={item.id}
              role={item.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex w-full animate-rise-in items-start gap-3 rounded-lg border border-line bg-raised p-3.5 shadow-pop"
            >
              <Icon
                className={cn('mt-0.5 h-4 w-4 shrink-0', item.tone === 'success' && 'text-success', item.tone === 'error' && 'text-danger', item.tone === 'info' && 'text-accent')}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-base font-medium text-ink">{item.title}</p>
                {item.description && <p className="mt-0.5 text-sm text-muted">{item.description}</p>}
                {item.action && (
                  <button
                    type="button"
                    onClick={() => {
                      item.action?.onClick();
                      dismiss(item.id);
                    }}
                    className="mt-1.5 text-sm font-medium text-accent hover:text-accent-hover"
                  >
                    {item.action.label}
                  </button>
                )}
              </div>
              <button type="button" onClick={() => dismiss(item.id)} aria-label="Dismiss" className="-mr-1 -mt-1 rounded p-1 text-subtle hover:bg-sunken hover:text-ink">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
