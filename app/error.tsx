'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { buttonClass } from '@/components/ui/button';

/** Shown when a page outside the dashboard fails to render. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-5">
      <div className="max-w-md text-center">
        <h1 className="text-2xl">Something went wrong</h1>
        <p className="mt-2 text-base text-muted">
          The page could not be loaded. Please try again in a moment.
          {error.digest && <span className="mt-2 block font-mono text-xs text-subtle">Reference: {error.digest}</span>}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" onClick={reset} className={buttonClass('primary')}>
            Try again
          </button>
          <Link href="/" className={buttonClass('secondary')}>
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
