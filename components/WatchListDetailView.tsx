'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Globe,
  Lock,
  ArrowLeft,
  Briefcase,
  ShieldAlert,
  Share2,
  Check,
  Search,
  Bell,
  GitFork,
  PlusCircle,
  CheckCircle,
  XCircle,
  Users,
  Crown,
  Sliders,
  UserPlus,
  Trash2,
  Shield,
  Ban,
  LayoutGrid,
  Grid2X2,
  List,
  Plus,
  PauseCircle,
  Edit3,
  RefreshCw,
  LogOut,
  MoreVertical,
  Building2,
  Bot,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import LoadingSpinner from '@/components/LoadingSpinner';
import { JobCard } from '@/components/JobCard';
import { Badge } from '@/components/Badge';
import { PublicUserProfileModal } from '@/components/PublicUserProfileModal';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/components/auth/AuthContext';
import { getCompanyColorTheme, getCompanyLogoUrl } from '@/lib/utils/companyBranding';
import { pluralize } from '@/lib/utils/pluralize';

interface WatchListDetailViewProps {
  listId?: string;
  slug?: string;
  isDashboard?: boolean;
}

export default function WatchListDetailView({
  listId: initialListId,
  slug: initialSlug,
  isDashboard = false,
}: WatchListDetailViewProps) {
  const toast = useToast();
  const router = useRouter();
  const { user: authUser } = useAuth();

  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // View Mode State (Grid, Tiles, Table)
  const [jobViewMode, setJobViewMode] = useState<'grid' | 'tiles' | 'table'>('grid');

  // Search State
  const [searchQuery, setSearchQuery] = useState('');

  // Scroll Pagination State for Monitored Pages and Jobs
  const [pagesLimit, setPagesLimit] = useState(15);
  const [jobsLimit, setJobsLimit] = useState(15);

  // Modals & Subscriptions State
  const [copied, setCopied] = useState(false);
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

  // Contributions / Suggestions
  const [contributions, setContributions] = useState<any[]>([]);
  const [showContributionsModal, setShowContributionsModal] = useState(false);

  // Collaborators
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [showCollaboratorsModal, setShowCollaboratorsModal] = useState(false);
  const [collabEmail, setCollabEmail] = useState('');
  const [collabSubmitting, setCollabSubmitting] = useState(false);

  // Edit Watch List Details State
  const [showEditListModal, setShowEditListModal] = useState(false);
  const [editListName, setEditListName] = useState('');
  const [editListDescription, setEditListDescription] = useState('');
  const [editListVisibility, setEditListVisibility] = useState<'public' | 'private'>('public');
  const [savingList, setSavingList] = useState(false);

  // Add career page form state
  const [showAdd, setShowAdd] = useState(false);
  const [url, setUrl] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [keywords, setKeywords] = useState('');
  const [adding, setAdding] = useState(false);

  // Edit company state
  const [editingCompany, setEditingCompany] = useState<any | null>(null);
  const [editCompanyNameStr, setEditCompanyNameStr] = useState('');
  const [editCompanyUrlStr, setEditCompanyUrlStr] = useState('');
  const [updatingCompany, setUpdatingCompany] = useState(false);

  // Card Dropdown & Scraping/Syncing State
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [scrapingMap, setScrapingMap] = useState<Record<string, boolean>>({});

  // Input Refs for Auto-Focus
  const addUrlInputRef = useRef<HTMLInputElement>(null);
  const editListNameInputRef = useRef<HTMLInputElement>(null);
  const editCompanyInputRef = useRef<HTMLInputElement>(null);
  const collabEmailInputRef = useRef<HTMLInputElement>(null);
  const suggestInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setPagesLimit(15);
    setJobsLimit(15);
  }, [searchQuery, data]);

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

  useEffect(() => {
    if (showAdd) setTimeout(() => addUrlInputRef.current?.focus(), 50);
  }, [showAdd]);

  useEffect(() => {
    if (showEditListModal && data?.list) {
      setEditListName(data.list.name || '');
      setEditListDescription(data.list.description || '');
      setEditListVisibility(data.list.visibility || 'public');
      setTimeout(() => editListNameInputRef.current?.focus(), 50);
    }
  }, [showEditListModal, data?.list]);

  useEffect(() => {
    if (editingCompany) setTimeout(() => editCompanyInputRef.current?.focus(), 50);
  }, [editingCompany]);

  useEffect(() => {
    if (showCollaboratorsModal) setTimeout(() => collabEmailInputRef.current?.focus(), 50);
  }, [showCollaboratorsModal]);

  useEffect(() => {
    if (showSuggestModal) setTimeout(() => suggestInputRef.current?.focus(), 50);
  }, [showSuggestModal]);

  const menuRef = useRef<HTMLDivElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
      if (headerMenuRef.current && !headerMenuRef.current.contains(event.target as Node)) {
        setShowHeaderMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAuthRequiredModal(false);
        setShowFollowModal(false);
        setShowSuggestModal(false);
        setShowContributionsModal(false);
        setShowCollaboratorsModal(false);
        setShowEditListModal(false);
        setShowAdd(false);
        setEditingCompany(null);
        setSelectedUserId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Main Load Data Function
  const loadDetail = async () => {
    try {
      let endpoint = '';
      if (initialListId) {
        endpoint = `/api/lists/${initialListId}`;
      } else if (initialSlug) {
        endpoint = `/api/public/lists/${initialSlug}`;
      } else {
        throw new Error('Watch list identifier not provided');
      }

      const targetSlug = initialSlug;
      const targetId = initialListId;

      // Launch auxiliary background requests in parallel immediately
      if (targetSlug) {
        fetch(`/api/public/lists/${targetSlug}/follow`)
          .then(r => r.json())
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
      }

      if (targetId) {
        fetch(`/api/lists/${targetId}/collaborators`)
          .then(r => r.ok ? r.json() : { collaborators: [] })
          .then(cJson => setCollaborators(cJson.collaborators || []))
          .catch(() => {});

        fetch(`/api/lists/${targetId}/contributions`)
          .then(r => r.ok ? r.json() : { contributions: [] })
          .then(cJson => setContributions(cJson.contributions || []))
          .catch(() => {});
      }

      // Fetch main list payload
      const res = await fetch(endpoint);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load watch list');

      setData(json);

      // If initial identifiers were missing, trigger auxiliary requests now
      const resolvedSlug = json.list?.slug;
      const resolvedId = json.list?.id;

      if (!targetSlug && resolvedSlug) {
        fetch(`/api/public/lists/${resolvedSlug}/follow`)
          .then(r => r.json())
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
      }

      if (!targetId && resolvedId) {
        fetch(`/api/lists/${resolvedId}/collaborators`)
          .then(r => r.ok ? r.json() : { collaborators: [] })
          .then(cJson => setCollaborators(cJson.collaborators || []))
          .catch(() => {});

        fetch(`/api/lists/${resolvedId}/contributions`)
          .then(r => r.ok ? r.json() : { contributions: [] })
          .then(cJson => setContributions(cJson.contributions || []))
          .catch(() => {});
      }
    } catch (err: any) {
      setError(err.message || 'Access disabled or list not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialListId || initialSlug) {
      loadDetail();
    }
  }, [initialListId, initialSlug]);

  const listId = data?.list?.id || initialListId;
  const listSlug = data?.list?.slug || initialSlug;

  const currentUserId = authUser?.id || authUser?.userId;
  const isAdmin = authUser?.role === 'admin';
  const isOwner = !!(currentUserId && data?.list?.userId && currentUserId === data.list.userId);
  const isMaintainer = isAdmin || isOwner || (collaborators || []).some((c: any) => c.userId === currentUserId && c.status === 'accepted');

  const pendingContribs = (contributions || []).filter((c: any) => c.status === 'pending');

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      const shareUrl = `${window.location.origin}/lists/${listSlug || listId}`;
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Public watchlist link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleVisibilityToggle = async () => {
    if (!listId || !isMaintainer) return;
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

  const handleEditListSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editListName.trim() || !listId) return;
    setSavingList(true);
    try {
      const res = await fetch(`/api/lists/${listId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editListName.trim(),
          description: editListDescription.trim(),
          visibility: editListVisibility,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success('Watch list details updated successfully!');
        setShowEditListModal(false);
        loadDetail();
      } else {
        toast.error(json.error || 'Failed to update watch list details');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update watch list details');
    } finally {
      setSavingList(false);
    }
  };

  const handleAddPage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listId) return;
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

      setUrl('');
      setCompanyName('');
      setKeywords('');
      setShowAdd(false);
      loadDetail();

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
              loadDetail();
            }
          })
          .catch(() => {});
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to add career page');
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

  const handleSyncPage = async (pageId: string, companyStr: string) => {
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

  const handleDeleteCareerPage = async (careerPageId: string, pageCompanyName: string) => {
    if (!listId) return;
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
    if (!listId) return;
    try {
      const res = await fetch(`/api/lists/${listId}/career-pages`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ careerPageId, isPaused: newPausedState }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.info(json.message || (newPausedState ? `Paused monitoring for '${companyName}'` : `Resumed monitoring for '${companyName}'`));
        loadDetail();
      } else {
        toast.error(json.error || 'Failed to update company monitoring status');
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleFollowSubmit = async (e: React.FormEvent, unfollow = false) => {
    e.preventDefault();
    if (!listSlug && !listId) return;
    setFollowSubmitting(true);
    try {
      const posArray = positiveKeywordsInput.split(',').map(s => s.trim()).filter(Boolean);
      const negArray = negativeKeywordsInput.split(',').map(s => s.trim()).filter(Boolean);

      const res = await fetch(`/api/public/lists/${listSlug || listId}/follow`, {
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

  const handleSuggestCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listSlug && !listId) return;
    setSuggestSubmitting(true);
    setSuggestSuccess('');
    try {
      const res = await fetch(`/api/public/lists/${listSlug || listId}/suggest`, {
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
      toast.error(err.message);
    } finally {
      setSuggestSubmitting(false);
    }
  };

  const handleForkList = async () => {
    if (forking || (!listSlug && !listId)) return;
    setForking(true);
    try {
      const res = await fetch(`/api/public/lists/${listSlug || listId}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: 'private' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fork list');

      toast.success('Watch list forked successfully!');
      router.push(`/dashboard/lists/${json.list.id}`);
    } catch (err: any) {
      toast.error(err.message || 'Please log in to fork public lists');
    } finally {
      setForking(false);
    }
  };

  const handleReviewContribution = async (contribId: string, action: 'approve' | 'reject') => {
    if (!listId) return;
    try {
      const res = await fetch(`/api/lists/${listId}/contributions/${contribId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(action === 'approve' ? 'Suggestion approved and company added!' : 'Suggestion rejected');
        loadDetail();
      } else {
        toast.error(json.error || 'Failed to review contribution');
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collabEmail.trim() || !listId) return;
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
        loadDetail();
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
    if (!listId) return;
    if (!confirm('Remove this collaborator from the watch list?')) return;
    try {
      const res = await fetch(`/api/lists/${listId}/collaborators?userId=${targetUserId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.info('Collaborator removed');
        loadDetail();
      } else {
        const json = await res.json();
        toast.error(json.error || 'Failed to remove collaborator');
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleLeaveWatchList = async () => {
    if (!listId) return;
    if (!confirm(`Are you sure you want to leave collaboration on '${data?.list?.name}'?`)) return;
    try {
      const res = await fetch(`/api/lists/${listId}/collaborators`, { method: 'DELETE' });
      const json = await res.json();
      if (res.ok) {
        toast.info(json.message || `You have left '${data?.list?.name}'`);
        router.push('/dashboard');
      } else {
        toast.error(json.error || 'Failed to leave list');
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleAdminDeleteList = async () => {
    if (!listId) return;
    if (!confirm(`ADMIN ACTION: Are you sure you want to permanently delete the list "${data?.list?.name}"?`)) return;
    try {
      const res = await fetch(`/api/lists/${listId}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to delete list');
      }
      toast.info('List deleted by admin.');
      router.push('/discover');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAdminBlockUser = async () => {
    if (!data?.list?.userId) return;
    if (!confirm(`ADMIN ACTION: Are you sure you want to block the curator "${data?.list?.userName || 'User'}"?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${data.list.userId}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block: true, reason: 'Blocked by Admin from Watch List View' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to block user');
      toast.info(json.message);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading watch list..." fullPage />;
  }

  if (error || !data || !data.list) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#080c14] flex items-center justify-center p-6">
        <div className="glass-panel p-8 sm:p-12 rounded-3xl border-slate-200 dark:border-slate-800 text-center max-w-xl space-y-4">
          <ShieldAlert className="w-14 h-14 text-rose-500 mx-auto" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Access Disabled</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">{error || 'This list may be private or does not exist.'}</p>
          <div className="pt-2">
            <Link
              href={isDashboard ? '/dashboard' : '/discover'}
              className="inline-block text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl shadow-md"
            >
              {isDashboard ? 'Back to Dashboard' : 'Explore Public Directory'}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { list, pages, jobs } = data;

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

  const handlePagesScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 150) {
      setPagesLimit(prev => Math.min(filteredPages.length, prev + 15));
    }
  };

  const handleJobsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 150) {
      setJobsLimit(prev => Math.min(filteredJobs.length, prev + 15));
    }
  };

  const visiblePagesList = filteredPages.slice(0, pagesLimit);
  const visibleJobsList = filteredJobs.slice(0, jobsLimit);

  const companyIndexMap = new Map<string, number>();
  (pages || []).forEach((p: any, idx: number) => {
    if (p.id) companyIndexMap.set(p.id, idx);
    if (p.companyName) companyIndexMap.set(p.companyName.toLowerCase().trim(), idx);
  });

  const mainContent = (
    <div className="space-y-8 max-w-6xl mx-auto w-full flex-1">
      {isDashboard && (
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Private Watch Lists
        </Link>
      )}

      {/* Ultra-Modern Hero Header Panel */}
      <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs relative z-30 space-y-4">
        {/* Subtle background glow accent confined within card boundaries */}
        <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none -z-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-3xl" />
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Left Column: Title, Description & Badges */}
          <div className="space-y-2.5 flex-1 min-w-0">
            {/* Badges & Status Line */}
            <div className="flex items-center gap-2 flex-wrap">
              {isMaintainer ? (
                <button
                  type="button"
                  onClick={handleVisibilityToggle}
                  className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                    list.visibility === 'public'
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                      : 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-300 dark:hover:bg-slate-700'
                  }`}
                  title="Click to toggle Public / Private visibility"
                >
                  {list.visibility === 'public' ? <Globe className="w-3.5 h-3.5 text-emerald-500" /> : <Lock className="w-3.5 h-3.5 text-slate-400" />}
                  {list.visibility === 'public' ? 'Public' : 'Private'}
                </button>
              ) : list.visibility === 'public' ? (
                <Badge variant="public">Public</Badge>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 text-[11px] font-medium tracking-tight">
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  Private
                </span>
              )}

              {isOwner && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-semibold tracking-tight">
                  <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" /> Owner
                </span>
              )}

              {isAdmin && !isOwner && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[11px] font-semibold tracking-tight">
                  <Shield className="w-3.5 h-3.5 text-rose-500 shrink-0" /> Admin Override
                </span>
              )}

              {!isOwner && (collaborators || []).some((c: any) => c.userId === currentUserId && c.status === 'accepted') && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 text-[11px] font-semibold tracking-tight">
                  <Users className="w-3.5 h-3.5 text-purple-500 shrink-0" /> Collaborator
                </span>
              )}

              {list.isCanonical !== false && <Badge variant="canonical">Verified List</Badge>}
            </div>

            {/* Title & Edit Icon */}
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{list.name}</h1>
              {isMaintainer && (
                <button
                  type="button"
                  onClick={() => setShowEditListModal(true)}
                  className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-500/40 transition-all cursor-pointer shadow-xs"
                  title="Edit Watch List Name & Details"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Description */}
            {list.description && list.description.trim() ? (
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-3xl">{list.description.trim()}</p>
            ) : isMaintainer ? (
              <button
                type="button"
                onClick={() => setShowEditListModal(true)}
                className="text-xs text-slate-400 dark:text-slate-500 italic hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add list description &amp; details...
              </button>
            ) : null}
          </div>

          {/* Right Column: Sleek & Compact Action Toolbar */}
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center relative z-30" ref={headerMenuRef}>
            {/* Follow & Get Email Alerts Button */}
            <button
              type="button"
              onClick={() => (!authUser ? setShowAuthRequiredModal(true) : setShowFollowModal(true))}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-xs ${
                following
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500/50'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span>{following ? 'Alerts Active' : 'Follow & Get Alerts'}</span>
            </button>

            {/* Share Link Button */}
            <button
              type="button"
              onClick={handleCopyLink}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shadow-xs"
              title="Share Watch List Link"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
            </button>

            {/* More Actions Dropdown Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowHeaderMenu(!showHeaderMenu)}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shadow-xs relative"
                title="More Actions"
              >
                <MoreVertical className="w-4 h-4" />
                {isMaintainer && pendingContribs.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full ring-2 ring-white dark:ring-slate-900 animate-pulse" />
                )}
              </button>

              {showHeaderMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                  {/* Maintainer Tools */}
                  {isMaintainer && (
                    <>
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Management
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setShowHeaderMenu(false);
                          setShowEditListModal(true);
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4 text-blue-500" />
                        Edit Watch List
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowHeaderMenu(false);
                          setShowContributionsModal(true);
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <PlusCircle className="w-4 h-4 text-amber-500" />
                          Suggestions
                        </span>
                        {pendingContribs.length > 0 && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full">
                            {pendingContribs.length}
                          </span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowHeaderMenu(false);
                          setShowCollaboratorsModal(true);
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <UserPlus className="w-4 h-4 text-purple-500" />
                          Team &amp; Access
                        </span>
                        {collaborators.length > 0 && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded-full">
                            {collaborators.length}
                          </span>
                        )}
                      </button>
                    </>
                  )}

                  {/* Non-Maintainer Visitor Options */}
                  {!isMaintainer && (
                    <>
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Actions
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setShowHeaderMenu(false);
                          setShowSuggestModal(true);
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <PlusCircle className="w-4 h-4 text-amber-500" />
                        Suggest a Company
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowHeaderMenu(false);
                          if (!authUser) {
                            setShowAuthRequiredModal(true);
                          } else {
                            handleForkList();
                          }
                        }}
                        disabled={forking}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <GitFork className="w-4 h-4 text-purple-500" />
                        {forking ? 'Forking...' : 'Fork Watch List'}
                      </button>
                    </>
                  )}

                  {/* Leave Watch List Option */}
                  {!isOwner && isMaintainer && (
                    <>
                      <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
                      <button
                        type="button"
                        onClick={() => {
                          setShowHeaderMenu(false);
                          handleLeaveWatchList();
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 text-rose-500" />
                        Leave Watch List
                      </button>
                    </>
                  )}

                  {/* Admin Actions */}
                  {isAdmin && (
                    <>
                      <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-500">
                        Admin Tools
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setShowHeaderMenu(false);
                          handleAdminDeleteList();
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4 text-rose-500" />
                        Delete List
                      </button>

                      {data?.list?.userId && data.list.userId !== currentUserId && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowHeaderMenu(false);
                            handleAdminBlockUser();
                          }}
                          className="w-full text-left px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <Ban className="w-4 h-4 text-rose-500" />
                          Block Curator
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Full-Width Single Line Metadata Chips Bar */}
        <div className="pt-3.5 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center gap-2 text-xs overflow-x-auto hover-scrollbar">
          <div className="flex items-center gap-1.5 bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 rounded-xl px-3 py-1 text-slate-600 dark:text-slate-300 shrink-0 whitespace-nowrap">
            <span className="text-slate-400 dark:text-slate-500 font-medium">Curated by</span>
            <button
              type="button"
              onClick={() => list.userId && setSelectedUserId(list.userId)}
              className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 group/user transition-colors cursor-pointer text-left"
            >
              {list.userAvatarUrl ? (
                <img
                  src={list.userAvatarUrl}
                  alt={list.userName || 'User'}
                  className="w-4 h-4 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                />
              ) : (
                <div className="w-4 h-4 rounded-full bg-blue-600 text-white font-bold text-[8px] flex items-center justify-center shrink-0">
                  {(list.userName?.[0] || 'U').toUpperCase()}
                </div>
              )}
              <span className="underline-offset-2 group-hover/user:underline">{list.userName || 'Community User'}</span>
            </button>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 font-medium text-xs shrink-0 whitespace-nowrap">
            <Building2 className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
            <span>
              <strong className="font-bold text-slate-900 dark:text-white">{filteredPages.length}</strong> {filteredPages.length === 1 ? 'Company' : 'Companies'}
            </span>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 font-medium text-xs shrink-0 whitespace-nowrap">
            <Briefcase className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
            <span>
              <strong className="font-bold text-slate-900 dark:text-white">{filteredJobs.length}</strong> {filteredJobs.length === 1 ? 'Open Position' : 'Open Positions'}
            </span>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 font-medium text-xs shrink-0 whitespace-nowrap">
            <Users className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
            <span>
              <strong className="font-bold text-slate-900 dark:text-white">{list.followerCount || 0}</strong> {(list.followerCount || 0) === 1 ? 'Follower' : 'Followers'}
            </span>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Monitored Pages Column */}
        <div className="lg:col-span-1 sticky top-[72px] h-[calc(100vh-88px)] flex flex-col glass-panel rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden z-10">
          {/* Sticky Column Header Bar */}
          <div className="shrink-0 p-4 sm:p-5 pb-3 bg-white/95 dark:bg-[#080c14]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 z-10">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center justify-between w-full">
              <span>Monitored Pages ({filteredPages.length})</span>
              {isMaintainer && (
                <button
                  type="button"
                  onClick={() => setShowAdd(true)}
                  className="px-2.5 py-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Page
                </button>
              )}
            </h2>
          </div>

          {/* Inner Scroll Area */}
          <div onScroll={handlePagesScroll} className="flex-1 overflow-y-auto p-4 sm:p-5 pt-3 space-y-3 hover-scrollbar">
            {filteredPages.length === 0 ? (
              <div className="p-6 text-center space-y-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto border border-blue-500/20">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {searchQuery ? `No companies match "${searchQuery}"` : 'No monitored career pages in this list yet'}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    {isMaintainer
                      ? 'Click "+ Add Page" above to paste a company career page URL (Greenhouse, Lever, Workday, etc.) and start tracking open positions.'
                      : 'Click "Suggest" above to submit a company career page URL to the list curator.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {visiblePagesList.map((p: any, idx: number) => {
                  const colorTheme = getCompanyColorTheme(p.companyName || 'Company', idx);
                  const logoUrl = getCompanyLogoUrl(p.url);

                  return (
                    <div
                      key={p.id}
                      className={`glass-card p-3.5 rounded-2xl text-xs border border-slate-200/80 dark:border-slate-800/80 border-l-4 ${colorTheme.border} ${
                        openMenuId === p.id ? 'relative z-30' : 'relative z-0'
                      }`}
                      style={{ backgroundColor: colorTheme.bgLight }}
                    >
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-sm truncate">
                          {logoUrl ? (
                            <img
                              src={logoUrl}
                              alt={p.companyName || 'Company'}
                              className="w-5 h-5 rounded object-contain bg-white p-0.5 border border-slate-200 dark:border-slate-700 shrink-0"
                            />
                          ) : (
                            <div
                              className={`w-5 h-5 rounded flex items-center justify-center font-extrabold text-[10px] ${colorTheme.bg} ${colorTheme.text} shrink-0`}
                            >
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
                          <div className="relative shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(openMenuId === p.id ? null : p.id);
                              }}
                              className="p-1 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Company Actions"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {openMenuId === p.id && (
                              <div
                                ref={menuRef}
                                className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
                              >
                                <button
                                  type="button"
                                  onClick={() => handleSyncPage(p.id, p.companyName || 'Company')}
                                  disabled={scrapingMap[p.id]}
                                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  <RefreshCw className={`w-3.5 h-3.5 text-blue-500 ${scrapingMap[p.id] ? 'animate-spin' : ''}`} />
                                  <span>{scrapingMap[p.id] ? 'Syncing...' : 'Sync Postings'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    setEditingCompany(p);
                                    setEditCompanyNameStr(p.companyName || '');
                                    setEditCompanyUrlStr(p.url || '');
                                  }}
                                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5 text-blue-500" />
                                  <span>Edit Details</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleTogglePauseCompany(p.id, !p.isPaused, p.companyName || 'Company')}
                                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer"
                                >
                                  <PauseCircle className={`w-3.5 h-3.5 ${p.isPaused ? 'text-emerald-500' : 'text-amber-500'}`} />
                                  <span>{p.isPaused ? 'Resume Monitoring' : 'Pause Monitoring'}</span>
                                </button>

                                <div className="my-1 border-t border-slate-200 dark:border-slate-800" />

                                <button
                                  type="button"
                                  onClick={() => handleDeleteCareerPage(p.id, p.companyName || 'Company')}
                                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                  <span>Remove from List</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline truncate block text-[11px] font-mono"
                      >
                        {p.url}
                      </a>
                    </div>
                  );
                })}

                {pagesLimit < filteredPages.length && (
                  <div className="text-center py-2 text-[11px] font-semibold text-slate-400 dark:text-slate-500 animate-pulse">
                    Scroll to load more pages ({visiblePagesList.length} of {filteredPages.length})...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Detected Jobs Feed Column */}
        <div className="lg:col-span-2 sticky top-[72px] h-[calc(100vh-88px)] flex flex-col glass-panel rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden z-10">
          {/* Sticky Column Header Bar */}
          <div className="shrink-0 p-4 sm:p-5 pb-3 bg-white/95 dark:bg-[#080c14]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 z-10 flex items-center justify-between gap-3">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white shrink-0">
              Active Open Positions ({filteredJobs.length})
            </h2>

            <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-2 shrink-0">
              <div className="flex items-center bg-slate-100 dark:bg-slate-900/90 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => handleJobViewChange('grid')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                    jobViewMode === 'grid'
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
                  onClick={() => handleJobViewChange('tiles')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                    jobViewMode === 'tiles'
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
                  onClick={() => handleJobViewChange('table')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                    jobViewMode === 'table'
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Table List View"
                >
                  <List className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Table List</span>
                </button>
              </div>

              <div className="relative w-full sm:w-48">
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

          {/* Inner Scroll Area */}
          <div onScroll={handleJobsScroll} className="flex-1 overflow-y-auto p-4 sm:p-5 pt-3 space-y-3 hover-scrollbar">
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
                  <p className="text-xs text-slate-500 dark:text-slate-400">No active positions currently reported.</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {jobViewMode === 'grid' ? (
                  <div className="space-y-3">
                    {visibleJobsList.map((j: any) => {
                      const compIdx =
                        companyIndexMap.get(j.careerPageId) ??
                        companyIndexMap.get(((j.companyName || j.rawData?.company || '') as string).toLowerCase().trim());
                      return <JobCard key={j.id} job={j} companyIndex={compIdx} />;
                    })}
                  </div>
                ) : jobViewMode === 'tiles' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {visibleJobsList.map((j: any) => {
                      const compIdx =
                        companyIndexMap.get(j.careerPageId) ??
                        companyIndexMap.get(((j.companyName || j.rawData?.company || '') as string).toLowerCase().trim());
                      return <JobCard key={j.id} job={j} companyIndex={compIdx} />;
                    })}
                  </div>
                ) : (
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
                          {visibleJobsList.map((j: any) => (
                            <tr key={j.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors">
                              <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">{j.title}</td>
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
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors"
                                >
                                  Apply <ArrowLeft className="w-3 h-3 rotate-180" />
                                </a>
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
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080c14] text-slate-900 dark:text-slate-100 flex flex-col justify-between transition-colors">
      {!isDashboard && <Navbar showBackHome />}

      <div className="p-6 md:p-12 w-full flex-1">
        {mainContent}
      </div>

      {/* Edit Watch List Details Modal */}
      {mounted && showEditListModal && data?.list && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Edit Watch List Details
              </h3>
              <button
                type="button"
                onClick={() => setShowEditListModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditListSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Watch List Name <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={editListNameInputRef}
                  type="text"
                  required
                  value={editListName}
                  onChange={e => setEditListName(e.target.value)}
                  placeholder="e.g. First Watchlist, Top Tech Companies"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Description &amp; Details
                </label>
                <textarea
                  rows={4}
                  value={editListDescription}
                  onChange={e => setEditListDescription(e.target.value)}
                  placeholder="Describe the purpose or details of this watch list..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600 transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Visibility Settings
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditListVisibility('public')}
                    className={`p-3 rounded-2xl border text-left transition-all flex flex-col gap-1 cursor-pointer ${
                      editListVisibility === 'public'
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Globe className="w-3.5 h-3.5 text-emerald-500" />
                      Public Watchlist
                    </div>
                    <p className="text-[11px] opacity-75 leading-snug">Visible in community directory and shareable via link</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditListVisibility('private')}
                    className={`p-3 rounded-2xl border text-left transition-all flex flex-col gap-1 cursor-pointer ${
                      editListVisibility === 'private'
                        ? 'bg-slate-200 dark:bg-slate-800 border-slate-400 dark:border-slate-600 text-slate-900 dark:text-white'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                      Private Watchlist
                    </div>
                    <p className="text-[11px] opacity-75 leading-snug">Only accessible by you and invited collaborators</p>
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditListModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={savingList || !editListName.trim()}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {savingList ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Add Career Page Modal */}
      {mounted && showAdd && data?.list && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Add Career Page to Watch List
              </h3>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddPage} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Career Page URL <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={addUrlInputRef}
                  type="url"
                  required
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://careers.company.com or https://company.com/careers"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Company Name (Optional)
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="e.g. Stripe, Acme Corp"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Alert Keywords (Optional)
                </label>
                <p className="text-[11px] text-slate-500 mb-1.5">Comma separated list of keywords to filter jobs (e.g. Software, Senior, Remote)</p>
                <input
                  type="text"
                  value={keywords}
                  onChange={e => setKeywords(e.target.value)}
                  placeholder="e.g. Frontend, Fullstack, Python"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600 transition-all"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={adding || !url.trim()}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {adding ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Adding Page...
                    </>
                  ) : (
                    'Add Career Page'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Company Details Modal */}
      {mounted && editingCompany && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Edit Company Details
              </h3>
              <button
                type="button"
                onClick={() => setEditingCompany(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditCompanySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Company Name <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={editCompanyInputRef}
                  type="text"
                  required
                  value={editCompanyNameStr}
                  onChange={e => setEditCompanyNameStr(e.target.value)}
                  placeholder="e.g. Stripe"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Career Page URL <span className="text-rose-500">*</span>
                </label>
                <input
                  type="url"
                  required
                  value={editCompanyUrlStr}
                  onChange={e => setEditCompanyUrlStr(e.target.value)}
                  placeholder="https://company.com/careers"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600 transition-all"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCompany(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={updatingCompany || !editCompanyNameStr.trim() || !editCompanyUrlStr.trim()}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {updatingCompany ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
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
                <XCircle className="w-5 h-5" />
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

      {/* Suggest Company Modal */}
      {mounted && showSuggestModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-amber-500" />
                Suggest Company Page
              </h3>
              <button
                type="button"
                onClick={() => setShowSuggestModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {suggestSuccess ? (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold text-center space-y-1">
                <CheckCircle className="w-6 h-6 mx-auto text-emerald-500" />
                <p>{suggestSuccess}</p>
              </div>
            ) : (
              <form onSubmit={handleSuggestCompany} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Career Page URL <span className="text-rose-500">*</span>
                  </label>
                  <input
                    ref={suggestInputRef}
                    type="url"
                    required
                    value={suggestUrl}
                    onChange={e => setSuggestUrl(e.target.value)}
                    placeholder="https://company.com/careers"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Company Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={suggestCompany}
                    onChange={e => setSuggestCompany(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSuggestModal(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={suggestSubmitting || !suggestUrl.trim()}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {suggestSubmitting ? 'Submitting...' : 'Submit Suggestion'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Suggestions Modal (For Maintainers) */}
      {mounted && showContributionsModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-amber-500" />
                Community Suggestions
              </h3>
              <button
                type="button"
                onClick={() => setShowContributionsModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

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

            <div className="flex items-center justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowContributionsModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Collaborators Modal */}
      {mounted && showCollaboratorsModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-purple-500" />
                List Co-Maintainers
              </h3>
              <button
                type="button"
                onClick={() => setShowCollaboratorsModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              Invite registered users to co-curate and manage <strong>{data?.list?.name}</strong>.
            </p>

            <form onSubmit={handleAddCollaborator} className="flex gap-2">
              <input
                ref={collabEmailInputRef}
                type="email"
                required
                value={collabEmail}
                onChange={e => setCollabEmail(e.target.value)}
                placeholder="user@example.com"
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
              />
              <button
                type="submit"
                disabled={collabSubmitting}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-md cursor-pointer disabled:opacity-50"
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

            <div className="flex items-center justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
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

      {/* Sign In Required Modal */}
      {mounted && showAuthRequiredModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-8 space-y-5 shadow-2xl text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto border border-blue-500/20 shadow-inner">
              <Bell className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Sign In to Follow Watchlists
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                You need a JobPingly account to subscribe to <strong>{data?.list?.name}</strong>, set custom keyword filters, and receive automated job offer email alerts.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <Link
                href={`/login?redirect=/lists/${listSlug || listId}`}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md block transition-all"
              >
                Sign In Now
              </Link>
              <Link
                href={`/register?redirect=/lists/${listSlug || listId}`}
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
        </div>,
        document.body
      )}

      <PublicUserProfileModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
      {!isDashboard && <Footer />}
    </div>
  );
}
