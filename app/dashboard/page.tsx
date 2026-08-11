'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  Layers,
  Briefcase,
  Globe,
  Lock,
  Plus,
  CheckCircle2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Grid2X2,
  List,
  MoreVertical,
  Edit3,
  Trash2,
  Building,
  Search,
  Sparkles,
  RefreshCw,
  Users,
  Bell,
  Settings,
  Sliders,
  Filter,
  X,
} from 'lucide-react';
import { pluralize } from '@/lib/utils/pluralize';
import { useToast } from '@/components/Toast';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function DashboardOverview() {
  const toast = useToast();
  const [mounted, setMounted] = useState(false);
  const [lists, setLists] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // View Mode State (Grid, Tiles, List)
  const [viewMode, setViewMode] = useState<'grid' | 'tiles' | 'list'>('grid');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Menu State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddPageModal, setShowAddPageModal] = useState(false);
  const [editingList, setEditingList] = useState<any | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const createListInputRef = useRef<HTMLInputElement>(null);
  const addPageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showCreateModal) {
      setTimeout(() => createListInputRef.current?.focus(), 50);
    }
  }, [showCreateModal]);

  useEffect(() => {
    if (showAddPageModal) {
      setTimeout(() => addPageInputRef.current?.focus(), 50);
    }
  }, [showAddPageModal]);

  // Pagination states
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(9);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 9, totalPages: 1 });

  // Form states for Create/Edit List
  const [listName, setListName] = useState('');
  const [listDescription, setListDescription] = useState('');
  const [listVisibility, setListVisibility] = useState('private');

  // Form states for Add Career Page
  const [pageUrl, setPageUrl] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [keywords, setKeywords] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedView = localStorage.getItem('jobpingly_dashboard_view');
    if (savedView === 'grid' || savedView === 'tiles' || savedView === 'list') {
      setViewMode(savedView);
    }
  }, []);

  const handleViewChange = (mode: 'grid' | 'tiles' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('jobpingly_dashboard_view', mode);
  };

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

  // Invitations & Stats state
  const [invitations, setInvitations] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);

  const fetchDashboardData = async (p = page, l = limit) => {
    try {
      const [listsRes, meRes, invRes] = await Promise.all([
        fetch(`/api/lists?page=${p}&limit=${l}`),
        fetch('/api/me'),
        fetch('/api/me/invitations'),
      ]);

      if (listsRes.ok) {
        const data = await listsRes.json();
        setLists(data.lists || []);
        setPagination(data.pagination || { total: 0, page: p, limit: l, totalPages: 1 });
        if (data.stats) setStats(data.stats);
        if (data.lists?.length > 0 && !selectedListId) {
          setSelectedListId(data.lists[0].id);
        }
      }

      if (meRes.ok) {
        const meData = await meRes.json();
        setUser(meData.user);
      }

      if (invRes.ok) {
        const invData = await invRes.json();
        setInvitations(invData.invitations || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Subscribed / Followed Lists State
  const [activeDashboardTab, setActiveDashboardTab] = useState<'owned' | 'followed'>('owned');
  const [followedLists, setFollowedLists] = useState<any[]>([]);
  const [loadingFollowed, setLoadingFollowed] = useState(false);

  // Alert Settings Modal State for Followed List
  const [editingSubList, setEditingSubList] = useState<any | null>(null);
  const [subDigestFreq, setSubDigestFreq] = useState<'instant' | 'daily' | 'weekly'>('instant');
  const [subPosKeys, setSubPosKeys] = useState('');
  const [subNegKeys, setSubNegKeys] = useState('');
  const [submittingSub, setSubmittingSub] = useState(false);

  const fetchFollowedLists = async () => {
    setLoadingFollowed(true);
    try {
      const res = await fetch('/api/me/subscriptions');
      if (res.ok) {
        const json = await res.json();
        setFollowedLists(json.subscriptions || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingFollowed(false);
    }
  };

  useEffect(() => {
    fetchFollowedLists();
  }, []);

  const handleUnfollowSub = async (slug: string, name: string) => {
    if (!confirm(`Unfollow watch list "${name}" and stop receiving email alerts?`)) return;
    try {
      const res = await fetch(`/api/public/lists/${slug}/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unfollow' }),
      });
      if (res.ok) {
        toast.info(`Unfollowed watch list "${name}"`);
        fetchFollowedLists();
      } else {
        toast.error('Failed to unfollow watch list');
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleUpdateSubAlerts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubList) return;
    setSubmittingSub(true);
    try {
      const posArray = subPosKeys.split(',').map(s => s.trim()).filter(Boolean);
      const negArray = subNegKeys.split(',').map(s => s.trim()).filter(Boolean);

      const res = await fetch(`/api/public/lists/${editingSubList.slug}/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'follow',
          positiveKeywords: posArray,
          negativeKeywords: negArray,
          digestFrequency: subDigestFreq,
        }),
      });

      if (res.ok) {
        toast.success(`Alert settings saved for "${editingSubList.name}"!`);
        setEditingSubList(null);
        fetchFollowedLists();
      } else {
        toast.error('Failed to update alert preferences');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmittingSub(false);
    }
  };

  useEffect(() => {
    fetchDashboardData(page, limit);
  }, [page, limit]);

  // Create Watch List
  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: listName,
          description: listDescription,
          visibility: listVisibility,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(`Watch list '${listName}' created successfully!`);
        setListName('');
        setListDescription('');
        setListVisibility('private');
        setShowCreateModal(false);
        setPage(1);
        fetchDashboardData(1, limit);
      } else {
        toast.error(data.error || 'Failed to create watch list.');
      }
    } catch (e: any) {
      toast.error(e.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  // Edit Watch List
  const handleUpdateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingList) return;
    setSubmitting(true);

    try {
      const res = await fetch(`/api/lists/${editingList.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: listName,
          description: listDescription,
          visibility: listVisibility,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(`Watch list '${listName}' updated!`);
        setEditingList(null);
        setListName('');
        setListDescription('');
        fetchDashboardData(page, limit);
      } else {
        toast.error(data.error || 'Failed to update list.');
      }
    } catch (e: any) {
      toast.error(e.message || 'An error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Watch List
  const handleDeleteList = async (listId: string, nameToDelete: string) => {
    if (!confirm(`Are you sure you want to delete watch list '${nameToDelete}'?`)) return;

    try {
      const res = await fetch(`/api/lists/${listId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(`Watch list '${nameToDelete}' deleted.`);
        setOpenMenuId(null);
        fetchDashboardData(page, limit);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete watch list.');
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Add Career Page
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
          url: pageUrl,
          companyName,
          positiveKeywords: keywords ? keywords.split(',').map(k => k.trim()) : [],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add career page');

      const addedPage = data.careerPage;
      const compName = addedPage?.companyName || companyName || 'Company';

      setPageUrl('');
      setCompanyName('');
      setKeywords('');
      setShowAddPageModal(false);
      fetchDashboardData(page, limit);

      toast.info(`Job sync started for '${compName}'...`);

      if (addedPage?.id) {
        fetch(`/api/career-pages/${addedPage.id}`, { method: 'POST' })
          .then(r => r.json())
          .then(syncJson => {
            if (syncJson.success) {
              const found = syncJson.result?.jobsFound || 0;
              const added = syncJson.result?.jobsAdded || 0;
              if (found > 0) {
                toast.success(`Sync complete for '${compName}': ${pluralize(found, 'job')} found (${added} new)!`);
              } else {
                toast.info(`Sync complete for '${compName}': No open positions detected.`);
              }
              fetchDashboardData(page, limit);
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

  const openEditModal = (listObj: any) => {
    setEditingList(listObj);
    setListName(listObj.name || '');
    setListDescription(listObj.description || '');
    setListVisibility(listObj.visibility || 'private');
    setOpenMenuId(null);
  };

  const handleRespondInvitation = async (collabId: string, action: 'accept' | 'decline') => {
    try {
      const res = await fetch('/api/collaborators/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collabId, action }),
      });
      if (res.ok) {
        toast.success(action === 'accept' ? 'Invitation accepted! You are now a collaborator.' : 'Invitation declined.');
        fetchDashboardData(page, limit);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to respond to invitation.');
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading Dashboard & Watch Lists..." fullPage />;
  }

  const filteredLists = lists.filter(l =>
    l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (l.description && l.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const totalCompanies = lists.reduce((acc, l) => acc + (l.companyCount || 0), 0);
  const totalJobs = lists.reduce((acc, l) => acc + (l.jobCount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Pending Collaborator Invitations Notification Banner */}
      {invitations.length > 0 && (
        <div className="space-y-3">
          {invitations.map(inv => (
            <div key={inv.id} className="p-4 sm:p-5 rounded-2xl bg-blue-600/10 border border-blue-500/30 text-slate-900 dark:text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-start sm:items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-600 text-white shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Collaboration Invitation from <span className="text-blue-600 dark:text-blue-400">{inv.inviterName || inv.inviterEmail || 'A user'}</span>
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    You were invited as an <span className="font-bold uppercase text-blue-600 dark:text-blue-400">{inv.role}</span> to collaborate on watch list <strong className="text-slate-900 dark:text-white">&quot;{inv.listName}&quot;</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleRespondInvitation(inv.id, 'decline')}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer"
                >
                  Decline
                </button>
                <button
                  onClick={() => handleRespondInvitation(inv.id, 'accept')}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all cursor-pointer"
                >
                  Accept Invitation &rarr;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Header Banner with Action Buttons */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            Dashboard &amp; Watch Lists
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Manage your watched company lists, track career pages, and view automated ATS job alerts.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => {
              setListName('');
              setListDescription('');
              setListVisibility('private');
              setShowCreateModal(true);
            }}
            className="text-sm font-semibold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 px-4 py-2.5 rounded-xl shadow-sm flex items-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 text-blue-500" />
            Create Watch List
          </button>

          <button
            onClick={() => setShowAddPageModal(true)}
            className="text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl shadow-md flex items-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Career Page
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="glass-card p-6 rounded-2xl border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Watch Lists</span>
            <Layers className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{stats?.totalLists ?? pagination.total ?? lists.length}</p>
        </div>

        <div className="glass-card p-6 rounded-2xl border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Unique Monitored Companies</span>
            <Briefcase className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{stats?.totalUniqueCompanies ?? totalCompanies}</p>
        </div>

        <div className="glass-card p-6 rounded-2xl border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Active Job Postings</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{stats?.totalActiveJobs ?? totalJobs}</p>
        </div>
      </div>

      {/* Sub-Tab Navigation Bar: Created Watch Lists vs Followed Watch Lists */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveDashboardTab('owned')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
            activeDashboardTab === 'owned'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>My Created Watch Lists ({pagination.total})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDashboardTab('followed')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
            activeDashboardTab === 'followed'
              ? 'bg-purple-600 text-white shadow-md'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Followed Lists &amp; Email Alerts ({followedLists.length})</span>
        </button>
      </div>

      {activeDashboardTab === 'followed' ? (
        /* FOLLOWED WATCH LISTS & EMAIL ALERTS VIEW */
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Bell className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                Followed Watch Lists &amp; Alert Subscriptions ({followedLists.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Quickly manage your followed watch lists, active email digest frequencies, and positive/negative keyword filters.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchFollowedLists}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh Subscriptions
            </button>
          </div>

          {loadingFollowed ? (
            <div className="py-12 text-center">
              <LoadingSpinner message="Loading followed watch lists..." fullPage={false} />
            </div>
          ) : followedLists.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 space-y-4">
              <Bell className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto" />
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">No Followed Watch Lists</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  You are not currently following any watch lists. Explore public watch lists in the directory to subscribe to job alerts.
                </p>
              </div>
              <Link
                href="/discover"
                className="text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-xl cursor-pointer shadow-md inline-flex items-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5" /> Explore Public Directory
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {followedLists.map((fl: any) => (
                <div
                  key={fl.subId}
                  className="glass-card p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between hover:shadow-xl hover:border-purple-500/30 transition-all space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-0.5 rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-300 text-[10px] font-extrabold uppercase border border-purple-500/30">
                        {fl.digestFrequency || 'instant'} digest
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">/{fl.slug}</span>
                    </div>

                    <div>
                      <Link
                        href={`/lists/${fl.slug}`}
                        className="font-extrabold text-slate-900 dark:text-white text-base hover:text-purple-600 dark:hover:text-purple-400 transition-colors line-clamp-1 flex items-center gap-1.5"
                      >
                        {fl.name} <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                      </Link>
                      {fl.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">{fl.description}</p>
                      )}
                    </div>

                    {/* Curator Info & Company Count */}
                    <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                      <span>Curated by: <strong className="text-slate-800 dark:text-slate-200">{fl.curator.name}</strong></span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold text-[10px] text-slate-600 dark:text-slate-400">{pluralize(fl.companyCount || 0, 'Company', 'Companies')}</span>
                    </div>

                    {/* Keywords Summary */}
                    {(fl.positiveKeywords.length > 0 || fl.negativeKeywords.length > 0) && (
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1">
                        {fl.positiveKeywords.length > 0 && (
                          <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <span className="font-bold">Match:</span>
                            <span className="truncate">{fl.positiveKeywords.join(', ')}</span>
                          </div>
                        )}
                        {fl.negativeKeywords.length > 0 && (
                          <div className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                            <span className="font-bold">Exclude:</span>
                            <span className="truncate">{fl.negativeKeywords.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSubList(fl);
                        setSubDigestFreq(fl.digestFrequency || 'instant');
                        setSubPosKeys((fl.positiveKeywords || []).join(', '));
                        setSubNegKeys((fl.negativeKeywords || []).join(', '));
                      }}
                      className="px-3 py-1.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sliders className="w-3.5 h-3.5" /> Alert Settings
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUnfollowSub(fl.slug, fl.name)}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      Unfollow
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* OWNED WATCH LISTS VIEW */
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Your Watch Lists ({pagination.total})
              </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Select a view layout below to organize your watch lists.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* 3-TYPE VIEW SWITCHER: Grid, Tiles, List */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-900/90 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => handleViewChange('grid')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Grid View (Rich Cards)"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Grid</span>
              </button>

              <button
                type="button"
                onClick={() => handleViewChange('tiles')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'tiles'
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Tiles View (Compact Cards)"
              >
                <Grid2X2 className="w-3.5 h-3.5" />
                <span>Tiles</span>
              </button>

              <button
                type="button"
                onClick={() => handleViewChange('list')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="List View (Data Table)"
              >
                <List className="w-3.5 h-3.5" />
                <span>Table List</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search watch lists..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
              />
            </div>

            {/* Items Per Page */}
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
              <option value={50}>50 per page</option>
            </select>
          </div>
        </div>

        {/* Empty State */}
        {filteredLists.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 space-y-4">
            <Briefcase className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto" />
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">No Watch Lists Found</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {searchQuery ? 'No watch lists match your search terms.' : 'Create your first watch list to start monitoring career pages.'}
              </p>
            </div>
            <button
              onClick={() => {
                setListName('');
                setListDescription('');
                setListVisibility('private');
                setShowCreateModal(true);
              }}
              className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl cursor-pointer shadow-md inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Create Watch List
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* VIEW 1: GRID VIEW & VIEW 2: TILES VIEW */}
            {viewMode !== 'list' ? (
              <div className={viewMode === 'tiles' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'}>
                {filteredLists.map(l => (
                  <div
                    key={l.id}
                    className={`glass-card border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between hover:shadow-xl hover:border-blue-500/30 transition-all duration-300 group relative ${
                      viewMode === 'tiles' ? 'p-4 rounded-2xl space-y-3' : 'p-6 rounded-3xl space-y-4'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1.5 ${
                            l.visibility === 'public'
                              ? 'bg-blue-500/8 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                          }`}>
                            {l.visibility === 'public' ? <Globe className="w-3.5 h-3.5 text-blue-500" /> : <Lock className="w-3.5 h-3.5 text-slate-400" />}
                            {l.visibility === 'public' ? 'Public' : 'Private'}
                          </span>

                          {l.isCollaborator && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                              <Users className="w-3.5 h-3.5 text-purple-500" /> Collaborator
                            </span>
                          )}
                        </div>

                        {/* Three Dots Menu Dropdown */}
                        <div className="relative">
                          <button
                            onClick={() => setOpenMenuId(openMenuId === l.id ? null : l.id)}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-all cursor-pointer"
                            title="Options"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

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
                        <Link
                          href={l.visibility === 'public' ? `/lists/${l.slug}` : `/dashboard/lists/${l.id}`}
                          className="hover:underline decoration-blue-500/50 block"
                        >
                          <h3 className={`font-bold text-slate-900 dark:text-white tracking-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors ${viewMode === 'tiles' ? 'text-base leading-snug' : 'text-xl'}`}>
                            {l.name}
                          </h3>
                        </Link>
                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                          {l.description || 'No description provided.'}
                        </p>
                      </div>

                      {/* Stats Badges Bar */}
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 px-2 py-0.5 rounded-md">
                          <Building className="w-3.5 h-3.5 text-slate-500" />
                          {pluralize(l.companyCount || 0, 'Page')}
                        </span>

                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-500/8 border border-blue-500/20 px-2 py-0.5 rounded-md">
                          <Briefcase className="w-3.5 h-3.5 text-blue-500" />
                          {pluralize(l.jobCount || 0, 'Job')}
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
              /* VIEW 3: TABLE LIST VIEW */
              <div className="glass-panel rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                      <tr>
                        <th className="py-3.5 px-5">Watch List Name &amp; Details</th>
                        <th className="py-3.5 px-4">Visibility</th>
                        <th className="py-3.5 px-4">Pages &amp; Jobs</th>
                        <th className="py-3.5 px-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                      {filteredLists.map(l => (
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
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium ${
                                l.visibility === 'public'
                                  ? 'bg-blue-500/8 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                              }`}>
                                {l.visibility === 'public' ? <Globe className="w-3.5 h-3.5 text-blue-500" /> : <Lock className="w-3.5 h-3.5 text-slate-400" />}
                                {l.visibility === 'public' ? 'Public' : 'Private'}
                              </span>

                              {l.isCollaborator && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                  <Users className="w-3.5 h-3.5 text-purple-500" /> Collaborator
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                                {pluralize(l.companyCount || 0, 'Page')}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-blue-500/8 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[11px] font-medium">
                                {pluralize(l.jobCount || 0, 'Job')}
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
                                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                title="Edit List"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteList(l.id, l.name)}
                                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-500/20 transition-colors cursor-pointer"
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
          </div>
        )}

        {/* Server Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
            <span className="text-xs text-slate-500">
              Page <span className="font-bold text-slate-900 dark:text-white">{pagination.page}</span> of <span className="font-bold text-slate-900 dark:text-white">{pagination.totalPages}</span> ({pluralize(pagination.total, 'watch list', 'watch lists')} total)
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Previous
              </button>

              <button
                onClick={() => setPage(prev => Math.min(pagination.totalPages, prev + 1))}
                disabled={page >= pagination.totalPages}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* CREATE / EDIT WATCH LIST MODAL */}
      {(showCreateModal || editingList) && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                {editingList ? 'Edit Watch List' : 'Create New Watch List'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingList(null);
                }}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={editingList ? handleUpdateList : handleCreateList} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Watch List Name *
                </label>
                <input
                  ref={createListInputRef}
                  autoFocus
                  type="text"
                  required
                  value={listName}
                  onChange={e => setListName(e.target.value)}
                  placeholder="e.g. AI & ML Tech Companies"
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Description (Optional)
                </label>
                <textarea
                  rows={3}
                  value={listDescription}
                  onChange={e => setListDescription(e.target.value)}
                  placeholder="Short summary of companies in this list..."
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Visibility
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setListVisibility('private')}
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      listVisibility === 'private'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" /> Private
                  </button>

                  <button
                    type="button"
                    onClick={() => setListVisibility('public')}
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      listVisibility === 'public'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" /> Public
                  </button>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingList(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md cursor-pointer transition-all disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingList ? 'Save Changes' : 'Create List'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ADD CAREER PAGE MODAL */}
      {showAddPageModal && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Add Monitored Career Page
              </h3>
              <button
                type="button"
                onClick={() => setShowAddPageModal(false)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAddCareerPage} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Career Page URL *
                </label>
                <input
                  ref={addPageInputRef}
                  autoFocus
                  type="url"
                  required
                  value={pageUrl}
                  onChange={e => setPageUrl(e.target.value)}
                  placeholder="https://company.com/careers"
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-mono focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Company Name (Optional)
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="e.g. Stripe"
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Attach to Watch List *
                </label>
                <select
                  value={selectedListId}
                  onChange={e => setSelectedListId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  {lists.map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({pluralize(l.companyCount || 0, 'company', 'companies')})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Alert Keywords (Optional comma-separated)
                </label>
                <input
                  type="text"
                  value={keywords}
                  onChange={e => setKeywords(e.target.value)}
                  placeholder="e.g. Engineer, Frontend, Remote"
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddPageModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md cursor-pointer transition-all disabled:opacity-50"
                >
                  {submitting ? 'Adding Page...' : 'Add Career Page'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* EDIT FOLLOWED LIST ALERT SETTINGS MODAL */}
      {editingSubList && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  Alert Preferences &amp; Keywords
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Configure alerts for <strong>{editingSubList.name}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingSubList(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateSubAlerts} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Digest Frequency
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['instant', 'daily', 'weekly'] as const).map((freq) => (
                    <button
                      key={freq}
                      type="button"
                      onClick={() => setSubDigestFreq(freq)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-extrabold capitalize cursor-pointer border transition-all ${
                        subDigestFreq === freq
                          ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {freq}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Must-Match Keywords (Optional)
                </label>
                <p className="text-[11px] text-slate-500 mb-1.5">Comma separated. Only send alerts if job title matches at least one keyword.</p>
                <input
                  type="text"
                  value={subPosKeys}
                  onChange={(e) => setSubPosKeys(e.target.value)}
                  placeholder="e.g. Frontend, React, Senior, Remote"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Exclude Keywords (Optional)
                </label>
                <p className="text-[11px] text-slate-500 mb-1.5">Comma separated. Ignore jobs containing any of these keywords.</p>
                <input
                  type="text"
                  value={subNegKeys}
                  onChange={(e) => setSubNegKeys(e.target.value)}
                  placeholder="e.g. Intern, Junior, Contract"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-purple-600"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const slug = editingSubList.slug;
                    const name = editingSubList.name;
                    setEditingSubList(null);
                    handleUnfollowSub(slug, name);
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20 hover:bg-rose-500/20 cursor-pointer"
                >
                  Unfollow List
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingSubList(null)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={submittingSub}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {submittingSub ? 'Saving...' : 'Save Preferences'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
