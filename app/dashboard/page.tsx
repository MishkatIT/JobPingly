'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Layers, Briefcase, Globe, Plus, CheckCircle2, ExternalLink, ChevronLeft, ChevronRight, LayoutGrid, Grid2X2, List } from 'lucide-react';
import { useToast } from '@/components/Toast';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function DashboardOverview() {
  const toast = useToast();
  const [mounted, setMounted] = useState(false);
  const [lists, setLists] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // View Mode State (Grid, Tiles, List)
  const [viewMode, setViewMode] = useState<'grid' | 'tiles' | 'list'>('grid');

  useEffect(() => {
    const saved = localStorage.getItem('jobpingly_overview_view');
    if (saved === 'grid' || saved === 'tiles' || saved === 'list') {
      setViewMode(saved);
    }
  }, []);

  const handleViewChange = (mode: 'grid' | 'tiles' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('jobpingly_overview_view', mode);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  // Pagination states
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(9);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 9, totalPages: 1 });

  // Form states
  const [url, setUrl] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [keywords, setKeywords] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchDashboardData = async () => {
    try {
      const [listsRes, meRes] = await Promise.all([
        fetch(`/api/lists?page=${page}&limit=${limit}`),
        fetch('/api/me'),
      ]);

      if (listsRes.ok) {
        const data = await listsRes.json();
        setLists(data.lists || []);
        setPagination(data.pagination || { total: 0, page, limit, totalPages: 1 });
        if (data.lists?.length > 0 && !selectedListId) {
          setSelectedListId(data.lists[0].id);
        }
      }

      if (meRes.ok) {
        const meData = await meRes.json();
        setUser(meData.user);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [page, limit]);

  const handleAddCareerPage = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      let listIdToUse = selectedListId;

      if (!listIdToUse) {
        const createRes = await fetch('/api/lists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'My Primary Watch List', visibility: 'private' }),
        });
        const createData = await createRes.json();
        if (!createRes.ok) throw new Error(createData.error || 'Failed to create list');
        listIdToUse = createData.list.id;
      }

      const res = await fetch(`/api/lists/${listIdToUse}/career-pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          companyName,
          positiveKeywords: keywords ? keywords.split(',').map(k => k.trim()) : [],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add career page');

      const addedPage = data.careerPage;
      const compName = addedPage?.companyName || companyName || 'Company';

      setUrl('');
      setCompanyName('');
      setKeywords('');
      setShowAddModal(false);
      fetchDashboardData();

      toast.info(`Job sync started for '${compName}'...`);

      if (addedPage?.id) {
        fetch(`/api/career-pages/${addedPage.id}`, { method: 'POST' })
          .then(r => r.json())
          .then(syncJson => {
            if (syncJson.success) {
              const found = syncJson.result?.jobsFound || 0;
              const added = syncJson.result?.jobsAdded || 0;
              if (found > 0) {
                toast.success(`Sync complete for '${compName}': ${found} jobs found (${added} new)!`);
              } else {
                toast.info(`Sync complete for '${compName}': No open positions detected.`);
              }
              fetchDashboardData();
            }
          })
          .catch(() => {});
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to add career page');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading Dashboard..." fullPage />;
  }

  const totalCompanies = lists.reduce((acc, l) => acc + (l.companyCount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Dashboard Overview</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Track your watched companies and view job alerts</p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl shadow-md flex items-center gap-2 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add Career Page
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="glass-card p-6 rounded-2xl border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Watch Lists</span>
            <Layers className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{pagination.total || lists.length}</p>
        </div>

        <div className="glass-card p-6 rounded-2xl border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Monitored Companies</span>
            <Briefcase className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{totalCompanies}</p>
        </div>

        <div className="glass-card p-6 rounded-2xl border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Monitor Status</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold">
            <CheckCircle2 className="w-5 h-5" />
            <span>Active &amp; Monitoring</span>
          </div>
        </div>
      </div>

      {/* My Lists Section */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Your Watch Lists ({pagination.total})</h2>
          
          <div className="flex items-center gap-3 flex-wrap">
            {/* Google Drive Style View Switcher */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => handleViewChange('grid')}
                className={`px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition-all cursor-pointer ${
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
                className={`px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition-all cursor-pointer ${
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
                className={`px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition-all cursor-pointer ${
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
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
            >
              <option value={6}>6 per page</option>
              <option value={9}>9 per page</option>
              <option value={15}>15 per page</option>
              <option value={30}>30 per page</option>
            </select>

            <Link href="/dashboard/lists" className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              View All
            </Link>
          </div>
        </div>

        {lists.length === 0 ? (
          <div className="glass-panel p-10 rounded-2xl text-center border-slate-200 dark:border-slate-800">
            <Briefcase className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">No Watch Lists Yet</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-6">Create your first list to start monitoring career pages.</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl cursor-pointer"
            >
              + Create First List
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {viewMode !== 'list' ? (
              <div className={viewMode === 'tiles' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'}>
                {lists.map(list => (
                  <div key={list.id} className={`glass-card rounded-2xl border-slate-200 dark:border-slate-800 flex flex-col justify-between ${viewMode === 'tiles' ? 'p-4 space-y-3' : 'p-6 space-y-4'}`}>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                          list.visibility === 'public'
                            ? 'bg-blue-500/8 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                        }`}>
                          {list.visibility === 'public' ? 'Public' : 'Private'}
                        </span>
                        <span className="text-[11px] font-medium text-slate-500">{list.companyCount || 0} companies</span>
                      </div>

                      <h3 className={`font-bold text-slate-900 dark:text-white ${viewMode === 'tiles' ? 'text-base leading-snug' : 'text-lg'}`}>{list.name}</h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mt-1">{list.description || 'No description provided.'}</p>
                    </div>

                    <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
                      <Link
                        href={`/dashboard/lists/${list.id}`}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        Manage List <ExternalLink className="w-3.5 h-3.5" />
                      </Link>

                      {list.visibility === 'public' && (
                        <Link
                          href={`/lists/${list.slug}`}
                          className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1"
                        >
                          Public View <Globe className="w-3.5 h-3.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* List Table View */
              <div className="glass-panel rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                      <tr>
                        <th className="py-3 px-4">Watchlist Name</th>
                        <th className="py-3 px-3">Visibility</th>
                        <th className="py-3 px-3">Companies</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                      {lists.map(list => (
                        <tr key={list.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="space-y-0.5">
                              <Link href={`/dashboard/lists/${list.id}`} className="font-bold text-sm text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                                {list.name}
                              </Link>
                              {list.description && (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 max-w-md">{list.description}</p>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-3">
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                              list.visibility === 'public'
                                ? 'bg-blue-500/8 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                            }`}>
                              {list.visibility === 'public' ? 'Public' : 'Private'}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 font-semibold text-slate-700 dark:text-slate-300">
                            {list.companyCount || 0} Companies
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {list.visibility === 'public' && (
                                <Link
                                  href={`/lists/${list.slug}`}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800 transition-colors"
                                  title="Public View"
                                >
                                  <Globe className="w-3.5 h-3.5 text-blue-500" />
                                </Link>
                              )}
                              <Link
                                href={`/dashboard/lists/${list.id}`}
                                className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all shadow-sm"
                              >
                                Manage
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Pagination Controls Bar */}
            {pagination.totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
                <span className="text-xs text-slate-500">
                  Page <span className="font-bold text-slate-900 dark:text-white">{pagination.page}</span> of <span className="font-bold text-slate-900 dark:text-white">{pagination.totalPages}</span> ({pagination.total} total lists)
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(prev => Math.max(1, prev - 1))}
                    disabled={page <= 1}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Previous
                  </button>

                  <button
                    onClick={() => setPage(prev => Math.min(pagination.totalPages, prev + 1))}
                    disabled={page >= pagination.totalPages}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Career Page Modal */}
      {showAddModal && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg glass-panel p-6 rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl relative">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Add Career Page to Watch List
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAddCareerPage} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Career Page URL *
                </label>
                <input
                  type="url"
                  required
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://boards.greenhouse.io/stripe or https://company.com/careers"
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Company Name (Optional)
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="e.g. Stripe, Pathao, Netflix"
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Select Target Watch List
                </label>
                <select
                  value={selectedListId}
                  onChange={e => setSelectedListId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  {lists.map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({l.visibility})</option>
                  ))}
                  {lists.length === 0 && <option value="">Create new watch list automatically</option>}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Positive Keyword Filters (Comma separated)
                </label>
                <input
                  type="text"
                  value={keywords}
                  onChange={e => setKeywords(e.target.value)}
                  placeholder="e.g. Backend, Node.js, Remote, React, Intern"
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md cursor-pointer"
                >
                  {submitting ? 'Adding...' : 'Add Career Page'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
