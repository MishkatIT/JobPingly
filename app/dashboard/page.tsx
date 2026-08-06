'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Layers, Briefcase, Globe, Plus, CheckCircle2, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/components/Toast';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function DashboardOverview() {
  const toast = useToast();
  const [lists, setLists] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

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

      toast.success('Successfully added career page! Initial scrape enqueued.');
      setUrl('');
      setCompanyName('');
      setKeywords('');
      fetchDashboardData();
      setShowAddModal(false);
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
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Scraper Status</span>
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
          
          <div className="flex items-center gap-3">
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {lists.map(list => (
                <div key={list.id} className="glass-card p-6 rounded-2xl border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                        list.visibility === 'public'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700'
                      }`}>
                        {list.visibility}
                      </span>
                      <span className="text-xs text-slate-500">{list.companyCount || 0} companies</span>
                    </div>

                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{list.name}</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{list.description || 'No description provided.'}</p>
                  </div>

                  <div className="pt-6 mt-6 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
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
      {showAddModal && (
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
        </div>
      )}
    </div>
  );
}
