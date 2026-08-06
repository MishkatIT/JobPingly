'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, Zap } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/me')
      .then(res => {
        if (!res.ok) throw new Error('Unauthenticated');
        return res.json();
      })
      .then(data => {
        if (data.user && data.user.role === 'admin') {
          setAuthorized(true);
        } else {
          // Non-admin user attempting to access /admin -> Redirect to /dashboard
          router.replace('/dashboard');
        }
      })
      .catch(() => {
        router.replace('/login');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0b0f19] flex items-center justify-center text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" />
          <span className="font-semibold text-sm">Verifying Admin Access...</span>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return null; // Will redirect via router.replace
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b0f19] text-slate-900 dark:text-slate-100 transition-colors">
      {children}
    </div>
  );
}
