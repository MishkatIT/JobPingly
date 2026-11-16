'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/ui/primitives';
import { cn } from '@/lib/client/cn';

const SECTIONS = [
  { href: '/dashboard/settings', label: 'Profile' },
  { href: '/dashboard/settings/notifications', label: 'Notifications' },
  { href: '/dashboard/settings/security', label: 'Sign-in & security' },
  { href: '/dashboard/settings/account', label: 'Data & account' },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
        <nav aria-label="Settings sections" className="scroll-slim -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <ul className="flex gap-1 border-b border-line lg:flex-col lg:border-b-0">
            {SECTIONS.map(section => {
              const active = pathname === section.href;
              return (
                <li key={section.href} className="shrink-0">
                  <Link
                    href={section.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'block whitespace-nowrap px-2.5 py-2 text-base transition-colors',
                      'border-b-2 lg:rounded-md lg:border-b-0',
                      active ? 'border-ink font-medium text-ink lg:bg-sunken' : 'border-transparent text-muted hover:text-ink lg:hover:bg-sunken/70',
                    )}
                  >
                    {section.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0 max-w-2xl space-y-6">{children}</div>
      </div>
    </>
  );
}
