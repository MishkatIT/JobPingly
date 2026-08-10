'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { maskEmail } from '@/lib/auth/otp';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';

interface EmailVerificationModalProps {
  email: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function EmailVerificationModal({ email, onSuccess, onCancel }: EmailVerificationModalProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState<boolean>(false);
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [resending, setResending] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(60);
  
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Countdown timer effect
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Focus first input on mount
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0]?.focus();
    }
  }, []);

  const handleChange = (index: number, value: string) => {
    // Only accept numeric input
    if (value && !/^\d+$/.test(value)) return;

    const newOtp = [...otp];
    // If user typed multiple digits (e.g. pasted into single box), take the last character
    const char = value.slice(-1);
    newOtp[index] = char;
    setOtp(newOtp);
    setError('');

    // Auto-advance to next input if filled
    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otp[index] && index > 0) {
        // Go back to previous input on backspace if current is empty
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();
    if (/^\d{6}$/.test(pastedData)) {
      const digits = pastedData.split('');
      setOtp(digits);
      setError('');
      inputRefs.current[5]?.focus();
    }
  };

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const fullOtp = otp.join('');
    if (fullOtp.length !== 6) {
      setError('Please enter all 6 digits of the verification code.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: fullOtp }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      setSuccessMsg('Email verified successfully! Redirecting...');
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        } else {
          router.push('/dashboard');
        }
      }, 1000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || resending) return;
    setError('');
    setSuccessMsg('');
    setResending(true);

    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to resend code');
      }

      setSuccessMsg('A new verification code has been sent.');
      setCountdown(60);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onCancel) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  if (!mounted) return null;

  return createPortal(
    <div
      onClick={() => onCancel && onCancel()}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md glass-panel p-8 rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl relative bg-white/90 dark:bg-slate-900/90 text-slate-900 dark:text-white cursor-default"
      >
        
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-block mb-3">
            <Logo />
          </div>
          <h2 className="text-xl font-bold">Verify your email</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
            We&apos;ve sent a 6-digit verification code to:<br />
            <span className="font-semibold text-slate-900 dark:text-slate-200">{maskEmail(email)}</span>
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Notification */}
        {successMsg && (
          <div className="mb-5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* OTP Input Form */}
        <form onSubmit={handleVerify} className="space-y-6">
          <div className="flex items-center justify-between gap-2 my-4">
            {otp.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => { inputRefs.current[idx] = el; }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                onPaste={handlePaste}
                className="w-11 h-13 text-center text-xl font-bold rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/30 transition-all shadow-inner"
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={loading || otp.join('').length !== 6}
            className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify Email'}
          </button>
        </form>

        {/* Resend Section */}
        <div className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
          <p className="mb-2">Didn&apos;t receive the code?</p>
          {countdown > 0 ? (
            <span className="font-medium text-slate-400 dark:text-slate-500">
              Resend code in <strong className="text-blue-600 dark:text-blue-400">{countdown}s</strong>
            </span>
          ) : (
            <button
              onClick={handleResend}
              disabled={resending}
              className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold hover:underline disabled:opacity-50"
            >
              {resending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Resend code
            </button>
          )}
        </div>

        {onCancel && (
          <button
            onClick={onCancel}
            className="mt-6 w-full text-center text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            Cancel and return
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
