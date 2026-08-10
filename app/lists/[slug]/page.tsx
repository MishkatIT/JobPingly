'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Globe, ArrowLeft, ExternalLink, Briefcase, ShieldAlert, Building, Share2, Check, Search, Bell, GitFork, PlusCircle, CheckCircle, XCircle, Users, Crown, Sliders, UserPlus, Trash2, Shield, Ban, LayoutGrid, Grid2X2, List, Plus, PauseCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import LoadingSpinner from '@/components/LoadingSpinner';
import { JobCard } from '@/components/JobCard';
import { Footer } from '@/components/Footer';
import { PublicUserProfileModal } from '@/components/PublicUserProfileModal';
import { Badge } from '@/components/Badge';
import { useToast } from '@/components/Toast';
import { getCompanyColorTheme, getCompanyLogoUrl } from '@/lib/utils/companyBranding';
import { pluralize } from '@/lib/utils/pluralize';

export default function PublicListPageView() {
  const toast = useToast();
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Job Feed View Mode & Pagination State
  const [jobViewMode, setJobViewMode] = useState<'grid' | 'tiles' | 'table'>('grid');
  const [jobPage, setJobPage] = useState(1);
  const [jobLimit, setJobLimit] = useState(10);

  useEffect(() => {
    const saved = localStorage.getItem('jobpingly_job_view');
    if (saved === 'grid' || saved === 'tiles' || saved === 'table') {
      setJobViewMode(saved);
    }
  }, []);

  const handleJobViewChange = (mode: 'grid' | 'tiles' | 'table') => {
    setJobViewMode(mode);
    localStorage.setItem('jobpingly_job_view', mode);
  };

  // Auth Guard Modal
  const [showAuthRequiredModal, setShowAuthRequiredModal] = useState(false);

  // Follow State & Dialog
  const [following, setFollowing] = useState(false);
  const [showFollowModal, setShowFollowModal] = useState(false);
  const [positiveKeywordsInput, setPositiveKeywordsInput] = useState('');
  const [negativeKeywordsInput, setNegativeKeywordsInput] = useState('');
  const [digestFrequency, setDigestFrequency] = useState('instant');
  const [followSubmitting, setFollowSubmitting] = useState(false);

  // Suggest Company Dialog
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [suggestUrl, setSuggestUrl] = useState('');
  const [suggestCompany, setSuggestCompany] = useState('');
  const [suggestSubmitting, setSuggestSubmitting] = useState(false);
  const [suggestSuccess, setSuggestSuccess] = useState('');

  // Fork State
  const [forking, setForking] = useState(false);

  // Contributions Review (For Maintainers)
  const [contributions, setContributions] = useState<any[]>([]);
  const [showContributionsModal, setShowContributionsModal] = useState(false);

  // Collaborators Management
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [showCollaboratorsModal, setShowCollaboratorsModal] = useState(false);
  const [collabEmail, setCollabEmail] = useState('');
  const [collabSubmitting, setCollabSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/me')
      .then(res => res.ok ? res.json() : null)
      .then(d => { if (d?.user) setUser(d.user); })
      .catch(() => setUser(null));

    if (!slug) return;
    fetch(`/api/public/lists/${slug}`)
      .then(async res => {
        const text = await res.text();
        let json: any = {};
        try {
          json = JSON.parse(text);
        } catch {
          if (!res.ok) {
            throw new Error(res.status === 403 ? 'Public watch lists are currently disabled by administrator.' : 'Failed to connect to server.');
          }
        }
        if (!res.ok) {
          throw new Error(json.error || 'Public watch lists are currently disabled by administrator.');
        }
        return json;
      })
      .then(json => {
        setData(json);
        setLoading(false);
        // Check user follow status
        fetch(`/api/public/lists/${slug}/follow`)
          .then(res => res.json())
          .then(fJson => {
            if (fJson.following) {
              setFollowing(true);
              if (fJson.subscription) {
                setPositiveKeywordsInput((fJson.subscription.positiveKeywords || []).join(', '));
                setNegativeKeywordsInput((fJson.subscription.negativeKeywords || []).join(', '));
                setDigestFrequency(fJson.subscription.digestFrequency || 'instant');
              }
            }
          })
          .catch(() => {});

        if (json.list?.id) {
          // Fetch contributions
          fetch(`/api/lists/${json.list.id}/contributions`)
            .then(res => res.ok ? res.json() : { contributions: [] })
            .then(cJson => setContributions(cJson.contributions || []))
            .catch(() => {});

          // Fetch collaborators
          fetch(`/api/lists/${json.list.id}/collaborators`)
            .then(res => res.ok ? res.json() : { collaborators: [] })
            .then(colJson => setCollaborators(colJson.collaborators || []))
            .catch(() => {});
        }
      })
      .catch(err => {
        setError(err.message || 'Access disabled');
        setLoading(false);
      });
  }, [slug]);

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success('Public watchlist link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleToggleFollow = async (unfollow = false) => {
    setFollowSubmitting(true);
    try {
      const posArray = positiveKeywordsInput.split(',').map(s => s.trim()).filter(Boolean);
      const negArray = negativeKeywordsInput.split(',').map(s => s.trim()).filter(Boolean);

      const res = await fetch(`/api/public/lists/${slug}/follow`, {
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
    } catch (err: any) {
      alert(err.message || 'Please log in to follow public lists and get alerts');
    } finally {
      setFollowSubmitting(false);
    }
  };

  const handleSuggestCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuggestSubmitting(true);
    setSuggestSuccess('');
    try {
      const res = await fetch(`/api/public/lists/${slug}/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: suggestUrl, companyName: suggestCompany }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to submit suggestion');

      setSuggestSuccess(json.message || 'Suggestion submitted!');
      setSuggestUrl('');
      setSuggestCompany('');
      setTimeout(() => {
        setShowSuggestModal(false);
        setSuggestSuccess('');
      }, 2000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSuggestSubmitting(false);
    }
  };

  const handleForkList = async () => {
    if (forking) return;
    setForking(true);
    try {
      const res = await fetch(`/api/public/lists/${slug}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: 'private' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fork list');

      router.push(`/dashboard/lists/${json.list.id}`);
    } catch (err: any) {
      alert(err.message || 'Please log in to fork public lists');
    } finally {
      setForking(false);
    }
  };

  const handleReviewContribution = async (contribId: string, action: 'approve' | 'reject') => {
    if (!data?.list?.id) return;
    try {
      const res = await fetch(`/api/lists/${data.list.id}/contributions/${contribId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to review');

      setContributions(prev => prev.map(c => c.id === contribId ? { ...c, status: action === 'approve' ? 'approved' : 'rejected' } : c));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collabEmail.trim() || !data?.list?.id) return;
    setCollabSubmitting(true);
    try {
      const res = await fetch(`/api/lists/${data.list.id}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: collabEmail, role: 'editor' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to add collaborator');

      setCollabEmail('');
      fetch(`/api/lists/${data.list.id}/collaborators`)
        .then(res => res.json())
        .then(colJson => setCollaborators(colJson.collaborators || []));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCollabSubmitting(false);
    }
  };

  const handleRemoveCollaborator = async (targetUserId: string) => {
    if (!data?.list?.id) return;
    try {
      const res = await fetch(`/api/lists/${data.list.id}/collaborators?userId=${targetUserId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to remove collaborator');
      }
      setCollaborators(prev => prev.filter(c => c.userId !== targetUserId));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAdminDeleteList = async () => {
    if (!data?.list?.id) return;
    if (!confirm(`ADMIN ACTION: Are you sure you want to permanently delete the list "${data.list.name}"?`)) return;
    try {
      const res = await fetch(`/api/lists/${data.list.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to delete list');
      }
      alert('List deleted by admin.');
      router.push('/discover');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAdminBlockUser = async () => {
    if (!data?.list?.userId) return;
    if (!confirm(`ADMIN ACTION: Are you sure you want to block the curator "${data.list.userName || 'User'}"?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${data.list.userId}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block: true, reason: 'Blocked by Admin from Public List View' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to block user');
      alert(json.message);
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading public watch list..." fullPage />;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#080c14] flex items-center justify-center p-6">
        <div className="glass-panel p-8 sm:p-12 rounded-3xl border-slate-200 dark:border-slate-800 text-center max-w-xl space-y-4">
          <ShieldAlert className="w-14 h-14 text-rose-500 mx-auto" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Access Disabled</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">{error || 'This list may be private or does not exist.'}</p>
          <div className="pt-2">
            <Link href="/discover" className="inline-block text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl shadow-md">
              Explore Public Directory
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { list, pages, jobs } = data;
  const currentUserId = user?.id || user?.userId;
  const isAdmin = user?.role === 'admin';
  const isOwner = !!(currentUserId && list?.userId && currentUserId === list.userId);
  const isMaintainer = isAdmin || isOwner || (collaborators || []).some((c: any) => c.userId === currentUserId);
  const pendingContribs = (contributions || []).filter((c: any) => c.status === 'pending');

  const filteredPages = (pages || []).filter((p: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (p.companyName || '').toLowerCase().includes(q) || (p.url || '').toLowerCase().includes(q);
  });

  const filteredJobs = (jobs || []).filter((j: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const title = (j.title || '').toLowerCase();
    const company = ((j.companyName || j.rawData?.company || '') as string).toLowerCase();
    const location = (j.location || '').toLowerCase();
    return title.includes(q) || company.includes(q) || location.includes(q);
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080c14] text-slate-900 dark:text-slate-100 flex flex-col justify-between transition-colors">
      <Navbar showBackHome />
      <div className="p-6 md:p-12 max-w-6xl mx-auto w-full space-y-8 flex-1">

        {/* Header Section */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/60 dark:border-slate-800/60">
            {/* Badges Inline Row */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="public">Public Watchlist</Badge>
              {isAdmin && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-rose-500/8 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-[11px] font-medium tracking-tight">
                  <Shield className="w-3.5 h-3.5 text-rose-500 shrink-0" /> Admin Override
                </span>
              )}
              {isOwner && !isAdmin && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-500/8 text-amber-700 dark:text-amber-300 border border-amber-500/20 text-[11px] font-medium tracking-tight">
                  <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" /> Your Watchlist (Owner)
                </span>
              )}
              {!isOwner && (collaborators || []).some((c: any) => c.userId === currentUserId && c.status === 'accepted') && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-purple-500/8 text-purple-600 dark:text-purple-400 border border-purple-500/20 text-[11px] font-medium tracking-tight">
                  <Users className="w-3.5 h-3.5 text-purple-500 shrink-0" /> Collaborator
                </span>
              )}
              {list.isCanonical !== false && <Badge variant="canonical">Verified List</Badge>}
              {list.followerCount > 0 && <Badge variant="follower" count={list.followerCount} />}
            </div>

            {/* Action Controls Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              {isAdmin && (
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/20">
                  <button
                    type="button"
                    onClick={handleAdminDeleteList}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-medium flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                    title="Permanently Delete List"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete List
                  </button>

                  <button
                    type="button"
                    onClick={handleAdminBlockUser}
                    className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer"
                    title="Block List Creator"
                  >
                    <Ban className="w-3.5 h-3.5 text-rose-500" />
                    Block Curator
                  </button>
                </div>
              )}

              {/* Follow & Get Email Alerts Button (Available for ALL watch lists including owned lists) */}
              <button
                type="button"
                onClick={() => !user ? setShowAuthRequiredModal(true) : setShowFollowModal(true)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
                  following
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                <Bell className="w-3.5 h-3.5" />
                {following ? 'Alerts Active' : 'Follow & Get Email Alerts'}
              </button>

              {isMaintainer ? (
                <>
                  <Link
                    href={`/dashboard/lists/${list.id}`}
                    className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    Manage List
                  </Link>

                  <button
                    type="button"
                    onClick={() => setShowContributionsModal(true)}
                    className="px-3 py-1.5 rounded-xl border border-amber-500/30 text-amber-700 dark:text-amber-300 bg-amber-500/5 hover:bg-amber-500/15 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <PlusCircle className="w-3.5 h-3.5 text-amber-500" />
                    Suggestions {pendingContribs.length > 0 && `(${pendingContribs.length})`}
                  </button>

                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => setShowCollaboratorsModal(true)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-purple-500" />
                      Collaborators {collaborators.length > 0 && `(${collaborators.length})`}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setShowSuggestModal(true)}
                    className="px-3 py-1.5 rounded-xl border border-amber-500/30 text-amber-700 dark:text-amber-300 bg-amber-500/5 hover:bg-amber-500/15 flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer"
                    title="Suggest a company career page for this watchlist"
                  >
                    <PlusCircle className="w-3.5 h-3.5 text-amber-500" />
                    Suggest Company
                  </button>

                  <button
                    type="button"
                    onClick={() => !user ? setShowAuthRequiredModal(true) : handleForkList()}
                    disabled={forking}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer"
                  >
                    <GitFork className="w-3.5 h-3.5 text-purple-500" />
                    {forking ? 'Forking...' : 'Fork List'}
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={handleCopyLink}
                className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Share List"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Title, Description & Curator Row */}
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{list.name}</h1>
            {list.description && (
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-3xl">{list.description}</p>
            )}

            <div className="flex items-center gap-2 pt-1 text-xs text-slate-500">
              <span>Curated by:</span>
              <button
                type="button"
                onClick={() => list.userId && setSelectedUserId(list.userId)}
                className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 group/user transition-colors cursor-pointer text-left"
              >
                {list.userAvatarUrl ? (
                  <img src={list.userAvatarUrl} alt={list.userName || 'User'} className="w-5 h-5 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[9px] flex items-center justify-center shrink-0 shadow-sm">
                    {(list.userName?.[0] || 'U').toUpperCase()}
                  </div>
                )}
                <span className="underline-offset-2 group-hover/user:underline">{list.userName || 'Community User'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Companies List */}
          <div className="lg:col-span-1 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center justify-between">
              <span>Monitored Companies ({filteredPages.length})</span>
              {isMaintainer && (
                <Link
                  href={`/dashboard/lists/${list.id}`}
                  className="px-2.5 py-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-sm transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Page
                </Link>
              )}
            </h2>
            {filteredPages.length === 0 ? (
              <div className="glass-panel p-6 rounded-2xl text-center border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                No monitored companies in this list.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPages.map((p: any) => {
                  const colorTheme = getCompanyColorTheme(p.companyName || 'Company');
                  const logoUrl = getCompanyLogoUrl(p.url);

                  return (
                    <div
                      key={p.id}
                      className={`glass-card p-4 rounded-xl text-xs border border-slate-200/80 dark:border-slate-800/80 border-l-4 ${colorTheme.border}`}
                      style={{ backgroundColor: colorTheme.bgLight }}
                    >
                      <div className="flex items-center justify-between mb-1.5 gap-2">
                        <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-sm truncate">
                          {logoUrl ? (
                            <img src={logoUrl} alt={p.companyName || 'Company'} className="w-5 h-5 rounded object-contain bg-white p-0.5 border border-slate-200 dark:border-slate-700 shrink-0" />
                          ) : (
                            <div className={`w-5 h-5 rounded flex items-center justify-center font-extrabold text-[10px] ${colorTheme.bg} ${colorTheme.text} shrink-0`}>
                              {(p.companyName?.[0] || 'C').toUpperCase()}
                            </div>
                          )}
                          <span className="truncate">{p.companyName || 'Company'}</span>
                          {p.isPaused && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md shrink-0">
                              <PauseCircle className="w-3 h-3 text-amber-500" /> Paused
                            </span>
                          )}
                        </div>

                        {isMaintainer && (
                          <Link
                            href={`/dashboard/lists/${list.id}`}
                            className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline shrink-0 bg-blue-500/10 px-2 py-0.5 rounded-md"
                          >
                            Manage
                          </Link>
                        )}
                      </div>
                      <a href={p.url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline truncate block text-[11px] font-mono">
                        {p.url}
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Jobs Feed */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Currently Open Positions ({filteredJobs.length})
              </h2>

              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                {/* Google Drive Style View Switcher */}
                <div className="flex items-center bg-slate-100 dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleJobViewChange('grid')}
                    className={`px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition-all cursor-pointer ${
                      jobViewMode === 'grid'
                        ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm font-semibold'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title="Grid View (Cards)"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Grid</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleJobViewChange('tiles')}
                    className={`px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition-all cursor-pointer ${
                      jobViewMode === 'tiles'
                        ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm font-semibold'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title="Tiles View (2 Columns)"
                  >
                    <Grid2X2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Tiles</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleJobViewChange('table')}
                    className={`px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition-all cursor-pointer ${
                      jobViewMode === 'table'
                        ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm font-semibold'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title="Table View"
                  >
                    <List className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Table</span>
                  </button>
                </div>

                <div className="relative w-full sm:w-56">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search jobs..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600 transition-all shadow-sm"
                  />
                </div>
              </div>
            </div>

            {filteredJobs.length === 0 ? (
              <div className="glass-panel p-10 rounded-2xl text-center border-slate-200 dark:border-slate-800 space-y-2">
                <Briefcase className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500 dark:text-slate-400">No active positions currently reported.</p>
              </div>
            ) : (() => {
              const totalJobPages = Math.ceil(filteredJobs.length / jobLimit) || 1;
              const paginatedJobs = filteredJobs.slice((jobPage - 1) * jobLimit, jobPage * jobLimit);

              return (
                <div className="space-y-4">
                  {jobViewMode === 'grid' ? (
                    <div className="space-y-3">
                      {paginatedJobs.map((j: any) => (
                        <JobCard key={j.id} job={j} />
                      ))}
                    </div>
                  ) : jobViewMode === 'tiles' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {paginatedJobs.map((j: any) => (
                        <JobCard key={j.id} job={j} />
                      ))}
                    </div>
                  ) : (
                    /* Table View for Jobs */
                    <div className="glass-panel rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                            <tr>
                              <th className="py-3 px-4">Position Title</th>
                              <th className="py-3 px-3">Company</th>
                              <th className="py-3 px-3">Location</th>
                              <th className="py-3 px-3">Type</th>
                              <th className="py-3 px-4 text-right">Apply</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                            {paginatedJobs.map((j: any) => (
                              <tr key={j.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors">
                                <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                                  {j.title}
                                </td>
                                <td className="py-3.5 px-3 font-semibold text-blue-600 dark:text-blue-400">
                                  {j.companyName || j.rawData?.company || 'Company'}
                                </td>
                                <td className="py-3.5 px-3 text-slate-600 dark:text-slate-400 truncate max-w-[140px]">
                                  {j.location || 'Remote'}
                                </td>
                                <td className="py-3.5 px-3">
                                  <span className="px-2 py-0.5 rounded-md bg-blue-500/8 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[11px] font-medium">
                                    {j.jobType || 'Full-Time'}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 text-right">
                                  <a
                                    href={j.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-sm"
                                  >
                                    Apply <ExternalLink className="w-3 h-3" />
                                  </a>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Job Feed Pagination Bar */}
                  {totalJobPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
                      <span className="text-xs text-slate-500">
                        Page <span className="font-bold text-slate-900 dark:text-white">{jobPage}</span> of <span className="font-bold text-slate-900 dark:text-white">{totalJobPages}</span> ({pluralize(filteredJobs.length, 'open position', 'open positions')})
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setJobPage(prev => Math.max(1, prev - 1))}
                          disabled={jobPage <= 1}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" /> Previous
                        </button>

                        <button
                          onClick={() => setJobPage(prev => Math.min(totalJobPages, prev + 1))}
                          disabled={jobPage >= totalJobPages}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                        >
                          Next <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Follow / Alert Settings Modal */}
      {mounted && showFollowModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full p-6 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4 bg-white dark:bg-slate-950 shadow-2xl">
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-blue-500" />
              Public List Job Alert Settings
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Receive automatic email alerts whenever companies in <strong>{list.name}</strong> post matching job offers.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                  Positive Keyword Filters (comma separated)
                </label>
                <input
                  type="text"
                  value={positiveKeywordsInput}
                  onChange={e => setPositiveKeywordsInput(e.target.value)}
                  placeholder="e.g. Frontend, React, Senior, Remote"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                  Negative Keyword Exclusions (comma separated)
                </label>
                <input
                  type="text"
                  value={negativeKeywordsInput}
                  onChange={e => setNegativeKeywordsInput(e.target.value)}
                  placeholder="e.g. Intern, Junior, Contract"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                  Alert Digest Frequency
                </label>
                <select
                  value={digestFrequency}
                  onChange={e => setDigestFrequency(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-blue-500 font-bold"
                >
                  <option value="instant">⚡ Instant Notification</option>
                  <option value="daily">📅 Daily Digest</option>
                  <option value="weekly">🗞️ Weekly Summary</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 gap-3">
              {following && (
                <button
                  type="button"
                  onClick={() => handleToggleFollow(true)}
                  disabled={followSubmitting}
                  className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline"
                >
                  Unfollow List
                </button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setShowFollowModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleFollow(false)}
                  disabled={followSubmitting}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md"
                >
                  {followSubmitting ? 'Saving...' : 'Save Alert Settings'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Suggest Company Modal */}
      {showSuggestModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSuggestCompany} className="glass-panel max-w-md w-full p-6 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4 bg-white dark:bg-slate-950 shadow-2xl">
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-emerald-500" />
              Suggest a Company Career Page
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Contribute a new company to <strong>{list.name}</strong>. The list owner will review your submission.
            </p>

            {suggestSuccess ? (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold text-center">
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
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-emerald-500"
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
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end pt-2 gap-2">
              <button
                type="button"
                onClick={() => setShowSuggestModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                Close
              </button>
              {!suggestSuccess && (
                <button
                  type="submit"
                  disabled={suggestSubmitting}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
                >
                  {suggestSubmitting ? 'Submitting...' : 'Submit Suggestion'}
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Maintainer Review Suggestions Modal */}
      {showContributionsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel max-w-lg w-full p-6 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4 bg-white dark:bg-slate-950 shadow-2xl">
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-amber-500" />
              Community Suggestions ({pendingContribs.length})
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Approve suggestions to add them to this public watch list.
            </p>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {pendingContribs.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
                  <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto" />
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">All suggestions reviewed!</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">There are currently no pending community suggestions for this watchlist.</p>
                </div>
              ) : (
                pendingContribs.map((c) => (
                  <div key={c.id} className="glass-card p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                    <div className="text-xs space-y-0.5 max-w-xs">
                      <span className="font-bold text-slate-900 dark:text-white block">{c.companyName || 'Suggested Company'}</span>
                      <span className="text-[11px] font-mono text-blue-500 block truncate">{c.url}</span>
                      <span className="text-[10px] text-slate-400 uppercase">ATS: {c.atsType}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleReviewContribution(c.id, 'approve')}
                        className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 text-xs font-bold flex items-center gap-1 cursor-pointer"
                        title="Approve & Add"
                      >
                        <CheckCircle className="w-4 h-4" /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReviewContribution(c.id, 'reject')}
                        className="p-2 rounded-xl bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 text-xs font-bold flex items-center gap-1 cursor-pointer"
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
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collaborators Modal */}
      {showCollaboratorsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full p-6 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4 bg-white dark:bg-slate-950 shadow-2xl">
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-purple-500" />
              List Co-Maintainers
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Invite registered users to co-curate and manage <strong>{list.name}</strong>.
            </p>

            <form onSubmit={handleAddCollaborator} className="flex gap-2">
              <input
                type="email"
                required
                value={collabEmail}
                onChange={e => setCollabEmail(e.target.value)}
                placeholder="user@example.com"
                className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-purple-500"
              />
              <button
                type="submit"
                disabled={collabSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-md cursor-pointer"
              >
                {collabSubmitting ? 'Adding...' : 'Add'}
              </button>
            </form>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1 pt-1">
              {collaborators.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">No co-maintainers added yet.</p>
              ) : (
                collaborators.map((col: any) => (
                  <div key={col.id} className="flex items-center justify-between p-3 rounded-xl glass-card border border-slate-200 dark:border-slate-800 text-xs">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">{col.name || 'User'}</span>
                      <span className="text-[11px] text-slate-500">{col.email}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCollaborator(col.userId)}
                      className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
                      title="Remove collaborator"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowCollaboratorsModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sign In Required Modal */}
      {showAuthRequiredModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full p-8 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-5 bg-white dark:bg-slate-950 shadow-2xl text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto border border-blue-500/20 shadow-inner">
              <Bell className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Sign In to Follow Watchlists
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                You need a JobPingly account to subscribe to <strong>{list.name}</strong>, set custom keyword filters, and receive automated job offer email alerts.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <Link
                href={`/login?redirect=/lists/${slug}`}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md block transition-all"
              >
                Sign In Now
              </Link>
              <Link
                href={`/register?redirect=/lists/${slug}`}
                className="w-full py-3 rounded-xl glass-panel text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border-slate-200 dark:border-slate-800 font-bold text-xs block transition-all"
              >
                Create Free Account
              </Link>
              <button
                type="button"
                onClick={() => setShowAuthRequiredModal(false)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white pt-1 transition-colors cursor-pointer"
              >
                Continue Browsing
              </button>
            </div>
          </div>
        </div>
      )}

      <PublicUserProfileModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
      <Footer />
    </div>
  );
}
