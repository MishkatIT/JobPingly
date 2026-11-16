import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-5 py-5 lg:px-8">
        <Logo />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-5 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">{children}</div>
      </main>
      <footer className="px-5 pb-6 text-center text-sm text-subtle">
        <Link href="/privacy" className="hover:text-ink">
          Privacy
        </Link>
        <span aria-hidden="true"> · </span>
        <Link href="/terms" className="hover:text-ink">
          Terms
        </Link>
        <span aria-hidden="true"> · </span>
        <Link href="/help" className="hover:text-ink">
          Help
        </Link>
      </footer>
    </div>
  );
}
