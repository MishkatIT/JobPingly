'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Globe, Search, ArrowLeft, ExternalLink, ShieldAlert, ChevronLeft, ChevronRight, LayoutDashboard, Building, Briefcase, User } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserProfileDropdown } from '@/components/UserProfileDropdown';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Footer } from '@/components/Footer';

export default function PublicDiscoverPage() {
  const [user, setUser] = useState<any>(null);
  const [lists, setLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(9);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 9, totalPages: 1 });
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetch('/api/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.user) setUser(data.user); })
      .catch(() => setUser(null));
  }, []);

  // Debounce search (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchPublicLists = async (p: number, q: string, l: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/lists?page=${p}&limit=${l}&search=${encodeURIComponent(q)}`);
      const text = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch {
        if (!res.ok) {
          throw new Error(res.status === 403 ? 'Public lists directory is currently disabled by administrator.' : 'Failed to connect to server.');
        }
      }
      if (!res.ok) {
        throw new Error(json.error || 'Public lists directory is currently disabled by administrator.');
      }
      setLists(json.lists || []);
      setPagination(json.pagination || { total: 0, page: p, limit: l, totalPages: 1 });
    } catch (e: any) {
      setErrorMsg(e.message || 'Access disabled');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPublicLists(page, debouncedSearch, limit);
  }, [page, debouncedSearch, limit]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080c14] text-slate-900 dark:text-slate-100 flex flex-col justify-between transition-colors">
      <div className="p-6 md:p-12 max-w-6xl mx-auto w-full space-y-8 flex-1">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white glass-panel px-3.5 py-2 rounded-xl">
              <ArrowLeft className="w-4 h-4" /> Back to Home
            </Link>
            <Logo />
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            {user ? (
              <div className="flex items-center gap-3">
                <Link
                  href="/dashboard"
                  className="text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl shadow-md flex items-center gap-1.5"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
                </Link>
                <UserProfileDropdown user={user} onLogout={() => setUser(null)} />
              </div>
            ) : (
              <Link
                href="/login"
                className="text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>

        {/* Title & Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
              <Globe className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              Discover Public Watch Lists
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Browse curated company career page watch lists created by the community</p>
          </div>

          {!errorMsg && (
            <div className="flex items-center gap-3 flex-wrap">
              {/* Load limit selector */}
              <select
                value={limit}
                onChange={e => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              >
                <option value={6}>6 per page</option>
                <option value={9}>9 per page</option>
                <option value={15}>15 per page</option>
                <option value={30}>30 per page</option>
              </select>

              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search public watch lists..."
                  className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-xs focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>
          )}
        </div>

        {/* Disabled Flag Warning or Directory Grid */}
        {loading ? (
          <LoadingSpinner message="Loading public discovery directory..." fullPage={false} />
        ) : errorMsg ? (
          <div className="glass-panel p-8 sm:p-12 rounded-3xl border-slate-200 dark:border-slate-800 text-center max-w-xl mx-auto space-y-4">
            <ShieldAlert className="w-14 h-14 text-rose-500 mx-auto" />
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Access Disabled</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">{errorMsg}</p>
            <div className="pt-2">
              <Link href="/" className="inline-block text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl shadow-md">
                Return to Homepage
              </Link>
            </div>
          </div>
        ) : lists.length === 0 ? (
          <div className="glass-panel p-12 rounded-3xl text-center border-slate-200 dark:border-slate-800">
            <Globe className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">No Public Lists Found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Be the first to publish a public watch list for the community!</p>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {lists.map(l => (
                <div key={l.id} className="glass-card p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between hover:shadow-xl hover:border-blue-500/30 transition-all duration-300 group">
                  <div className="space-y-4">
                    {/* Top Header Badge */}
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Public Directory
                      </span>
                    </div>

                    {/* Title & Description */}
                    <div>
                      <h3 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {l.name}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mt-1.5 leading-relaxed">
                        {l.description || 'Public watch list of monitored company career pages.'}
                      </p>
                    </div>

                    {/* Stats Badges Bar */}
                    <div className="flex items-center gap-2 pt-1">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 px-2.5 py-1 rounded-xl">
                        <Building className="w-3.5 h-3.5 text-slate-500" />
                        {l.companyCount || 0} Companies
                      </span>

                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 dark:text-blue-300 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-xl">
                        <Briefcase className="w-3.5 h-3.5 text-blue-500" />
                        {l.jobCount || 0} Active Jobs
                      </span>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="pt-4 mt-6 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>{l.userName || 'Community User'}</span>
                    </div>

                    <Link
                      href={`/lists/${l.slug}`}
                      className="text-xs font-bold text-blue-600 dark:text-blue-400 group-hover:translate-x-0.5 flex items-center gap-1.5 transition-all"
                    >
                      View Openings <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls Bar */}
            {pagination.totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-slate-200 dark:border-slate-800/80">
                <span className="text-xs text-slate-500">
                  Page <span className="font-bold text-slate-900 dark:text-white">{pagination.page}</span> of <span className="font-bold text-slate-900 dark:text-white">{pagination.totalPages}</span> ({pagination.total} total public watch lists)
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(prev => Math.max(1, prev - 1))}
                    disabled={page <= 1}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" /> Previous
                  </button>

                  <button
                    onClick={() => setPage(prev => Math.min(pagination.totalPages, prev + 1))}
                    disabled={page >= pagination.totalPages}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
