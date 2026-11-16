'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/client/api';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: { credential: string }) => void; ux_mode?: string; itp_support?: boolean }) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Google sign-in could not be loaded.'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** "Continue with Google". Renders nothing when Google sign-in is not configured. */
export function GoogleButton({ next, label = 'continue_with' }: { next?: string | null; label?: 'continue_with' | 'signup_with' | 'signin_with' }) {
  const container = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          itp_support: true,
          callback: async ({ credential }) => {
            setBusy(true);
            try {
              const result = await api<{ redirectTo: string }>('/api/auth/google', { body: { credential, next: next ?? undefined } });
              window.location.assign(result.redirectTo);
            } catch (error) {
              toast.error('Google sign-in failed', errorMessage(error));
              setBusy(false);
            }
          },
        });
        const isDark = document.documentElement.classList.contains('dark');
        window.google.accounts.id.renderButton(container.current, {
          theme: isDark ? 'filled_black' : 'outline',
          size: 'large',
          text: label,
          shape: 'rectangular',
          width: Math.min(384, container.current.offsetWidth || 320),
          logo_alignment: 'center',
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [label, next, toast]);

  if (!CLIENT_ID || failed) return null;
  return (
    <div className="space-y-4">
      <div ref={container} className={busy ? 'pointer-events-none opacity-60' : ''} style={{ minHeight: 44 }} aria-busy={busy} />
      <div className="flex items-center gap-3 text-xs text-subtle">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
