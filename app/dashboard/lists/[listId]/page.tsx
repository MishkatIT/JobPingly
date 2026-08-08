'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Globe, Lock, Plus, ExternalLink, RefreshCw, CheckCircle, AlertTriangle, Briefcase, Zap, Trash2, MoreVertical, Edit3, Search } from 'lucide-react';
import { useToast } from '@/components/Toast';
import LoadingSpinner from '@/components/LoadingSpinner';
import { JobCard } from '@/components/JobCard';

export default function ListDetailPage() {
  const toast = useToast();
  const params = useParams();
  const router = useRouter();
  const listId = params.listId as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Instant Job Search State (0 DB/Server calls)
  const [searchQuery, setSearchQuery] = useState('');

  // Dropdown & Modals state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingCompany, setEditingCompany] = useState<any | null>(null);
  const [editCompanyNameStr, setEditCompanyNameStr] = useState('');
  const [editCompanyUrlStr, setEditCompanyUrlStr] = useState('');
  const [updatingCompany, setUpdatingCompany] = useState(false);
  const [scrapingMap, setScrapingMap] = useState<Record<string, boolean>>({});
  const [syncingAll, setSyncingAll] = useState(false);

  // Add career page form
  const [showAdd, setShowAdd] = useState(false);
  const [url, setUrl] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [keywords, setKeywords] = useState('');
  const [adding, setAdding] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  const loadDetail = async () => {
    try {
      const res = await fetch(`/api/lists/${listId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load list');
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (listId) loadDetail();
  }, [listId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSyncPage = async (pageId: string, companyStr: string) => {
    setOpenMenuId(null);
    setScrapingMap(prev => ({ ...prev, [pageId]: true }));
    toast.info(`Syncing latest job postings for '${companyStr}'...`);

    try {
      const res = await fetch(`/api/career-pages/${pageId}`, { method: 'POST' });
      const json = await res.json();
      if (res.ok) {
        const found = json.result?.jobsFound || 0;
        const added = json.result?.jobsAdded || 0;
        if (found === 0) {
          toast.success(`Checked '${companyStr}': No open positions found.`);
        } else if (added > 0) {
          toast.success(`Checked '${companyStr}': ${found} jobs found (${added} new added)!`);
        } else {
          toast.success(`Checked '${companyStr}': ${found} jobs found (all up to date)!`);
        }
        loadDetail();
      } else {
        toast.error(json.error || 'Sync failed');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setScrapingMap(prev => ({ ...prev, [pageId]: false }));
    }
  };

  const handleSyncAll = async () => {
    if (!pages || pages.length === 0) return;
    setSyncingAll(true);
    toast.info(`Syncing all ${pages.length} monitored pages...`);

    let totalFound = 0;
    let totalAdded = 0;

    try {
      for (const p of pages) {
        setScrapingMap(prev => ({ ...prev, [p.id]: true }));
        try {
          const res = await fetch(`/api/career-pages/${p.id}`, { method: 'POST' });
          const json = await res.json();
          if (res.ok) {
            totalFound += json.result?.jobsFound || 0;
            totalAdded += json.result?.jobsAdded || 0;
          }
        } catch {
          // Continue syncing remaining pages
        } finally {
          setScrapingMap(prev => ({ ...prev, [p.id]: false }));
        }
      }

      toast.success(`Sync finished! Found ${totalFound} jobs (${totalAdded} new added).`);
      loadDetail();
    } catch (e: any) {
      toast.error('Sync process failed: ' + e.message);
    } finally {
      setSyncingAll(false);
    }
  };

  const handleAddPage = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);

    try {
      const res = await fetch(`/api/lists/${listId}/career-pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          companyName,
          positiveKeywords: keywords ? keywords.split(',').map(k => k.trim()) : [],
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to add career page');

      const addedPage = json.careerPage;
      const compName = addedPage?.companyName || companyName || 'Company';

      // 1. Instantly close modal and clear fields
      setUrl('');
      setCompanyName('');
      setKeywords('');
      setShowAdd(false);
      loadDetail(); // Show new company card on left column immediately

      // 2. Show Toast 1: Job sync started
      toast.info(`Job sync started for '${compName}'...`);

      // 3. Trigger sync call and show Toast 2 when finished
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
              loadDetail(); // Refresh job feed automatically!
            }
          })
          .catch(() => {});
      }
    } catch (err: any) {
      const errorText = err.message || 'Failed to add career page';
      toast.error(errorText);
    } finally {
      setAdding(false);
    }
  };

  const handleEditCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;
    setUpdatingCompany(true);

    try {
      const res = await fetch(`/api/career-pages/${editingCompany.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: editCompanyNameStr,
          url: editCompanyUrlStr,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success('Company details updated successfully!');
        setEditingCompany(null);
        loadDetail();
      } else {
        toast.error(json.error || 'Failed to update company details');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUpdatingCompany(false);
    }
  };

  const handleDeleteCareerPage = async (careerPageId: string, pageCompanyName: string) => {
    setOpenMenuId(null);
    if (!confirm(`Are you sure you want to remove '${pageCompanyName}' from this watch list?`)) return;
    try {
      const res = await fetch(`/api/lists/${listId}/career-pages?careerPageId=${careerPageId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.info(`Removed '${pageCompanyName}' from watch list`);
        loadDetail();
      } else {
        const json = await res.json();
        toast.error(json.error || 'Failed to remove career page');
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleVisibilityToggle = async () => {
    if (!data?.list) return;
    const newVis = data.list.visibility === 'public' ? 'private' : 'public';
    try {
      const res = await fetch(`/api/lists/${listId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.list.name,
          description: data.list.description,
          visibility: newVis,
        }),
      });
      if (res.ok) {
        toast.info(`Watch list visibility changed to '${newVis.toUpperCase()}'`);
        loadDetail();
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading) return <LoadingSpinner message="Loading list detail..." fullPage />;
  if (error) return <div className="text-rose-600 dark:text-rose-400 text-sm p-4">{error}</div>;

  const { list, pages, jobs } = data;

  const filteredPages = (pages || []).filter((p: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const companyName = (p.companyName || '').toLowerCase();
    const url = (p.url || '').toLowerCase();
    return companyName.includes(q) || url.includes(q);
  });

  const filteredJobs = (jobs || []).filter((j: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const title = (j.title || '').toLowerCase();
    const company = ((j.companyName || j.rawData?.company || '') as string).toLowerCase();
    const location = (j.location || '').toLowerCase();
    const department = (j.department || '').toLowerCase();
    const jobType = (j.jobType || j.rawData?.employmentType || '').toLowerCase();
    const experience = (j.rawData?.experience || '').toLowerCase();

    return (
      title.includes(q) ||
      company.includes(q) ||
      location.includes(q) ||
      department.includes(q) ||
      jobType.includes(q) ||
      experience.includes(q)
    );
  });

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Top Header */}
      <div>
        <Link href="/dashboard/lists" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Watch Lists
        </Link>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{list.name}</h1>
              <button
                onClick={handleVisibilityToggle}
                className={`text-xs font-bold uppercase px-3 py-1 rounded-full flex items-center gap-1.5 transition-all cursor-pointer ${
                  list.visibility === 'public'
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {list.visibility === 'public' ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                {list.visibility} (Click to toggle)
              </button>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">{list.description || 'No description provided.'}</p>
          </div>

          <div className="flex items-center gap-3">
            {list.visibility === 'public' && (
              <Link
                href={`/lists/${list.slug}`}
                target="_blank"
                className="text-xs font-semibold glass-panel px-4 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> View Public Page
              </Link>
            )}

            <button
              onClick={() => setShowAdd(true)}
              className="text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl shadow-md flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add Company Page
            </button>
          </div>
        </div>
      </div>

      {/* Grid: Left column Monitored Pages, Right column Jobs Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Monitored Pages */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center justify-between">
            <span>Monitored Pages ({filteredPages.length})</span>
            {pages.length > 0 && (
              <button
                onClick={handleSyncAll}
                disabled={syncingAll}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 px-3 py-1 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${syncingAll ? 'animate-spin' : ''}`} />
                {syncingAll ? 'Syncing All...' : 'Sync All'}
              </button>
            )}
          </h2>

          {filteredPages.length === 0 ? (
            <div className="glass-panel p-6 rounded-2xl text-center border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
              {searchQuery ? `No companies match "${searchQuery}"` : 'No career pages added to this list yet. Click "+ Add Company Page".'}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPages.map((p: any) => (
                <div
                  key={p.id}
                  className={`glass-card p-4 rounded-xl border-slate-200 dark:border-slate-800 text-xs transition-all ${
                    openMenuId === p.id ? 'z-50 relative' : 'z-0 relative'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-900 dark:text-white text-sm">{p.companyName || 'Company'}</span>
                    <div className="flex items-center gap-2">
                      {/* Three Dots Menu */}
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === p.id ? null : p.id)}
                          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Options"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>

                        {openMenuId === p.id && (
                          <div
                            ref={menuRef}
                            className="absolute right-0 top-6 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-[100] py-1 space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
                          >
                            <button
                              onClick={() => handleSyncPage(p.id, p.companyName || 'Company')}
                              disabled={scrapingMap[p.id]}
                              className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 text-blue-500 ${scrapingMap[p.id] ? 'animate-spin' : ''}`} />
                              {scrapingMap[p.id] ? 'Syncing...' : 'Sync Now'}
                            </button>

                            <button
                              onClick={() => {
                                setEditingCompany(p);
                                setEditCompanyNameStr(p.companyName || '');
                                setEditCompanyUrlStr(p.url || '');
                                setOpenMenuId(null);
                              }}
                              className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                              Edit Name &amp; URL
                            </button>

                            <a
                              href={p.url}
                              target="_blank"
                              rel="noreferrer"
                              className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
                              onClick={() => setOpenMenuId(null)}
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-emerald-500" />
                              Visit Page
                            </a>

                            <div className="my-1 border-t border-slate-200 dark:border-slate-800" />

                            <button
                              onClick={() => handleDeleteCareerPage(p.id, p.companyName || 'Company')}
                              className="w-full text-left px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                              Remove Company
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <a href={p.url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline truncate block mb-2 font-mono text-[11px]">
                    {p.url}
                  </a>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <span>Status: {p.status}</span>
                    <span>Interval: {p.checkIntervalMinutes}m</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detected Jobs Feed */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Active Open Positions ({filteredJobs.length})
            </h2>

            {/* Instant Search Bar (0 DB/Server Calls) */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search title, company, location..."
                className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600 transition-all shadow-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs font-bold cursor-pointer"
                >
                  &times;
                </button>
              )}
            </div>
          </div>

          {filteredJobs.length === 0 ? (
            <div className="glass-panel p-10 rounded-2xl text-center border-slate-200 dark:border-slate-800 space-y-2">
              <Briefcase className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto mb-2" />
              {searchQuery ? (
                <>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">No jobs match "{searchQuery}"</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Try searching for a different title, company, or keyword.</p>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline pt-1 cursor-pointer"
                  >
                    Clear Search Filter
                  </button>
                </>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">No active positions currently detected for this list.</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredJobs.map((j: any) => (
                <JobCard key={j.id} job={j} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Page Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-panel p-6 rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Add Career Page to {list.name}
            </h3>

            <form onSubmit={handleAddPage} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Career URL *</label>
                <input
                  type="url"
                  required
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://boards.greenhouse.io/company"
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Company Name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="e.g. Acme Inc"
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Positive Keywords (comma separated)</label>
                <input
                  type="text"
                  value={keywords}
                  onChange={e => setKeywords(e.target.value)}
                  placeholder="e.g. Backend, Node.js"
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="pt-3 flex justify-end gap-3">
                <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={adding} className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer">
                  {adding ? 'Adding...' : 'Add Page'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Company Details Modal */}
      {editingCompany && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-panel p-6 rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Edit Monitored Company
            </h3>

            <form onSubmit={handleEditCompanySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Company Name *</label>
                <input
                  type="text"
                  required
                  value={editCompanyNameStr}
                  onChange={e => setEditCompanyNameStr(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Career Page URL *</label>
                <input
                  type="url"
                  required
                  value={editCompanyUrlStr}
                  onChange={e => setEditCompanyUrlStr(e.target.value)}
                  placeholder="https://company.com/careers"
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600 font-mono"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingCompany(null)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-600 dark:text-slate-400 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingCompany}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md cursor-pointer"
                >
                  {updatingCompany ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
