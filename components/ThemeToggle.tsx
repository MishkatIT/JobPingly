'use client';

import { useTheme } from './ThemeProvider';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      type="button"
      aria-label="Toggle Light and Dark Theme"
      className={`p-2 rounded-xl border transition-all duration-200 flex items-center justify-center bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800/80 dark:border-slate-700 dark:text-amber-400 dark:hover:bg-slate-700 dark:hover:text-amber-300 ${className}`}
    >
      <Sun className="w-4 h-4 hidden dark:block" />
      <Moon className="w-4 h-4 block dark:hidden" />
    </button>
  );
}
