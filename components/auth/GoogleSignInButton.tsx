'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';

interface GoogleSignInButtonProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
  text?: string;
}

declare global {
  interface Window {
    google?: any;
  }
}

export function GoogleSignInButton({ onSuccess, onError, text = 'Continue with Google' }: GoogleSignInButtonProps) {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const googleContainerRef = useRef<HTMLDivElement>(null);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

  const handleCredentialResponse = useCallback(async (response: any) => {
    if (!response.credential) {
      if (onError) onError('Google sign in did not return a credential.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Google authentication failed');
      }

      await refreshUser();

      if (onSuccess) {
        onSuccess();
      } else {
        window.location.href = '/dashboard';
      }
    } catch (err: any) {
      if (onError) onError(err.message || 'Google authentication failed');
    } finally {
      setLoading(false);
    }
  }, [onError, onSuccess, refreshUser]);

  useEffect(() => {
    if (!clientId) return;

    const initGsi = () => {
      if (window.google?.accounts?.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleCredentialResponse,
            auto_select: false,
          });

          if (googleContainerRef.current) {
            googleContainerRef.current.innerHTML = '';
            window.google.accounts.id.renderButton(googleContainerRef.current, {
              theme: 'outline',
              size: 'large',
              width: googleContainerRef.current.clientWidth || 360,
              text: 'continue_with',
              shape: 'rectangular',
              logo_alignment: 'center',
            });
          }
          setSdkReady(true);
        } catch (err) {
          console.error('[Google Auth Initialization Error]', err);
        }
      }
    };

    if (window.google?.accounts?.id) {
      initGsi();
    } else {
      const existingScript = document.getElementById('google-jssdk') as HTMLScriptElement | null;
      if (!existingScript) {
        const script = document.createElement('script');
        script.id = 'google-jssdk';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = initGsi;
        document.head.appendChild(script);
      } else {
        existingScript.addEventListener('load', initGsi);
      }
    }
  }, [clientId, handleCredentialResponse]);

  const handleGoogleClick = () => {
    if (!clientId) {
      if (onError) onError('Google Client ID is not configured.');
      return;
    }

    if (window.google?.accounts?.id) {
      // Pre-initialize and trigger prompt immediately
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
        auto_select: false,
      });

      // Try triggering rendered button click if available, else prompt
      const renderedBtn = googleContainerRef.current?.querySelector('[role="button"]') as HTMLElement | null;
      if (renderedBtn) {
        renderedBtn.click();
      } else {
        window.google.accounts.id.prompt();
      }
    } else {
      if (onError) onError('Google Sign-In SDK is loading. Please try again in a moment.');
    }
  };

  return (
    <div className="w-full relative">
      {loading && (
        <div className="w-full py-3 px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-semibold shadow-sm flex items-center justify-center gap-3 text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span>Authenticating...</span>
        </div>
      )}

      <div
        ref={googleContainerRef}
        className={`w-full flex justify-center ${loading ? 'hidden' : sdkReady ? 'block' : 'hidden'}`}
      />

      {!loading && !sdkReady && (
        <button
          type="button"
          onClick={handleGoogleClick}
          className="w-full py-3 px-4 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 font-semibold shadow-sm hover:shadow transition-all flex items-center justify-center gap-3 text-sm"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.25 21.31 7.31 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.69 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
            />
          </svg>
          <span>{text}</span>
        </button>
      )}
    </div>
  );
}
