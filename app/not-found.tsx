import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { buttonClass } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Page not found', robots: { index: false } };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-5 py-5 lg:px-8">
        <Logo />
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-5 pb-24">
        <div className="max-w-md text-center">
          <p className="tabular text-sm font-medium text-muted">404</p>
          <h1 className="mt-2 text-2xl">This page does not exist</h1>
          <p className="mt-2 text-base text-muted">The link may be broken, or the page may have been moved, made private or deleted.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href="/dashboard" className={buttonClass('primary')}>
              Go to your dashboard
            </Link>
            <Link href="/" className={buttonClass('secondary')}>
              Home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
