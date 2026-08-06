'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, ArrowLeft, AlertCircle, Loader2 } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { EmailVerificationModal } from '@/components/auth/EmailVerificationModal';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState('');

  useEffect(() => {
    // If already logged in, redirect straight to dashboard
    fetch('/api/me')
      .then(res => {
        if (res.ok) router.push('/dashboard');
      })
      .catch(() => {});
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      
      if (res.status === 403 && data.requiresVerification) {
        setUnverifiedEmail(data.email || email);
        setShowVerificationModal(true);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b0f19] text-slate-900 dark:text-slate-100 flex flex-col items-center justify-center p-6 relative transition-colors">
      {/* Top Header Controls: Return to Home & Theme Toggle */}
      <div className="w-full max-w-md flex items-center justify-between mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors glass-panel px-3.5 py-2 rounded-xl"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Home
        </Link>
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md glass-panel p-8 rounded-3xl border-slate-200 dark:border-slate-800 shadow-xl relative">
        <div className="text-center mb-8">
          <div className="inline-block mb-4">
            <Logo />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Welcome Back</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Sign in to manage your career watch lists</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-600 transition-colors text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-600 transition-colors text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 mt-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Sign In <ArrowRight className="w-4 h-4" /></>}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white dark:bg-[#0f172a] px-3 text-slate-400 dark:text-slate-500 font-semibold tracking-wider">
              Or continue with
            </span>
          </div>
        </div>

        <GoogleSignInButton
          onError={(err) => setError(err)}
          onSuccess={() => router.push('/dashboard')}
        />

        <div className="mt-8 text-center text-xs text-slate-500 dark:text-slate-400">
          Don't have an account?{' '}
          <Link href="/register" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
            Create an Account
          </Link>
        </div>
      </div>

      {showVerificationModal && (
        <EmailVerificationModal
          email={unverifiedEmail}
          onSuccess={() => router.push('/dashboard')}
          onCancel={() => setShowVerificationModal(false)}
        />
      )}
    </div>
  );
}
