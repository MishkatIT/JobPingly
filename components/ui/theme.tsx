'use client';

import { useEffect } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/client/cn';
import { useStoredString, writeStoredString } from '@/lib/client/use-storage';

export type ThemePreference = 'light' | 'dark' | 'system';
const STORAGE_KEY = 'jp-theme';

/**
 * Runs before first paint (inlined in the root layout) so the page never
 * flashes the wrong theme.
 */
export const THEME_BOOTSTRAP = `(function(){try{var p=localStorage.getItem('${STORAGE_KEY}')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

function apply(preference: ThemePreference) {
  const dark = preference === 'dark' || (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

function toPreference(value: string | null | undefined): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function useTheme(): [ThemePreference, (value: ThemePreference) => void] {
  const preference = toPreference(useStoredString('local', STORAGE_KEY));

  // Follow the operating system while the preference is "system".
  useEffect(() => {
    if (preference !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  const update = (value: ThemePreference) => {
    writeStoredString('local', STORAGE_KEY, value);
    apply(value);
  };
  return [preference, update];
}

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function ThemeSwitcher({ className }: { className?: string }) {
  const [preference, setPreference] = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className={cn('inline-flex rounded-md border border-line bg-sunken p-0.5', className)}>
      {OPTIONS.map(option => {
        const Icon = option.icon;
        const active = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => setPreference(option.value)}
            className={cn('flex h-6 w-7 items-center justify-center rounded transition-colors', active ? 'bg-surface text-ink shadow-xs' : 'text-subtle hover:text-ink')}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
