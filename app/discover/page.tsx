'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Globe, Search, ShieldAlert, ChevronLeft, ChevronRight, Building, Briefcase, ExternalLink, Users, GitFork, Crown, LayoutGrid, Grid2X2, List, Share2, Check, Sliders, Layers, CheckCircle2, PlusCircle, X, Sparkles, Bell, Bot, Cpu, Zap } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Footer } from '@/components/Footer';
import { PublicUserProfileModal } from '@/components/PublicUserProfileModal';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/components/auth/AuthContext';

import { Badge } from '@/components/Badge';
import { pluralize } from '@/lib/utils/pluralize';
import DashboardLayout from '@/app/dashboard/layout';

export default function PublicDiscoverPage() {
  const toast = useToast();
  const { user } = useAuth();
  const [lists, setLists] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(9);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 9, totalPages: 1 });
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'tiles' | 'list'>('grid');
  const [showPublicGuide, setShowPublicGuide] = useState(true);

  // Suggestion Modal State
  const [suggestingList, setSuggestingList] = useState<any>(null);
  const [suggestUrl, setSuggestUrl] = useState('');
  const [suggestCompany, setSuggestCompany] = useState('');
  const [suggestSubmitting, setSuggestSubmitting] = useState(false);
  const [suggestSuccess, setSuggestSuccess] = useState('');

  useEffect(() => {
    const savedView = localStorage.getItem('jobpingly_discover_view');
    if (savedView === 'grid' || savedView === 'tiles' || savedView === 'list') {
      setViewMode(savedView);
    }
    const savedGuide = localStorage.getItem('jobpingly_show_public_guide');
    if (savedGuide !== null) {
      setShowPublicGuide(savedGuide === 'true');
    }
  }, []);

  const handleTogglePublicGuide = () => {
    setShowPublicGuide(prev => {
      const next = !prev;
      localStorage.setItem('jobpingly_show_public_guide', String(next));
      return next;
    });
  };

  const handleSuggestCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suggestingList) return;
    setSuggestSubmitting(true);
    setSuggestSuccess('');
    try {
      const res = await fetch(`/api/public/lists/${suggestingList.slug}/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: suggestUrl, companyName: suggestCompany }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to submit suggestion');

      setSuggestSuccess(json.message || 'Suggestion submitted successfully!');
      setSuggestUrl('');
      setSuggestCompany('');
      setTimeout(() => {
        setSuggestingList(null);
        setSuggestSuccess('');
      }, 2000);
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit suggestion');
    } finally {
      setSuggestSubmitting(false);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('jobpingly_discover_view');
    if (saved === 'grid' || saved === 'tiles' || saved === 'list') {
      setViewMode(saved);
    }
  }, []);

  const handleViewChange = (mode: 'grid' | 'tiles' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('jobpingly_discover_view', mode);
  };

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
      if (json.stats) setStats(json.stats);
      setPagination(json.pagination || { total: 0, page: p, limit: l, totalPages: 1 });
    } catch (e: any) {
      setErrorMsg(e.message || 'Access disabled');
    } finally {
      setLoading(false);
    }
  };

  const handleForkList = async (e: React.MouseEvent, slug: string, listName: string) => {
    e.stopPropagation();
    if (!user) {
      toast.error('Please log in to fork watch lists.');
      return;
    }
    try {
      toast.info(`Forking '${listName}'...`);
      const res = await fetch(`/api/public/lists/${slug}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: 'private' }),
      });
      const json = await res.json();
      if (res.ok && json.list) {
        toast.success(`Successfully forked '${listName}'!`);
        window.location.href = `/dashboard/lists/${json.list.id}`;
      } else {
        toast.error(json.error || 'Failed to fork watch list');
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  useEffect(() => {
    fetchPublicLists(page, debouncedSearch, limit);
  }, [page, debouncedSearch, limit]);

  const discoverBodyContent = (
    <>
      {/* Title & Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <Globe className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            Public Watch Lists
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Browse &amp; follow curated company watch lists with automated job alert emails
          </p>
        </div>

        {!errorMsg && (
          <div className="flex items-center justify-start lg:justify-end gap-3 flex-wrap lg:ml-auto">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search watch lists..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-xs focus:outline-none focus:border-blue-600"
              />
            </div>

            {/* Google Drive Style View Switcher */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => handleViewChange('grid')}
                className={`px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Grid View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Grid</span>
              </button>
              <button
                type="button"
                onClick={() => handleViewChange('tiles')}
                className={`px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 transition-all cursor-pointer ${
                  viewMode === 'tiles'
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Compact Tiles View"
              >
                <Grid2X2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tiles</span>
              </button>
              <button
                type="button"
                onClick={() => handleViewChange('list')}
                className={`px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="List Table View"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">List</span>
              </button>
            </div>

            <select
              value={limit}
              onChange={e => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
            >
              <option value={6}>6 per page</option>
              <option value={9}>9 per page</option>
              <option value={15}>15 per page</option>
              <option value={30}>30 per page</option>
            </select>
          </div>
        )}
      </div>

      {/* Step-by-Step Public Guide Banner */}
      <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-purple-500/20 bg-gradient-to-r from-purple-500/5 via-blue-500/5 to-transparent space-y-4 relative overflow-hidden">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-600 text-white shrink-0 shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                How Public Watch Lists Work — Step-by-Step Guide
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Browse community-curated lists or follow them to get automated email job notifications.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleTogglePublicGuide}
            className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            {showPublicGuide ? 'Hide Steps ▲' : 'Show Steps ▼'}
          </button>
        </div>

        {showPublicGuide && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {/* Step 1 */}
            <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 space-y-2 relative group hover:border-purple-500/40 transition-all">
              <div className="flex items-center justify-between">
                <span className="w-7 h-7 rounded-xl bg-purple-600 text-white font-extrabold text-xs flex items-center justify-center shadow-xs">
                  1
                </span>
                <Globe className="w-4 h-4 text-purple-500" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Browse Public Lists</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Explore public company watch lists created by community members and industry curators.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 space-y-2 relative group hover:border-blue-500/40 transition-all">
              <div className="flex items-center justify-between">
                <span className="w-7 h-7 rounded-xl bg-blue-600 text-white font-extrabold text-xs flex items-center justify-center shadow-xs">
                  2
                </span>
                <Bell className="w-4 h-4 text-blue-500" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Click &quot;Follow &amp; Get Alerts&quot;</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Click the <strong>&quot;Follow &amp; Get Alerts&quot;</strong> button on any watch list to receive instant or daily email job alerts.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 space-y-2 relative group hover:border-emerald-500/40 transition-all">
              <div className="flex items-center justify-between">
                <span className="w-7 h-7 rounded-xl bg-emerald-600 text-white font-extrabold text-xs flex items-center justify-center shadow-xs">
                  3
                </span>
                <GitFork className="w-4 h-4 text-emerald-500" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Fork or Suggest Companies</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Click <strong>&quot;Fork&quot;</strong> to copy a list into your workspace or <strong>&quot;Suggest&quot;</strong> to recommend new career pages.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Metrics Row */}
      {!errorMsg && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="glass-card p-6 rounded-2xl border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Public Watch Lists</span>
              <Layers className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{stats?.totalLists ?? pagination.total ?? lists.length}</p>
          </div>

          <div className="glass-card p-6 rounded-2xl border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Unique Monitored Companies</span>
              <Briefcase className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{stats?.totalUniqueCompanies ?? 0}</p>
          </div>

          <div className="glass-card p-6 rounded-2xl border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Active Job Postings</span>
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{stats?.totalActiveJobs ?? 0}</p>
          </div>
        </div>
      )}

      {/* Directory Content */}
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
          {/* VIEW 1 & 2: Grid & Compact Tiles */}
          {viewMode !== 'list' ? (
            <div className={viewMode === 'tiles' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'}>
              {lists.map(l => (
                <div key={l.id} className={`glass-card rounded-2xl border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between hover:shadow-xl hover:border-blue-500/30 transition-all duration-300 group ${viewMode === 'tiles' ? 'p-4 space-y-3' : 'p-6 space-y-4'}`}>
                  <div className="space-y-3">
                    {/* Top Header Badge */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1 flex-wrap">
                        <Badge variant="canonical">Verified List</Badge>
                        {user && (user.id === l.userId || user.userId === l.userId) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/8 text-amber-700 dark:text-amber-300 border border-amber-500/20 text-[10px] font-medium">
                            <Crown className="w-3 h-3 text-amber-500" /> Owner
                          </span>
                        )}
                      </div>

                      {l.parentListName && (
                        <Badge variant="forked" parentName={l.parentListName} />
                      )}
                    </div>

                    {/* Title & Description */}
                    <div>
                      <Link href={`/lists/${l.slug}`} className="block group/title hover:underline decoration-blue-500/50">
                        <h3 className={`font-extrabold text-slate-900 dark:text-white tracking-tight group-hover/title:text-blue-600 dark:group-hover/title:text-blue-400 transition-colors ${viewMode === 'tiles' ? 'text-base leading-snug' : 'text-xl'}`}>
                          {l.name}
                        </h3>
                      </Link>
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                        {l.description || 'Public watch list of monitored company career pages.'}
                      </p>
                    </div>

                    {/* Stats Badges Bar */}
                    <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                      <Badge variant="company" count={l.companyCount || 0} />
                      <Badge variant="job" count={l.jobCount || 0} />
                      {l.followerCount > 0 && (
                        <Badge variant="follower" count={l.followerCount} />
                      )}
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (l.userId) setSelectedUserId(l.userId);
                      }}
                      className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 group/user transition-colors cursor-pointer text-left truncate"
                    >
                      {l.userAvatarUrl ? (
                        <img src={l.userAvatarUrl} alt={l.userName || 'User'} className="w-4 h-4 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-blue-600 text-white font-bold text-[8px] flex items-center justify-center shrink-0 shadow-sm">
                          {(l.userName?.[0] || 'U').toUpperCase()}
                        </div>
                      )}
                      <span className="truncate max-w-[100px] font-medium text-slate-700 dark:text-slate-300">
                        {l.userName || 'Curator'}
                      </span>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (typeof window !== 'undefined') {
                            navigator.clipboard.writeText(`${window.location.origin}/lists/${l.slug}`);
                            toast.success('Public watchlist link copied to clipboard!');
                          }
                        }}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                        title="Share Watchlist"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSuggestingList(l);
                        }}
                        className="p-1.5 rounded-lg border border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5 hover:bg-amber-500/15 transition-all cursor-pointer"
                        title="Suggest a company career page for this watchlist"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                      </button>

                      {user && (user.role === 'admin' || user.id === l.userId || user.userId === l.userId) ? (
                        <Link
                          href={`/dashboard/lists/${l.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all shadow-sm"
                        >
                          <Sliders className="w-3.5 h-3.5" /> Manage
                        </Link>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={(e) => handleForkList(e, l.slug, l.name)}
                            className="px-2.5 py-1.5 rounded-xl border border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/5 hover:bg-purple-500/15 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all shrink-0"
                            title="Fork watch list into your dashboard"
                          >
                            <GitFork className="w-3.5 h-3.5 text-purple-500" />
                            Fork
                          </button>

                          <Link
                            href={`/lists/${l.slug}`}
                            className="text-xs font-semibold text-blue-600 dark:text-blue-400 group-hover:translate-x-0.5 flex items-center gap-1 transition-all"
                          >
                            Openings <ExternalLink className="w-3 h-3" />
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* VIEW 3: List Table View */
            <div className="glass-panel rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                    <tr>
                      <th className="py-3.5 px-5">Watchlist Name</th>
                      <th className="py-3.5 px-4">Curator</th>
                      <th className="py-3.5 px-4">Monitored Metrics</th>
                      <th className="py-3.5 px-4">Status & Lineage</th>
                      <th className="py-3.5 px-5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                    {lists.map(l => (
                      <tr key={l.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors group">
                        <td className="py-4 px-5">
                          <div className="space-y-0.5">
                            <Link href={`/lists/${l.slug}`} className="font-extrabold text-sm text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {l.name}
                            </Link>
                            {l.description && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 max-w-md">{l.description}</p>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <button
                            type="button"
                            onClick={() => l.userId && setSelectedUserId(l.userId)}
                            className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                          >
                            {l.userAvatarUrl ? (
                              <img src={l.userAvatarUrl} alt={l.userName || 'User'} className="w-5 h-5 rounded-full object-cover border border-slate-200 dark:border-slate-700" />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[9px] flex items-center justify-center">
                                {(l.userName?.[0] || 'U').toUpperCase()}
                              </div>
                            )}
                            <span>{l.userName || 'Community Curator'}</span>
                          </button>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="company" count={l.companyCount || 0} />
                            <Badge variant="job" count={l.jobCount || 0} />
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="canonical">Verified</Badge>
                            {user && (user.id === l.userId || user.userId === l.userId) && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/8 text-amber-700 dark:text-amber-300 border border-amber-500/20 text-[10px] font-medium">
                                <Crown className="w-3 h-3 text-amber-500" /> Owner
                              </span>
                            )}
                            {l.parentListName && <Badge variant="forked" parentName={l.parentListName} />}
                          </div>
                        </td>
                        <td className="py-4 px-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (typeof window !== 'undefined') {
                                  navigator.clipboard.writeText(`${window.location.origin}/lists/${l.slug}`);
                                  toast.success('Public watchlist link copied to clipboard!');
                                }
                              }}
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                              title="Share Watchlist"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSuggestingList(l);
                              }}
                              className="p-1.5 rounded-lg border border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5 hover:bg-amber-500/15 transition-all cursor-pointer"
                              title="Suggest a company career page for this watchlist"
                            >
                              <PlusCircle className="w-3.5 h-3.5" />
                            </button>

                            {user && (user.role === 'admin' || user.id === l.userId || user.userId === l.userId) ? (
                              <Link
                                href={`/dashboard/lists/${l.id}`}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all shadow-sm"
                              >
                                <Sliders className="w-3.5 h-3.5" /> Manage
                              </Link>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => handleForkList(e, l.slug, l.name)}
                                  className="px-2.5 py-1.5 rounded-lg border border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/5 hover:bg-purple-500/15 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all shrink-0"
                                  title="Fork watch list into your dashboard"
                                >
                                  <GitFork className="w-3.5 h-3.5 text-purple-500" />
                                  Fork
                                </button>

                                <Link
                                  href={`/lists/${l.slug}`}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all shadow-sm"
                                >
                                  View Openings <ExternalLink className="w-3 h-3" />
                                </Link>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-slate-200 dark:border-slate-800/80">
              <span className="text-xs text-slate-500">
                Page <span className="font-bold text-slate-900 dark:text-white">{pagination.page}</span> of <span className="font-bold text-slate-900 dark:text-white">{pagination.totalPages}</span> ({pluralize(pagination.total, 'total public watch list', 'total public watch lists')})
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
    </>
  );

  const suggestionModal = suggestingList && (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel max-w-md w-full p-6 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4 bg-white dark:bg-slate-950 shadow-2xl animate-in fade-in zoom-in-95 duration-150 relative">
        <button
          onClick={() => {
            setSuggestingList(null);
            setSuggestSuccess('');
          }}
          type="button"
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2 pr-6">
          <PlusCircle className="w-5 h-5 text-amber-500" />
          Suggest a Company
        </h3>

        <p className="text-xs text-slate-600 dark:text-slate-400">
          Suggest a company career page for <span className="font-bold text-slate-900 dark:text-white">{suggestingList.name}</span>. The list curator will review your contribution.
        </p>

        <form onSubmit={handleSuggestCompany} className="space-y-4 pt-2">
          {suggestSuccess ? (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold text-center">
              {suggestSuccess}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                  Career Page URL *
                </label>
                <input
                  type="url"
                  required
                  value={suggestUrl}
                  onChange={e => setSuggestUrl(e.target.value)}
                  placeholder="https://boards.greenhouse.io/company"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-amber-500 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                  Company Name (Optional)
                </label>
                <input
                  type="text"
                  value={suggestCompany}
                  onChange={e => setSuggestCompany(e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-amber-500 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end pt-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setSuggestingList(null);
                setSuggestSuccess('');
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            {!suggestSuccess && (
              <button
                type="submit"
                disabled={suggestSubmitting}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md cursor-pointer transition-all disabled:opacity-50"
              >
                {suggestSubmitting ? 'Submitting...' : 'Submit Suggestion'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );

  if (user) {
    return (
      <DashboardLayout>
        {discoverBodyContent}
        {suggestionModal}
        <PublicUserProfileModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
      </DashboardLayout>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080c14] text-slate-900 dark:text-slate-100 flex flex-col justify-between transition-colors">
      <Navbar showBackHome />
      <div className="p-6 md:p-12 max-w-6xl mx-auto w-full space-y-8 flex-1">
        {discoverBodyContent}
      </div>
      {suggestionModal}
      <PublicUserProfileModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
      <Footer />
    </div>
  );
}
