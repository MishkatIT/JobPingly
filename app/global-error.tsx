'use client';

/**
 * Last-resort error page for failures in the root layout itself. It replaces
 * the whole document, so it cannot rely on the app's styles or fonts.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#fafafb', color: '#16181d' }}>
        <main style={{ maxWidth: 420, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>JobPingly is having trouble</h1>
          <p style={{ color: '#5b616e', lineHeight: 1.5 }}>Something went wrong while loading the page. Please try again in a moment.</p>
          {error.digest && <p style={{ color: '#8a8f98', fontSize: 12, fontFamily: 'monospace' }}>Reference: {error.digest}</p>}
          <button type="button" onClick={reset} style={{ marginTop: 12, height: 36, padding: '0 14px', borderRadius: 6, border: 0, background: '#16181d', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
