'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Globe, Lock, Plus, ExternalLink, RefreshCw, CheckCircle, AlertTriangle, Briefcase, Zap, Trash2, MoreVertical, Edit3, Search, LayoutGrid, Grid2X2, List, PauseCircle, CheckSquare, Square, LogOut, Sliders, PlusCircle, UserPlus, Share2, Check, Crown, Users, XCircle, Bell, Filter, X } from 'lucide-react';
import { useToast } from '@/components/Toast';
import LoadingSpinner from '@/components/LoadingSpinner';
import { JobCard } from '@/components/JobCard';
import { Badge } from '@/components/Badge';
import { PublicUserProfileModal } from '@/components/PublicUserProfileModal';
import { getCompanyColorTheme, getCompanyLogoUrl } from '@/lib/utils/companyBranding';
import { pluralize } from '@/lib/utils/pluralize';

export default function ListDetailPage() {
  const toast = useToast();
  const params = useParams();
  const router = useRouter();
  const listId = params.listId as string;

  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Selection state for Monitored Pages batch actions
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [syncingBatch, setSyncingBatch] = useState(false);

  // View Mode State (Grid, Tiles, Table)
  const [pageViewMode, setPageViewMode] = useState<'grid' | 'tiles' | 'table'>('grid');

  useEffect(() => {
    const saved = localStorage.getItem('jobpingly_list_detail_view');
    if (saved === 'grid' || saved === 'tiles' || saved === 'table') {
      setPageViewMode(saved);
    }
  }, []);

  const handlePageViewChange = (mode: 'grid' | 'tiles' | 'table') => {
    setPageViewMode(mode);
    localStorage.setItem('jobpingly_list_detail_view', mode);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

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

  // Share & Modal states
  const [copied, setCopied] = useState(false);

  // Contributions / Suggestions
  const [contributions, setContributions] = useState<any[]>([]);
  const [showContributionsModal, setShowContributionsModal] = useState(false);

  // Collaborators
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [showCollaboratorsModal, setShowCollaboratorsModal] = useState(false);
  const [collabEmail, setCollabEmail] = useState('');
  const [collabSubmitting, setCollabSubmitting] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  const fetchCollaborators = async () => {
    try {
      const res = await fetch(`/api/lists/${listId}/collaborators`);
      if (res.ok) {
        const json = await res.json();
        setCollaborators(json.collaborators || []);
      }
    } catch (e) {}
  };

  const fetchContributions = async () => {
    try {
      const res = await fetch(`/api/lists/${listId}/contributions`);
      if (res.ok) {
        const json = await res.json();
        setContributions(json.contributions || []);
      }
    } catch (e) {}
  };

  // Alert & Follow Subscriptions state
  const [following, setFollowing] = useState(false);
  const [showFollowModal, setShowFollowModal] = useState(false);
  const [positiveKeywordsInput, setPositiveKeywordsInput] = useState('');
  const [negativeKeywordsInput, setNegativeKeywordsInput] = useState('');
  const [digestFrequency, setDigestFrequency] = useState<'instant' | 'daily' | 'weekly'>('instant');
  const [followSubmitting, setFollowSubmitting] = useState(false);

  const fetchFollowStatus = async (slug: string) => {
    try {
      const res = await fetch(`/api/public/lists/${slug}/follow`);
      if (res.ok) {
        const json = await res.json();
        setFollowing(json.following);
        if (json.subscription) {
          setPositiveKeywordsInput((json.subscription.positiveKeywords || []).join(', '));
          setNegativeKeywordsInput((json.subscription.negativeKeywords || []).join(', '));
          setDigestFrequency(json.subscription.digestFrequency || 'instant');
        }
      }
    } catch (e) {}
  };

  const handleFollowSubmit = async (e: React.FormEvent, unfollow = false) => {
    e.preventDefault();
    if (!data?.list?.slug) return;
    setFollowSubmitting(true);
    try {
      const posArray = positiveKeywordsInput.split(',').map(s => s.trim()).filter(Boolean);
      const negArray = negativeKeywordsInput.split(',').map(s => s.trim()).filter(Boolean);

      const res = await fetch(`/api/public/lists/${data.list.slug}/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: unfollow ? 'unfollow' : 'follow',
          positiveKeywords: posArray,
          negativeKeywords: negArray,
          digestFrequency,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update alert settings');

      setFollowing(json.following);
      setShowFollowModal(false);
      toast.success(unfollow ? 'Unsubscribed from email alerts' : 'Email alert preferences saved!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update alert preferences');
    } finally {
      setFollowSubmitting(false);
    }
  };

  const loadDetail = async () => {
    try {
      const [res, meRes, collabRes, contribRes] = await Promise.all([
        fetch(`/api/lists/${listId}`),
        fetch('/api/me'),
        fetch(`/api/lists/${listId}/collaborators`),
        fetch(`/api/lists/${listId}/contributions`),
      ]);

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load list');
      setData(json);

      if (json.list?.slug) {
        fetchFollowStatus(json.list.slug);
      }

      if (meRes.ok) {
        const meJson = await meRes.json();
        setCurrentUser(meJson.user);
      }

      if (collabRes.ok) {
        const collabJson = await collabRes.json();
        setCollaborators(collabJson.collaborators || []);
      }

      if (contribRes.ok) {
        const contribJson = await contribRes.json();
        setContributions(contribJson.contributions || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (listId) loadDetail();
  }, [listId]);

  const handleAddCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collabEmail.trim()) return;
    setCollabSubmitting(true);
    try {
      const res = await fetch(`/api/lists/${listId}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: collabEmail, role: 'editor' }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(`Collaborator invitation sent to ${collabEmail}!`);
        setCollabEmail('');
        fetchCollaborators();
      } else {
        toast.error(json.error || 'Failed to add collaborator');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCollabSubmitting(false);
    }
  };

  const handleRemoveCollaborator = async (targetUserId: string) => {
    if (!confirm('Remove this collaborator from the watch list?')) return;
    try {
      const res = await fetch(`/api/lists/${listId}/collaborators?userId=${targetUserId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.info('Collaborator removed');
        fetchCollaborators();
      } else {
        const json = await res.json();
        toast.error(json.error || 'Failed to remove collaborator');
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleReviewContribution = async (contribId: string, action: 'approve' | 'reject') => {
    try {
      const res = await fetch(`/api/lists/${listId}/contributions/${contribId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(action === 'approve' ? 'Suggestion approved and company added!' : 'Suggestion rejected');
        fetchContributions();
        loadDetail();
      } else {
        toast.error(json.error || 'Failed to review contribution');
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleShareList = () => {
    const url = `${window.location.origin}/lists/${list?.slug || listId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Public watch list link copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

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
    toast.info(`Syncing all ${pluralize(pages.length, 'monitored page')}...`);

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

      toast.success(`Sync finished! Found ${pluralize(totalFound, 'job')} (${totalAdded} new added).`);
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
                toast.success(`Sync complete for '${compName}': ${pluralize(found, 'job')} found (${added} new)!`);
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

  const handleTogglePauseCompany = async (careerPageId: string, newPausedState: boolean, companyName: string) => {
    setOpenMenuId(null);
    try {
      const res = await fetch(`/api/lists/${listId}/career-pages`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ careerPageId, isPaused: newPausedState }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.info(json.message || (newPausedState ? `Paused monitoring for '${companyName}' on this list` : `Resumed monitoring for '${companyName}' on this list`));
        loadDetail();
      } else {
        toast.error(json.error || 'Failed to update company monitoring status');
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleToggleSelectPage = (pageId: string) => {
    setSelectedPageIds(prev =>
      prev.includes(pageId) ? prev.filter(id => id !== pageId) : [...prev, pageId]
    );
  };

  const handleOpenBatchUrls = () => {
    if (!data?.pages || selectedPageIds.length === 0) return;
    const selectedPages = data.pages.filter((p: any) => selectedPageIds.includes(p.id));

    let openedCount = 0;
    selectedPages.forEach((p: any, idx: number) => {
      if (p.url) {
        setTimeout(() => {
          const win = window.open(p.url, '_blank', 'noopener,noreferrer');
          if (win) win.focus();
        }, idx * 120);
        openedCount++;
      }
    });

    toast.success(`Opening ${pluralize(openedCount, 'career page link')} in new tabs!`);
  };

  const handleSyncBatch = async () => {
    if (selectedPageIds.length === 0) return;
    setSyncingBatch(true);
    toast.info(`Syncing ${pluralize(selectedPageIds.length, 'selected company page')}...`);

    try {
      await Promise.all(
        selectedPageIds.map(id => fetch(`/api/career-pages/${id}`, { method: 'POST' }).catch(() => null))
      );
      toast.success(`Batch sync complete for ${pluralize(selectedPageIds.length, 'company page')}!`);
      loadDetail();
    } catch (e: any) {
      toast.error(e.message || 'Batch sync failed');
    } finally {
      setSyncingBatch(false);
    }
  };

  const handleDeleteBatch = async () => {
    if (selectedPageIds.length === 0) return;
    if (!confirm(`Remove ${pluralize(selectedPageIds.length, 'selected company page')} from this list?`)) return;

    try {
      await Promise.all(
        selectedPageIds.map(id =>
          fetch(`/api/lists/${listId}/career-pages?careerPageId=${id}`, { method: 'DELETE' }).catch(() => null)
        )
      );
      toast.success(`Removed ${pluralize(selectedPageIds.length, 'company page')}!`);
      setSelectedPageIds([]);
      loadDetail();
    } catch (e: any) {
      toast.error(e.message || 'Failed to remove selected pages');
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

  const handleLeaveWatchList = async () => {
    if (!confirm(`Are you sure you want to leave collaboration on '${list.name}'?`)) return;
    try {
      const res = await fetch(`/api/lists/${listId}/collaborators`, { method: 'DELETE' });
      const json = await res.json();
      if (res.ok) {
        toast.info(json.message || `You have left '${list.name}'`);
        router.push('/dashboard');
      } else {
        toast.error(json.error || 'Failed to leave list');
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const isOwner = currentUser && list && currentUser.id === list.userId;

  const pendingContribs = (contributions || []).filter((c: any) => c.status === 'pending');

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-1">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard &amp; Watch Lists
      </Link>

      {/* Unified Watch List Header Panel */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/60 dark:border-slate-800/60">
          {/* Badges Inline Row */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={handleVisibilityToggle}
              className={`text-xs font-bold uppercase px-3 py-1 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                list.visibility === 'public'
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-300 dark:hover:bg-slate-700'
              }`}
              title="Click to toggle Public / Private visibility"
            >
              {list.visibility === 'public' ? <Globe className="w-3.5 h-3.5 text-emerald-500" /> : <Lock className="w-3.5 h-3.5 text-slate-400" />}
              {list.visibility === 'public' ? 'Public Watchlist' : 'Private Watchlist'}
            </button>

            {isOwner ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/8 text-amber-700 dark:text-amber-300 border border-amber-500/20 text-xs font-medium tracking-tight">
                <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" /> Your Watchlist (Owner)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-500/8 text-purple-600 dark:text-purple-400 border border-purple-500/20 text-xs font-medium tracking-tight">
                <Users className="w-3.5 h-3.5 text-purple-500 shrink-0" /> Collaborator
              </span>
            )}
            {list.isCanonical !== false && <Badge variant="canonical">Verified List</Badge>}
            {list.followerCount > 0 && <Badge variant="follower" count={list.followerCount} />}
          </div>

          {/* Action Controls Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowFollowModal(true)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
                following
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              {following ? 'Alerts Active' : 'Follow & Get Email Alerts'}
            </button>
            <button
              type="button"
              onClick={() => setShowContributionsModal(true)}
              className="px-3.5 py-1.5 rounded-xl border border-amber-500/30 text-amber-700 dark:text-amber-300 bg-amber-500/5 hover:bg-amber-500/15 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <PlusCircle className="w-3.5 h-3.5 text-amber-500" />
              Suggestions {pendingContribs.length > 0 && `(${pendingContribs.length})`}
            </button>

            <button
              type="button"
              onClick={() => setShowCollaboratorsModal(true)}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <UserPlus className="w-3.5 h-3.5 text-purple-500" />
              Collaborators {collaborators.length > 0 && `(${collaborators.length})`}
            </button>

            <button
              type="button"
              onClick={handleShareList}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Share Watch List Link"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
            </button>

            {!isOwner && (
              <button
                onClick={handleLeaveWatchList}
                className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
                title="Leave collaboration on this watch list"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-500" /> Leave
              </button>
            )}
          </div>
        </div>

        {/* Title, Description & Curator Details */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{list.name}</h1>

            <button
              onClick={() => setShowAdd(true)}
              className="text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl shadow-md flex items-center gap-2 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" /> Add Company Page
            </button>
          </div>

          {list.description && list.description.trim() ? (
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl leading-relaxed">{list.description.trim()}</p>
          ) : null}

          <div className="flex items-center gap-2 pt-1 text-xs text-slate-500 dark:text-slate-400">
            <span>Curated by:</span>
            <button
              type="button"
              onClick={() => list.userId && setSelectedUserId(list.userId)}
              className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 group/user transition-colors cursor-pointer text-left"
            >
              {list.userAvatarUrl ? (
                <img
                  src={list.userAvatarUrl}
                  alt={list.userName || 'User'}
                  className="w-5 h-5 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[9px] flex items-center justify-center shrink-0 shadow-sm">
                  {(list.userName?.[0] || 'U').toUpperCase()}
                </div>
              )}
              <span className="underline-offset-2 group-hover/user:underline">{list.userName || 'User'}</span>
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

          {/* Batch Selection Action Bar */}
          {selectedPageIds.length > 0 && (
            <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-300 flex items-center justify-between gap-2 text-xs font-bold animate-in fade-in duration-150 shadow-sm">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedPageIds.length === filteredPages.length) {
                      setSelectedPageIds([]);
                    } else {
                      setSelectedPageIds(filteredPages.map((p: any) => p.id));
                    }
                  }}
                  className="text-slate-400 hover:text-blue-600 cursor-pointer"
                  title="Select / Deselect All"
                >
                  {selectedPageIds.length === filteredPages.length ? (
                    <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
                <span>{selectedPageIds.length} selected</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={handleSyncBatch}
                  disabled={syncingBatch}
                  title="Sync selected company pages"
                  className="px-2.5 py-1 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-sm flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${syncingBatch ? 'animate-spin' : ''}`} />
                  Sync ({selectedPageIds.length})
                </button>

                <button
                  onClick={handleOpenBatchUrls}
                  title="Open selected company links in new tabs"
                  className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-blue-500/30 text-blue-600 dark:text-blue-400 font-bold hover:bg-blue-50 dark:hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
                >
                  <ExternalLink className="w-3 h-3" />
                  Open Links
                </button>

                <button
                  onClick={handleDeleteBatch}
                  title="Remove selected companies"
                  className="px-2 py-1 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {filteredPages.length === 0 ? (
            <div className="glass-panel p-6 rounded-2xl text-center border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
              {searchQuery ? `No companies match "${searchQuery}"` : 'No career pages added to this list yet. Click "+ Add Company Page".'}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPages.map((p: any) => {
                const colorTheme = getCompanyColorTheme(p.companyName || 'Company');
                const logoUrl = getCompanyLogoUrl(p.url);
                const isSelected = selectedPageIds.includes(p.id);
                const hasAnySelected = selectedPageIds.length > 0;

                return (
                  <div
                    key={p.id}
                    className={`glass-card p-4 rounded-xl border text-xs transition-all border-l-4 group relative ${colorTheme.border} ${
                      isSelected
                        ? 'ring-2 ring-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                        : openMenuId === p.id
                        ? 'z-50'
                        : 'z-0'
                    }`}
                    style={{ backgroundColor: isSelected ? undefined : colorTheme.bgLight }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-sm">
                        {logoUrl ? (
                          <img src={logoUrl} alt={p.companyName || 'Company'} className="w-5 h-5 rounded object-contain bg-white p-0.5 border border-slate-200 dark:border-slate-700 shrink-0" />
                        ) : (
                          <div className={`w-5 h-5 rounded flex items-center justify-center font-extrabold text-[10px] ${colorTheme.bg} ${colorTheme.text} shrink-0`}>
                            {(p.companyName?.[0] || 'C').toUpperCase()}
                          </div>
                        )}
                        <span>{p.companyName || 'Company'}</span>
                        {p.isPaused && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                            <PauseCircle className="w-3 h-3 text-amber-500" /> Paused
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {/* Hover/Persistent Selection Checkbox */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSelectPage(p.id);
                          }}
                          className={`p-1 rounded-md transition-all cursor-pointer ${
                            isSelected
                              ? 'text-blue-600 dark:text-blue-400 opacity-100'
                              : hasAnySelected
                              ? 'text-slate-400 hover:text-blue-600 opacity-100'
                              : 'text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100'
                          }`}
                          title={isSelected ? 'Deselect company' : 'Select company'}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
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
                            className="absolute right-0 top-6 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-[100] py-1 space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
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
                              onClick={() => handleTogglePauseCompany(p.id, !p.isPaused, p.companyName || 'Company')}
                              className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              {p.isPaused ? (
                                <>
                                  <Zap className="w-3.5 h-3.5 text-emerald-500" />
                                  Resume Monitoring
                                </>
                              ) : (
                                <>
                                  <PauseCircle className="w-3.5 h-3.5 text-amber-500" />
                                  Pause on this List
                                </>
                              )}
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

                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detected Jobs Feed */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Active Open Positions ({filteredJobs.length})
            </h2>

            <div className="flex items-center gap-3 flex-wrap">
              {/* 3-Type View Switcher (Grid, Tiles, Table List) */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-900/90 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => handlePageViewChange('grid')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                    pageViewMode === 'grid'
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Grid Card View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Grid</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePageViewChange('tiles')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                    pageViewMode === 'tiles'
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Tiles View (2 Columns)"
                >
                  <Grid2X2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Tiles</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePageViewChange('table')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                    pageViewMode === 'table'
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Table List View"
                >
                  <List className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Table List</span>
                </button>
              </div>

              {/* Instant Search Bar (0 DB/Server Calls) */}
              <div className="relative w-full sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search title, company..."
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
          </div>

          {filteredJobs.length === 0 ? (
            <div className="glass-panel p-10 rounded-2xl text-center border-slate-200 dark:border-slate-800 space-y-2">
              <Briefcase className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto mb-2" />
              {searchQuery ? (
                <>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">No jobs match &quot;{searchQuery}&quot;</p>
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
          ) : pageViewMode === 'grid' ? (
            <div className="space-y-3">
              {filteredJobs.map((j: any) => (
                <JobCard key={j.id} job={j} />
              ))}
            </div>
          ) : pageViewMode === 'tiles' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredJobs.map((j: any) => (
                <JobCard key={j.id} job={j} />
              ))}
            </div>
          ) : (
            /* Table List View */
            <div className="glass-panel rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                    <tr>
                      <th className="py-3 px-4">Job Title &amp; Company</th>
                      <th className="py-3 px-4">Department &amp; Level</th>
                      <th className="py-3 px-4">Location &amp; Type</th>
                      <th className="py-3 px-4 text-right">Apply Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                    {filteredJobs.map((j: any) => (
                      <tr key={j.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors">
                        <td className="py-3.5 px-4">
                          <span className="font-extrabold text-sm text-slate-900 dark:text-white block">{j.title}</span>
                          <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-0.5 block">{j.companyName || j.rawData?.company || 'Company'}</span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="text-slate-700 dark:text-slate-300 font-medium block">{j.department || j.rawData?.department || 'General'}</span>
                          {j.rawData?.experience && (
                            <span className="text-[11px] text-slate-500 block">{j.rawData.experience}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="text-slate-700 dark:text-slate-300 font-medium block">{j.location || 'Remote / Unspecified'}</span>
                          <span className="text-[11px] text-slate-500 block">{j.jobType || j.rawData?.employmentType || 'Full-time'}</span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {j.url ? (
                            <a
                              href={j.url}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold inline-flex items-center gap-1.5 shadow-sm transition-all text-xs"
                            >
                              Apply <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          ) : (
                            <span className="text-slate-400 text-xs font-semibold">No direct link</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Page Modal */}
      {showAdd && mounted && createPortal(
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
        </div>,
        document.body
      )}

      {/* Edit Company Details Modal */}
      {editingCompany && mounted && createPortal(
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
        </div>,
        document.body
      )}

      {/* Community Suggestions / Contributions Modal */}
      {showContributionsModal && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel max-w-lg w-full p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4 bg-white dark:bg-slate-900 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-amber-500" />
              Community Suggestions ({pendingContribs.length})
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Approve suggestions to add them to this watch list.
            </p>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {pendingContribs.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
                  <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto" />
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">All suggestions reviewed!</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">There are currently no pending community suggestions for this watchlist.</p>
                </div>
              ) : (
                pendingContribs.map((c: any) => (
                  <div key={c.id} className="glass-card p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5 max-w-xs">
                      <span className="font-bold text-slate-900 dark:text-white block">{c.companyName || 'Suggested Company'}</span>
                      <span className="text-[11px] font-mono text-blue-500 block truncate">{c.url}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleReviewContribution(c.id, 'approve')}
                        className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 font-bold flex items-center gap-1 cursor-pointer"
                        title="Approve & Add"
                      >
                        <CheckCircle className="w-4 h-4" /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReviewContribution(c.id, 'reject')}
                        className="p-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 font-bold flex items-center gap-1 cursor-pointer"
                        title="Reject"
                      >
                        <XCircle className="w-4 h-4" /> Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowContributionsModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Collaborators Modal */}
      {showCollaboratorsModal && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4 bg-white dark:bg-slate-900 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-purple-500" />
              List Collaborators
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Invite registered users to co-curate and manage <strong>{list.name}</strong>.
            </p>

            {isOwner && (
              <form onSubmit={handleAddCollaborator} className="flex gap-2">
                <input
                  type="email"
                  required
                  value={collabEmail}
                  onChange={e => setCollabEmail(e.target.value)}
                  placeholder="collaborator@example.com"
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:border-purple-500"
                />
                <button
                  type="submit"
                  disabled={collabSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-md cursor-pointer disabled:opacity-50"
                >
                  {collabSubmitting ? 'Inviting...' : 'Invite'}
                </button>
              </form>
            )}

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1 pt-1">
              {collaborators.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">No collaborators added yet.</p>
              ) : (
                collaborators.map((col: any) => (
                  <div key={col.id} className="flex items-center justify-between p-3 rounded-xl glass-card border border-slate-200 dark:border-slate-800 text-xs">
                    <div>
                      <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                        <span>{col.name || 'User'}</span>
                        {col.status === 'pending' && (
                          <span className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                            Pending Invite
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500 block">{col.email}</span>
                    </div>

                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCollaborator(col.userId)}
                        className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Remove collaborator"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowCollaboratorsModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Follow & Alert Preferences Modal */}
      {mounted && showFollowModal && data?.list && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  Email Digest &amp; Alert Settings
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Configure job alert preferences for <strong>{data.list.name}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowFollowModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFollowSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Digest Frequency
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['instant', 'daily', 'weekly'] as const).map((freq) => (
                    <button
                      key={freq}
                      type="button"
                      onClick={() => setDigestFrequency(freq)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-extrabold capitalize cursor-pointer border transition-all ${
                        digestFrequency === freq
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
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
                <p className="text-[11px] text-slate-500 mb-1.5">Comma separated. Only send alerts if job title contains at least one keyword.</p>
                <input
                  type="text"
                  value={positiveKeywordsInput}
                  onChange={(e) => setPositiveKeywordsInput(e.target.value)}
                  placeholder="e.g. Frontend, React, Senior, Remote"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Exclude Keywords (Optional)
                </label>
                <p className="text-[11px] text-slate-500 mb-1.5">Comma separated. Ignore jobs containing any of these keywords.</p>
                <input
                  type="text"
                  value={negativeKeywordsInput}
                  onChange={(e) => setNegativeKeywordsInput(e.target.value)}
                  placeholder="e.g. Intern, Junior, Contract"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                {following ? (
                  <button
                    type="button"
                    onClick={(e) => handleFollowSubmit(e, true)}
                    disabled={followSubmitting}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20 hover:bg-rose-500/20 cursor-pointer disabled:opacity-50"
                  >
                    Unfollow &amp; Stop Alerts
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowFollowModal(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={followSubmitting}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {followSubmitting ? 'Saving...' : following ? 'Save Alert Settings' : 'Subscribe to Email Alerts'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      <PublicUserProfileModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
    </div>
  );
}
