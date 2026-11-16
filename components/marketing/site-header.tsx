'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { LinkButton, IconButton } from '@/components/ui/button';
import { Dialog } from '@/components/ui/overlay';
import { useApi } from '@/lib/client/use-api';
import { cn } from '@/lib/client/cn';

const LINKS = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/discover', label: 'Watchlists' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/help', label: 'Help' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // 401 when signed out; that is expected and simply shows the sign-in buttons.
  const { data: me, isLoading } = useApi<{ user: { name: string | null } }>('/api/me');

  const actions = isLoading ? (
    <div className="h-8 w-40" aria-hidden="true" />
  ) : me ? (
    <LinkButton href="/dashboard" variant="primary" size="sm">
      Open dashboard
    </LinkButton>
  ) : (
    <>
      <LinkButton href="/login" variant="ghost" size="sm">
        Sign in
      </LinkButton>
      <LinkButton href="/register" variant="primary" size="sm">
        Get started
      </LinkButton>
    </>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/75">
      <div className="mx-auto flex h-14 max-w-content items-center justify-between gap-6 px-5 lg:px-8">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'rounded-md px-3 py-1.5 text-base text-muted transition-colors hover:text-ink',
                pathname === link.href && 'text-ink',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">{actions}</div>
        <IconButton label="Open menu" className="md:hidden" onClick={() => setOpen(true)}>
          <Menu className="h-5 w-5" />
        </IconButton>
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title="Menu" size="sm">
        <nav aria-label="Main" className="-mx-2 flex flex-col">
          {LINKS.map(link => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-md px-2 py-2.5 text-md text-ink hover:bg-sunken">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 [&>a]:w-full">{actions}</div>
      </Dialog>
    </header>
  );
}
