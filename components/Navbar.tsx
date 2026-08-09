'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Globe } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserProfileDropdown } from '@/components/UserProfileDropdown';

interface NavbarProps {
  showBackHome?: boolean;
}

export function Navbar({ showBackHome }: NavbarProps) {
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/me')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <header className="w-full glass-panel border-b border-slate-200 dark:border-slate-800/80 sticky top-0 z-50 backdrop-blur-md bg-white/70 dark:bg-[#080c14]/70 transition-colors">
      <div className="max-w-6xl mx-auto px-6 md:px-12 py-3 flex items-center justify-between gap-4">
        {/* Left Section: Logo */}
        <div className="flex items-center gap-4">
          <Logo />
        </div>

        {/* Middle Navigation Segment */}
        <nav className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/60 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800/80 text-xs font-semibold">
          <Link
            href="/discover"
            className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              pathname === '/discover'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" /> Discover Directory
          </Link>
          {user && (
            <Link
              href="/dashboard"
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                pathname?.startsWith('/dashboard')
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
            </Link>
          )}
        </nav>

        {/* Right Section: Theme Toggle & Auth / Profile */}
        <div className="flex items-center gap-3">
          <ThemeToggle />

          {!loading && (
            user ? (
              <UserProfileDropdown user={user} onLogout={() => setUser(null)} />
            ) : (
              <Link
                href="/login"
                className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl shadow-md transition-all"
              >
                Sign In
              </Link>
            )
          )}
        </div>
      </div>
    </header>
  );
}
