'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/ui/primitives';

/** Keeps the sidebar on screen when a single dashboard page fails. */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="This page could not be loaded"
      description={
        <>
          Please try again. If it keeps happening, let us know from &ldquo;Feedback &amp; help&rdquo; in the sidebar.
          {error.digest && <span className="mt-2 block font-mono text-xs text-subtle">Reference: {error.digest}</span>}
        </>
      }
      onRetry={reset}
    />
  );
}
