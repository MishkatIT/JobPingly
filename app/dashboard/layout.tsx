'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Layers, Globe, Briefcase, Settings, ShieldAlert } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserProfileDropdown } from '@/components/UserProfileDropdown';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/me')
      .then(res => {
        if (!res.ok) throw new Error('Unauthenticated');
        return res.json();
      })
      .then(data => {
        setUser(data.user);
        setLoading(false);
      })
      .catch(() => {
        router.push('/login');
      });
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  };

  if (loading) {
    return <LoadingSpinner message="Loading Workspace..." fullPage />;
  }

  const mainNav = [
    { label: 'Overview', href: '/dashboard', icon: Layers },
    { label: 'My Watch Lists', href: '/dashboard/lists', icon: Briefcase },
    { label: 'Public Directory', href: '/discover', icon: Globe },
    { label: 'Account Settings', href: '/dashboard/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080c14] text-slate-900 dark:text-slate-100 flex transition-colors">
      {/* Sidebar Navigation */}
      <aside className="w-64 glass-panel border-r border-slate-200 dark:border-slate-800/80 flex flex-col justify-between p-5 shrink-0 hidden lg:flex">
        <div>
          {/* Logo & Theme Header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200 dark:border-slate-800/80">
            <Logo />
            <ThemeToggle />
          </div>

          {/* Navigation Links */}
          <div className="space-y-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 block mb-2">
                Workspace
              </span>
              <nav className="space-y-1">
                {mainNav.map(item => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        active
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {user?.role === 'admin' && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500/80 px-2 block mb-2">
                  System
                </span>
                <nav className="space-y-1">
                  <Link
                    href="/admin"
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      pathname === '/admin'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10'
                    }`}
                  >
                    <ShieldAlert className="w-4 h-4" />
                    Admin Control
                  </Link>
                </nav>
              </div>
            )}
          </div>
        </div>

        {/* User Profile Footer (Opens Upwards) */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
          <UserProfileDropdown user={user} onLogout={handleLogout} direction="up" />
        </div>
      </aside>

      {/* Main Workspace Area */}
      <main className="flex-1 overflow-y-auto px-6 sm:px-10 lg:px-16 py-8 bg-slate-50 dark:bg-[#080c14]">
        {/* Mobile Header */}
        <div className="lg:hidden glass-panel border-b border-slate-200 dark:border-slate-800 px-5 py-3.5 flex items-center justify-between sticky top-0 z-40 mb-6">
          <Logo />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user && <UserProfileDropdown user={user} onLogout={handleLogout} direction="down" />}
          </div>
        </div>

        <div className="max-w-6xl mx-auto space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
}
