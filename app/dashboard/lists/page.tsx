'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Layers, Plus, Globe, Lock, Trash2, ExternalLink, Briefcase, ChevronLeft, ChevronRight, MoreVertical, Edit3, Building, LayoutGrid, Grid2X2, List } from 'lucide-react';
import { useToast } from '@/components/Toast';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function WatchListsPage() {
  const toast = useToast();
  const [mounted, setMounted] = useState(false);
  const [lists, setLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // View Mode State (Grid, Tiles, List)
  const [viewMode, setViewMode] = useState<'grid' | 'tiles' | 'list'>('grid');

  useEffect(() => {
    const saved = localStorage.getItem('jobpingly_dashboard_view');
    if (saved === 'grid' || saved === 'tiles' || saved === 'list') {
      setViewMode(saved);
    }
  }, []);

  const handleViewChange = (mode: 'grid' | 'tiles' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('jobpingly_dashboard_view', mode);
  };

  // Modals & Menu State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingList, setEditingList] = useState<any | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Pagination states
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(9);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 9, totalPages: 1 });

  // Create/Edit form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [submitting, setSubmitting] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  const loadLists = async (p = page, l = limit) => {
    try {
      const res = await fetch(`/api/lists?page=${p}&limit=${l}`);
      const data = await res.json();
      if (res.ok) {
        setLists(data.lists || []);
        setPagination(data.pagination || { total: 0, page: p, limit: l, totalPages: 1 });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLists(page, limit);
  }, [page, limit]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, visibility }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(`Watch list '${name}' created successfully!`);
        setName('');
        setDescription('');
        setVisibility('private');
        setShowCreateModal(false);
        loadLists(1, limit);
        setPage(1);
      } else {
        toast.error(data.error || 'Failed to create watch list.');
      }
    } catch (e: any) {
      toast.error(e.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingList) return;
    setSubmitting(true);

    try {
      const res = await fetch(`/api/lists/${editingList.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, visibility }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(`Watch list updated successfully!`);
        setEditingList(null);
        setName('');
        setDescription('');
        setVisibility('private');
        loadLists(page, limit);
      } else {
        toast.error(data.error || 'Failed to update watch list.');
      }
    } catch (e: any) {
      toast.error(e.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteList = async (listId: string, listName: string) => {
    setOpenMenuId(null);
    if (!confirm(`Are you sure you want to delete watch list '${listName}'?`)) return;
    try {
      const res = await fetch(`/api/lists/${listId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.info(`Deleted watch list '${listName}'`);
        loadLists(page, limit);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete list');
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const openEditModal = (list: any) => {
    setEditingList(list);
    setName(list.name);
    setDescription(list.description || '');
    setVisibility(list.visibility || 'private');
    setOpenMenuId(null);
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">My Watch Lists</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Manage private and public career page watch lists</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
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
            className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
          >
            <option value={6}>6 per page</option>
            <option value={9}>9 per page</option>
            <option value={15}>15 per page</option>
            <option value={30}>30 per page</option>
          </select>

          <button
            onClick={() => {
              setName('');
              setDescription('');
              setVisibility('private');
              setShowCreateModal(true);
            }}
            className="text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl shadow-md flex items-center gap-2 shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Create New List
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner message="Loading watch lists..." fullPage={false} />
      ) : lists.length === 0 ? (
        <div className="glass-panel p-12 rounded-3xl text-center border-slate-200 dark:border-slate-800">
          <Briefcase className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">No Watch Lists Created</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-6">Create a list to group and follow company career pages.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl cursor-pointer"
          >
            Create First List
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {viewMode !== 'list' ? (
            <div className={viewMode === 'tiles' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'}>
              {lists.map(l => (
                <div key={l.id} className={`glass-card border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between hover:shadow-xl hover:border-blue-500/30 transition-all duration-300 group relative ${viewMode === 'tiles' ? 'p-4 rounded-2xl space-y-3' : 'p-6 rounded-3xl space-y-4'}`}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1.5 ${
                        l.visibility === 'public'
                          ? 'bg-blue-500/8 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}>
                        {l.visibility === 'public' ? <Globe className="w-3.5 h-3.5 text-blue-500" /> : <Lock className="w-3.5 h-3.5 text-slate-400" />}
                        {l.visibility === 'public' ? 'Public' : 'Private'}
                      </span>

                      {/* Three Dots Menu Button */}
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === l.id ? null : l.id)}
                          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-all cursor-pointer"
                          title="Options"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {/* Dropdown Menu */}
                        {openMenuId === l.id && (
                          <div
                            ref={menuRef}
                            className="absolute right-0 top-8 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-30 py-1 space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
                          >
                            <Link
                              href={`/dashboard/lists/${l.id}`}
                              className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-2 transition-colors"
                              onClick={() => setOpenMenuId(null)}
                            >
                              <Building className="w-3.5 h-3.5 text-blue-500" />
                              Add Company Page
                            </Link>

                            <button
                              onClick={() => openEditModal(l)}
                              className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                              Edit List
                            </button>

                            <div className="my-1 border-t border-slate-200 dark:border-slate-800" />

                            <button
                              onClick={() => handleDeleteList(l.id, l.name)}
                              className="w-full text-left px-3.5 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                              Delete List
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className={`font-bold text-slate-900 dark:text-white tracking-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors ${viewMode === 'tiles' ? 'text-base leading-snug' : 'text-xl'}`}>
                        {l.name}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                        {l.description || 'No description provided.'}
                      </p>
                    </div>

                    {/* Stats Badges Bar */}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 px-2 py-0.5 rounded-md">
                        <Building className="w-3.5 h-3.5 text-slate-500" />
                        {l.companyCount || 0} Pages
                      </span>

                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-500/8 border border-blue-500/20 px-2 py-0.5 rounded-md">
                        <Briefcase className="w-3.5 h-3.5 text-blue-500" />
                        {l.jobCount || 0} Jobs
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
                    <Link
                      href={`/dashboard/lists/${l.id}`}
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 group-hover:translate-x-0.5 flex items-center gap-1 transition-all"
                    >
                      Manage Pages <ExternalLink className="w-3.5 h-3.5" />
                    </Link>

                    {l.visibility === 'public' && (
                      <Link
                        href={`/lists/${l.slug}`}
                        className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 transition-colors"
                      >
                        Public Link <Globe className="w-3.5 h-3.5" />
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
                      <th className="py-3.5 px-5">Watchlist Name</th>
                      <th className="py-3.5 px-4">Visibility</th>
                      <th className="py-3.5 px-4">Pages & Jobs</th>
                      <th className="py-3.5 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                    {lists.map(l => (
                      <tr key={l.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors group">
                        <td className="py-4 px-5">
                          <div className="space-y-0.5">
                            <Link href={`/dashboard/lists/${l.id}`} className="font-extrabold text-sm text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {l.name}
                            </Link>
                            {l.description && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 max-w-md">{l.description}</p>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium ${
                            l.visibility === 'public'
                              ? 'bg-blue-500/8 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                          }`}>
                            {l.visibility === 'public' ? <Globe className="w-3.5 h-3.5 text-blue-500" /> : <Lock className="w-3.5 h-3.5 text-slate-400" />}
                            {l.visibility === 'public' ? 'Public' : 'Private'}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                              {l.companyCount || 0} Pages
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-blue-500/8 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[11px] font-medium">
                              {l.jobCount || 0} Jobs
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {l.visibility === 'public' && (
                              <Link
                                href={`/lists/${l.slug}`}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                title="Public View"
                              >
                                <Globe className="w-3.5 h-3.5 text-blue-500" />
                              </Link>
                            )}
                            <button
                              onClick={() => openEditModal(l)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              title="Edit List"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteList(l.id, l.name)}
                              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-500/20 transition-colors"
                              title="Delete List"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <Link
                              href={`/dashboard/lists/${l.id}`}
                              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-sm"
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
                Page <span className="font-bold text-slate-900 dark:text-white">{pagination.page}</span> of <span className="font-bold text-slate-900 dark:text-white">{pagination.totalPages}</span> ({pagination.total} total watch lists)
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

      {/* Create List Modal */}
      {showCreateModal && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-panel p-6 rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Create New Watch List
            </h3>

            <form onSubmit={handleCreateList} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">List Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Bangladesh Tech Companies"
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Brief summary of companies in this list..."
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-xs h-20 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Visibility</label>
                <select
                  value={visibility}
                  onChange={e => setVisibility(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value="private">Private (Only viewable by you)</option>
                  <option value="public">Public (Discoverable &amp; Shareable via URL)</option>
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-600 dark:text-slate-400 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md cursor-pointer"
                >
                  {submitting ? 'Creating...' : 'Create List'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Edit List Modal */}
      {editingList && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-panel p-6 rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Edit Watch List
            </h3>

            <form onSubmit={handleUpdateList} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">List Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-xs h-20 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Visibility</label>
                <select
                  value={visibility}
                  onChange={e => setVisibility(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value="private">Private (Only viewable by you)</option>
                  <option value="public">Public (Discoverable &amp; Shareable via URL)</option>
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingList(null)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-600 dark:text-slate-400 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md cursor-pointer"
                >
                  {submitting ? 'Updating...' : 'Save Changes'}
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
