'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, Briefcase, Settings, ShieldAlert, LogOut, ChevronDown, AlertCircle } from 'lucide-react';
import { ReportIssueModal } from '@/components/ReportIssueModal';

interface UserProfileDropdownProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    avatarUrl?: string;
  };
  onLogout?: () => void;
  onReportIssue?: () => void;
  direction?: 'up' | 'down';
}

export function UserProfileDropdown({ user, onLogout, onReportIssue, direction = 'down' }: UserProfileDropdownProps) {
  const [open, setOpen] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    setOpen(false);
    await fetch('/api/auth/logout', { method: 'POST' });
    if (onLogout) {
      onLogout();
    }
    router.push('/');
  };

  const handleOpenReportIssue = () => {
    setOpen(false);
    if (onReportIssue) {
      onReportIssue();
    } else {
      setShowIssueModal(true);
    }
  };

  const initial = user.name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U';

  const positionClasses = direction === 'up'
    ? 'bottom-full mb-2 left-0'
    : 'top-full mt-2 right-0';

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        {/* Profile Trigger Button */}
        <button
          onClick={() => setOpen(!open)}
          type="button"
          className="flex items-center gap-2 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-sm cursor-pointer"
        >
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name || 'User'}
              className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-slate-800 shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
              {initial}
            </div>
          )}
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[100px] truncate hidden sm:inline-block">
            {user.name}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>

        {/* Popover Menu */}
        {open && (
          <div className={`absolute ${positionClasses} w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-2 z-[100] animate-in fade-in slide-in-from-bottom-2 duration-150`}>
            {/* User Info Header */}
            <div className="px-3 py-2.5 mb-1 border-b border-slate-200 dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{user.name}</p>
                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${
                  user.role === 'admin'
                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                    : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                }`}>
                  {user.role}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{user.email}</p>
            </div>

            {/* Navigation Links */}
            <div className="space-y-0.5">
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
              >
                <LayoutDashboard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Dashboard Overview
              </Link>

              <Link
                href="/dashboard/lists"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
              >
                <Briefcase className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                My Watch Lists
              </Link>

              <Link
                href="/dashboard/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
              >
                <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                Settings &amp; Preferences
              </Link>

              <button
                type="button"
                onClick={handleOpenReportIssue}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer text-left"
              >
                <AlertCircle className="w-4 h-4 text-rose-500" />
                Report Issue &amp; Feedback
              </button>

              {user.role === 'admin' && (
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors"
                >
                  <ShieldAlert className="w-4 h-4" />
                  Admin Control Center
                </Link>
              )}
            </div>

            {/* Divider & Logout */}
            <div className="pt-1 mt-1 border-t border-slate-200 dark:border-slate-800/80">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>

      <ReportIssueModal isOpen={showIssueModal} onClose={() => setShowIssueModal(false)} />
    </>
  );
}
