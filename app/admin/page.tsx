'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  ShieldAlert, Cpu, Zap, RefreshCw, Flag, Layers, Users, Activity, History, UserCheck,
  ExternalLink, Play, Search, ArrowLeft, Mail, CheckCircle2, Clock, XCircle, Plus, CheckCheck, CheckSquare, Square, PauseCircle, PlayCircle, Timer, Sliders, ChevronLeft, ChevronRight, Lock, Trash2, Ban, MailCheck, UserX, Edit3, Globe, Eye, X,
  LayoutGrid, Grid2X2, List, Crown, GitFork
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { PublicUserProfileModal } from '@/components/PublicUserProfileModal';
import { Badge } from '@/components/Badge';

export default function AdminDashboardPage() {
  const toast = useToast();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'emails' | 'users' | 'watchlists' | 'unverified' | 'issues' | 'audit'>('overview');
  const [data, setData] = useState<any>(null);
  const [flags, setFlags] = useState<any[]>([]);
  const [userList, setUserList] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Watch Lists Paginated State (Admin Moderation)
  const [watchlistList, setWatchlistList] = useState<any[]>([]);
  const [watchlistPage, setWatchlistPage] = useState(1);
  const [watchlistLimit, setWatchlistLimit] = useState(10);
  const [watchlistPagination, setWatchlistPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [watchlistSearch, setWatchlistSearch] = useState('');
  const [debouncedWatchlistSearch, setDebouncedWatchlistSearch] = useState('');
  const [watchlistVisibilityFilter, setWatchlistVisibilityFilter] = useState<'all' | 'public' | 'private'>('all');
  const [watchlistCanonicalFilter, setWatchlistCanonicalFilter] = useState<'all' | 'canonical' | 'non-canonical'>('all');
  const [watchlistUserIdFilter, setWatchlistUserIdFilter] = useState('');
  const [loadingWatchlists, setLoadingWatchlists] = useState(false);
  const [watchlistViewMode, setWatchlistViewMode] = useState<'grid' | 'tiles' | 'table'>('grid');

  // Watch List Edit Modal State
  const [editingWatchlist, setEditingWatchlist] = useState<any>(null);
  const [editWatchlistName, setEditWatchlistName] = useState('');
  const [editWatchlistSlug, setEditWatchlistSlug] = useState('');
  const [editWatchlistDescription, setEditWatchlistDescription] = useState('');
  const [editWatchlistVisibility, setEditWatchlistVisibility] = useState<'public' | 'private'>('private');
  const [editWatchlistIsCanonical, setEditWatchlistIsCanonical] = useState(true);
  const [savingWatchlist, setSavingWatchlist] = useState(false);

  // Watch Lists Multi-Select State
  const [selectedWatchlistIds, setSelectedWatchlistIds] = useState<string[]>([]);
  const [processingWatchlistBatch, setProcessingWatchlistBatch] = useState(false);

  // User Subscriptions & URLs Inspection Modal State
  const [inspectingEmail, setInspectingEmail] = useState<string | null>(null);
  const [inspectionData, setInspectionData] = useState<any>(null);
  const [loadingInspection, setLoadingInspection] = useState(false);
  const [inspectionActiveTab, setInspectionActiveTab] = useState<'subscribed' | 'owned' | 'urls'>('subscribed');

  const handleInspectSubscriptions = async (email: string) => {
    if (!email) return;
    setInspectingEmail(email);
    setLoadingInspection(true);
    setInspectionData(null);
    setInspectionActiveTab('subscribed');
    try {
      const res = await fetch(`/api/admin/user-subscriptions?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const json = await res.json();
        setInspectionData(json);
        if ((json.subscribedListsCount || 0) === 0 && (json.ownedListsCount || 0) > 0) {
          setInspectionActiveTab('owned');
        } else if ((json.totalListsCount || 0) === 0 && (json.totalUniqueUrlsCount || 0) > 0) {
          setInspectionActiveTab('urls');
        }
      } else {
        toast.error('Failed to load user subscriptions.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to inspect user subscriptions');
    } finally {
      setLoadingInspection(false);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reported Issues Paginated State
  const [issuesList, setIssuesList] = useState<any[]>([]);
  const [issuesPage, setIssuesPage] = useState(1);
  const [issuesLimit, setIssuesLimit] = useState(10);
  const [issuesPagination, setIssuesPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [issuesStatusFilter, setIssuesStatusFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved' | 'closed'>('open');
  const [issuesCategoryFilter, setIssuesCategoryFilter] = useState<string>('all');
  const [issuesSearch, setIssuesSearch] = useState('');
  const [debouncedIssuesSearch, setDebouncedIssuesSearch] = useState('');
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [openIssuesCount, setOpenIssuesCount] = useState(0);

  // Unverified Emails Paginated State
  const [unverifiedList, setUnverifiedList] = useState<any[]>([]);
  const [unverifiedPage, setUnverifiedPage] = useState(1);
  const [unverifiedLimit, setUnverifiedLimit] = useState(10);
  const [unverifiedPagination, setUnverifiedPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [unverifiedSearch, setUnverifiedSearch] = useState('');
  const [debouncedUnverifiedSearch, setDebouncedUnverifiedSearch] = useState('');
  const [loadingUnverified, setLoadingUnverified] = useState(false);

  // Email Approvals Paginated State
  const [emailApprovals, setEmailApprovals] = useState<any[]>([]);
  const [emailPage, setEmailPage] = useState(1);
  const [emailLimit, setEmailLimit] = useState(10);
  const [emailPagination, setEmailPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [loadingEmails, setLoadingEmails] = useState(false);

  // User Moderation Paginated State
  const [userPage, setUserPage] = useState(1);
  const [userLimit, setUserLimit] = useState(10);
  const [userPagination, setUserPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'admin' | 'user'>('all');
  const [debouncedUserSearch, setDebouncedUserSearch] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Audit Logs Infinite Scroll State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditHasMore, setAuditHasMore] = useState(true);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const auditSentinelRef = useRef<HTMLDivElement | null>(null);

  // Company Career Pages Search, Items Per Page & Server-Side Pagination
  const [careerPagesList, setCareerPagesList] = useState<any[]>([]);
  const [companySearch, setCompanySearch] = useState('');
  const [debouncedCompanySearch, setDebouncedCompanySearch] = useState('');
  const [companyPage, setCompanyPage] = useState(1);
  const [companyLimit, setCompanyLimit] = useState(10);
  const [companyPagination, setCompanyPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [loadingPages, setLoadingPages] = useState(false);

  // Multi-select state for Company Career Pages
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [deletingCompanyId, setDeletingCompanyId] = useState<string | null>(null);
  const [processingCompanyBatch, setProcessingCompanyBatch] = useState(false);

  const [loading, setLoading] = useState(true);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [emailSearch, setEmailSearch] = useState('');
  const [debouncedEmailSearch, setDebouncedEmailSearch] = useState('');
  const [emailStatusFilter, setEmailStatusFilter] = useState<'all' | 'pending' | 'approved' | 'unapproved'>('pending');

  // Multi-select state
  const [selectedEmailIds, setSelectedEmailIds] = useState<string[]>([]);
  const [processingBatch, setProcessingBatch] = useState(false);

  // Manual Add Email Modal State
  const [showAddEmailModal, setShowAddEmailModal] = useState(false);
  const [manualEmail, setManualEmail] = useState('');
  const [addingEmail, setAddingEmail] = useState(false);

  // Manual Add Company Modal State
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [newCompanyUrl, setNewCompanyUrl] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyInterval, setNewCompanyInterval] = useState(180);
  const [addingCompany, setAddingCompany] = useState(false);

  // Flexible Custom Time Modal State
  const [showCustomTimerModal, setShowCustomTimerModal] = useState(false);
  const [customTargetType, setCustomTargetType] = useState<'global' | 'page'>('global');
  const [customPageId, setCustomPageId] = useState<string | null>(null);
  const [customPageStatus, setCustomPageStatus] = useState<string>('active');
  const [customValue, setCustomValue] = useState(2);
  const [customUnit, setCustomUnit] = useState<number>(60); // 1=mins, 60=hrs, 1440=days, 10080=weeks, 43200=months, 525600=years

  // Test Email Dispatcher Modal State
  const [showTestEmailModal, setShowTestEmailModal] = useState(false);
  const [testRecipientEmail, setTestRecipientEmail] = useState('');
  const [testEmailTemplate, setTestEmailTemplate] = useState<'otp' | 'digest' | 'custom'>('otp');
  const [testCustomSubject, setTestCustomSubject] = useState('');
  const [testCustomMessage, setTestCustomMessage] = useState('');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  // Debounce search input for company pages (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedCompanySearch(companySearch);
      setCompanyPage(1); // Reset to page 1 on new search term
    }, 300);
    return () => clearTimeout(handler);
  }, [companySearch]);

  // Debounce search input for email approvals (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedEmailSearch(emailSearch);
      setEmailPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [emailSearch]);

  const fetchPaginatedCareerPages = async (page: number, search: string, limit: number) => {
    setLoadingPages(true);
    try {
      const res = await fetch(`/api/admin/career-pages?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`);
      if (res.ok) {
        const json = await res.json();
        setCareerPagesList(json.careerPages || []);
        setCompanyPagination(json.pagination || { total: 0, page: 1, limit, totalPages: 1 });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPages(false);
    }
  };

  const [pendingEmailsCountState, setPendingEmailsCountState] = useState<number | null>(null);

  const fetchPaginatedEmails = async (p: number, q: string, l: number, status: string) => {
    setLoadingEmails(true);
    try {
      const res = await fetch(`/api/admin/emails?page=${p}&limit=${l}&status=${status}&search=${encodeURIComponent(q)}`);
      if (res.ok) {
        const json = await res.json();
        setEmailApprovals(json.emailApprovals || []);
        setEmailPagination(json.pagination || { total: 0, page: p, limit: l, totalPages: 1 });
        if (json.pendingCount !== undefined) {
          setPendingEmailsCountState(json.pendingCount);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingEmails(false);
    }
  };

  // User search debounce (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedUserSearch(userSearch);
      setUserPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [userSearch]);

  const fetchPaginatedUsers = async (p: number, q: string, l: number, r: string) => {
    setLoadingUsers(true);
    try {
      const res = await fetch(`/api/admin/users?page=${p}&limit=${l}&search=${encodeURIComponent(q)}&role=${r}`);
      if (res.ok) {
        const json = await res.json();
        setUserList(json.users || []);
        setUserPagination(json.pagination || { total: 0, page: p, limit: l, totalPages: 1 });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingUsers(false);
    }
  };
  // Unverified emails search debounce (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedUnverifiedSearch(unverifiedSearch);
      setUnverifiedPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [unverifiedSearch]);

  const fetchUnverifiedUsers = async (p: number, q: string, l: number) => {
    setLoadingUnverified(true);
    try {
      const res = await fetch(`/api/admin/unverified-emails?page=${p}&limit=${l}&search=${encodeURIComponent(q)}`);
      if (res.ok) {
        const json = await res.json();
        setUnverifiedList(json.unverifiedUsers || []);
        setUnverifiedPagination(json.pagination || { total: 0, page: p, limit: l, totalPages: 1 });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingUnverified(false);
    }
  };

  const handleManuallyVerifyEmail = async (userId: string, email: string) => {
    if (!confirm(`Manually verify email address for '${email}'?`)) return;
    try {
      const res = await fetch(`/api/admin/unverified-emails/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify' }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(json.message || 'Email verified successfully!');
        fetchUnverifiedUsers(unverifiedPage, debouncedUnverifiedSearch, unverifiedLimit);
        loadAdminData();
      } else {
        toast.error(json.error || 'Failed to verify email');
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleResendUnverifiedOtp = async (userId: string, email: string) => {
    toast.info(`Resending verification OTP email to ${email}...`);
    try {
      const res = await fetch(`/api/admin/unverified-emails/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend' }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(json.message || 'OTP email sent!');
        fetchUnverifiedUsers(unverifiedPage, debouncedUnverifiedSearch, unverifiedLimit);
      } else {
        toast.error(json.error || 'Failed to resend OTP email');
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDeleteUnverifiedUser = async (userId: string, email: string) => {
    if (!confirm(`Delete unverified signup for '${email}'? This action cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/unverified-emails/${userId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(json.message || 'Unverified signup deleted.');
        fetchUnverifiedUsers(unverifiedPage, debouncedUnverifiedSearch, unverifiedLimit);
      } else {
        toast.error(json.error || 'Failed to delete unverified user');
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Issues search debounce (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedIssuesSearch(issuesSearch);
      setIssuesPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [issuesSearch]);

  const fetchPaginatedIssues = async (p: number, q: string, l: number, status: string, cat: string) => {
    setLoadingIssues(true);
    try {
      const res = await fetch(`/api/admin/issues?page=${p}&limit=${l}&search=${encodeURIComponent(q)}&status=${status}&category=${cat}`);
      if (res.ok) {
        const json = await res.json();
        setIssuesList(json.issues || []);
        setOpenIssuesCount(json.openCount || 0);
        setIssuesPagination(json.pagination || { total: 0, page: p, limit: l, totalPages: 1 });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingIssues(false);
    }
  };

  const handleUpdateIssueStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/admin/issues/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(json.message || `Issue status updated to ${newStatus.toUpperCase()}`);
        fetchPaginatedIssues(issuesPage, debouncedIssuesSearch, issuesLimit, issuesStatusFilter, issuesCategoryFilter);
      } else {
        toast.error(json.error || 'Failed to update issue status');
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleUpdateIssuePriority = async (id: string, newPriority: string) => {
    try {
      const res = await fetch(`/api/admin/issues/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: newPriority }),
      });
      if (res.ok) {
        toast.success(`Priority updated to ${newPriority.toUpperCase()}`);
        fetchPaginatedIssues(issuesPage, debouncedIssuesSearch, issuesLimit, issuesStatusFilter, issuesCategoryFilter);
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDeleteIssue = async (id: string) => {
    if (!confirm('Delete this reported issue?')) return;
    try {
      const res = await fetch(`/api/admin/issues/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Issue report deleted.');
        fetchPaginatedIssues(issuesPage, debouncedIssuesSearch, issuesLimit, issuesStatusFilter, issuesCategoryFilter);
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Watchlists search debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedWatchlistSearch(watchlistSearch), 300);
    return () => clearTimeout(timer);
  }, [watchlistSearch]);

  const fetchPaginatedWatchlists = async (
    p: number,
    q: string,
    l: number,
    vis: string,
    canon: string,
    uId: string
  ) => {
    setLoadingWatchlists(true);
    try {
      const url = `/api/admin/watchlists?page=${p}&limit=${l}&search=${encodeURIComponent(q)}&visibility=${vis}&canonical=${canon}&userId=${encodeURIComponent(uId)}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setWatchlistList(json.lists || []);
        setWatchlistPagination(json.pagination || { total: 0, page: 1, limit: 10, totalPages: 1 });
      } else {
        toast.error('Failed to load watchlists.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error loading watchlists');
    } finally {
      setLoadingWatchlists(false);
    }
  };

  const handleOpenEditWatchlist = (wl: any) => {
    setEditingWatchlist(wl);
    setEditWatchlistName(wl.name || '');
    setEditWatchlistSlug(wl.slug || '');
    setEditWatchlistDescription(wl.description || '');
    setEditWatchlistVisibility(wl.visibility || 'private');
    setEditWatchlistIsCanonical(wl.isCanonical !== false);
  };

  const handleSaveEditWatchlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWatchlist) return;
    setSavingWatchlist(true);
    try {
      const res = await fetch(`/api/admin/watchlists/${editingWatchlist.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editWatchlistName,
          slug: editWatchlistSlug,
          description: editWatchlistDescription,
          visibility: editWatchlistVisibility,
          isCanonical: editWatchlistIsCanonical,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update watchlist');
      toast.success('Watchlist updated successfully!');
      setEditingWatchlist(null);
      fetchPaginatedWatchlists(
        watchlistPage,
        debouncedWatchlistSearch,
        watchlistLimit,
        watchlistVisibilityFilter,
        watchlistCanonicalFilter,
        watchlistUserIdFilter
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to update watchlist');
    } finally {
      setSavingWatchlist(false);
    }
  };

  const handleDeleteWatchlist = async (listId: string, listName: string) => {
    if (!confirm(`ADMIN ACTION: Are you sure you want to permanently delete the watchlist "${listName}"?`)) return;
    try {
      const res = await fetch(`/api/admin/watchlists/${listId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to delete watchlist');
      toast.success(json.message || 'Watchlist deleted.');
      fetchPaginatedWatchlists(
        watchlistPage,
        debouncedWatchlistSearch,
        watchlistLimit,
        watchlistVisibilityFilter,
        watchlistCanonicalFilter,
        watchlistUserIdFilter
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete watchlist');
    }
  };

  const handleToggleWatchlistSelect = (id: string) => {
    setSelectedWatchlistIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllWatchlists = () => {
    const currentPageIds = watchlistList.map(l => l.id);
    const allSelected = currentPageIds.length > 0 && currentPageIds.every(id => selectedWatchlistIds.includes(id));
    if (allSelected) {
      setSelectedWatchlistIds(prev => prev.filter(id => !currentPageIds.includes(id)));
    } else {
      setSelectedWatchlistIds(prev => Array.from(new Set([...prev, ...currentPageIds])));
    }
  };

  const handleBatchWatchlistAction = async (action: 'delete' | 'make_public' | 'make_private' | 'make_canonical') => {
    if (selectedWatchlistIds.length === 0) return;
    const actionLabel = action === 'delete' ? 'delete' : action === 'make_public' ? 'make public' : action === 'make_private' ? 'make private' : 'mark as verified canonical';
    if (!confirm(`ADMIN ACTION: Are you sure you want to ${actionLabel} ${selectedWatchlistIds.length} selected watchlist(s)?`)) return;

    setProcessingWatchlistBatch(true);
    try {
      const res = await fetch('/api/admin/watchlists/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, listIds: selectedWatchlistIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Batch action failed');
      toast.success(json.message || 'Batch action completed successfully!');
      setSelectedWatchlistIds([]);
      fetchPaginatedWatchlists(
        watchlistPage,
        debouncedWatchlistSearch,
        watchlistLimit,
        watchlistVisibilityFilter,
        watchlistCanonicalFilter,
        watchlistUserIdFilter
      );
    } catch (err: any) {
      toast.error(err.message || 'Batch action failed');
    } finally {
      setProcessingWatchlistBatch(false);
    }
  };

  const handleTabChange = (tab: 'overview' | 'emails' | 'users' | 'watchlists' | 'unverified' | 'issues' | 'audit') => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState({}, '', url.toString());
      try {
        localStorage.setItem('admin_active_tab', tab);
      } catch {}
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlTab = params.get('tab') as any;
      const savedTab = localStorage.getItem('admin_active_tab') as any;
      const validTabs = ['overview', 'emails', 'users', 'watchlists', 'unverified', 'issues', 'audit'];
      const initialTab = validTabs.includes(urlTab) ? urlTab : validTabs.includes(savedTab) ? savedTab : 'overview';
      if (initialTab !== activeTab) {
        setActiveTab(initialTab);
      }
    }
    // Initial fetch for badge counts
    fetchUnverifiedUsers(1, '', 10);
    fetchPaginatedIssues(1, '', 10, 'open', 'all');

    // Trigger immediate background sync check for due links
    fetch('/api/admin/career-pages/cron-check', { method: 'POST' }).catch(() => null);

    // Periodic background auto-sync runner for due links (every 60s)
    const autoSyncInterval = setInterval(() => {
      fetch('/api/admin/career-pages/cron-check', { method: 'POST' }).catch(() => null);
    }, 60000);

    return () => clearInterval(autoSyncInterval);
  }, []);

  useEffect(() => {
    if (activeTab === 'overview') {
      fetchPaginatedCareerPages(companyPage, debouncedCompanySearch, companyLimit);
    } else if (activeTab === 'emails') {
      fetchPaginatedEmails(emailPage, debouncedEmailSearch, emailLimit, emailStatusFilter);
    } else if (activeTab === 'users') {
      fetchPaginatedUsers(userPage, debouncedUserSearch, userLimit, userRoleFilter);
    } else if (activeTab === 'watchlists') {
      fetchPaginatedWatchlists(
        watchlistPage,
        debouncedWatchlistSearch,
        watchlistLimit,
        watchlistVisibilityFilter,
        watchlistCanonicalFilter,
        watchlistUserIdFilter
      );
    } else if (activeTab === 'unverified') {
      fetchUnverifiedUsers(unverifiedPage, debouncedUnverifiedSearch, unverifiedLimit);
    } else if (activeTab === 'issues') {
      fetchPaginatedIssues(issuesPage, debouncedIssuesSearch, issuesLimit, issuesStatusFilter, issuesCategoryFilter);
    }
  }, [
    companyPage, debouncedCompanySearch, companyLimit,
    emailPage, debouncedEmailSearch, emailLimit, emailStatusFilter,
    userPage, debouncedUserSearch, userLimit, userRoleFilter,
    watchlistPage, debouncedWatchlistSearch, watchlistLimit, watchlistVisibilityFilter, watchlistCanonicalFilter, watchlistUserIdFilter,
    unverifiedPage, debouncedUnverifiedSearch, unverifiedLimit,
    issuesPage, debouncedIssuesSearch, issuesLimit, issuesStatusFilter, issuesCategoryFilter,
    activeTab
  ]);

  // Audit Logs fetch helper
  const fetchAuditLogsPage = async (pageToFetch: number, append = false) => {
    setLoadingAudit(true);
    try {
      const res = await fetch(`/api/admin/audit?page=${pageToFetch}&limit=20`);
      if (res.ok) {
        const json = await res.json();
        const newLogs = json.auditLogs || [];
        setAuditLogs(prev => append ? [...prev, ...newLogs] : newLogs);
        setAuditHasMore(json.pagination?.hasMore ?? false);
        setAuditPage(pageToFetch);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAuditLogsPage(1, false);
    }
  }, [activeTab]);

  // IntersectionObserver for Infinite Scroll on Audit Log Tab
  useEffect(() => {
    if (activeTab !== 'audit' || !auditHasMore || loadingAudit) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && auditHasMore && !loadingAudit) {
          fetchAuditLogsPage(auditPage + 1, true);
        }
      },
      { threshold: 0.5 }
    );

    const currentSentinel = auditSentinelRef.current;
    if (currentSentinel) {
      observer.observe(currentSentinel);
    }

    return () => {
      if (currentSentinel) {
        observer.unobserve(currentSentinel);
      }
    };
  }, [activeTab, auditHasMore, loadingAudit, auditPage]);

  const handleLimitChange = (newLimit: number) => {
    setCompanyLimit(newLimit);
    setCompanyPage(1);
  };

  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    fetch('/api/me')
      .then(res => res.ok ? res.json() : null)
      .then(d => { if (d?.user) setCurrentUser(d.user); })
      .catch(() => setCurrentUser(null));
  }, []);

  const loadAdminData = async (retryCount = 0) => {
    try {
      const [overviewRes, flagsRes, usersRes] = await Promise.all([
        fetch('/api/admin/overview'),
        fetch('/api/admin/flags'),
        fetch('/api/admin/users'),
      ]);

      if (overviewRes.status === 401 && retryCount < 1) {
        // Access token expired, attempt refresh
        const refreshRes = await fetch('/api/auth/refresh', { method: 'POST' });
        if (refreshRes.ok) {
          return loadAdminData(retryCount + 1);
        }
      }

      if (overviewRes.ok) {
        const json = await overviewRes.json();
        setData(json);
        if (json.metrics?.pendingEmailsCount !== undefined) {
          setPendingEmailsCountState(json.metrics.pendingEmailsCount);
        }
      }
      if (flagsRes.ok) {
        const fJson = await flagsRes.json();
        setFlags(fJson.flags || []);
      }
      if (usersRes.ok) {
        const uJson = await usersRes.json();
        setUserList(uJson.users || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  // Flags & Limits
  const autoApproveFlag = flags.find(f => f.key === 'email.auto_approve_enabled');
  const isAutoApproveOn = autoApproveFlag?.value === true || autoApproveFlag?.value === 'true';

  const globalTimerFlag = flags.find(f => f.key === 'scraper.use_global_timer');
  const isGlobalTimerOn = globalTimerFlag ? (globalTimerFlag.value === true || globalTimerFlag.value === 'true') : true;

  const globalIntervalFlag = flags.find(f => f.key === 'scraper.global_check_interval_minutes');
  const globalIntervalMinutes = globalIntervalFlag ? Number(globalIntervalFlag.value) || 180 : 180;

  // System Quota Flags
  const maxListsFlag = flags.find(f => f.key === 'limits.max_lists_per_user');
  const maxListsPerUser = maxListsFlag ? Number(maxListsFlag.value) : 10;

  const maxUrlsFlag = flags.find(f => f.key === 'limits.max_urls_per_list');
  const maxUrlsPerList = maxUrlsFlag ? Number(maxUrlsFlag.value) : 25;

  const maxKeywordsFlag = flags.find(f => f.key === 'limits.max_keywords_per_sub');
  const maxKeywordsPerSub = maxKeywordsFlag ? Number(maxKeywordsFlag.value) : 20;

  const handleUpdateQuotaFlag = async (key: string, value: number) => {
    await fetch('/api/admin/flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
    const label = value === -1 ? 'Unlimited' : value;
    toast.success(`System quota updated to ${label}!`);
    loadAdminData();
  };

  const handleQuotaSelectChange = (key: string, rawVal: string, currentVal: number) => {
    if (rawVal === 'custom') {
      const input = prompt(`Enter custom numerical limit for '${key}':`, currentVal > 0 ? String(currentVal) : '15');
      if (input !== null) {
        const num = Number(input.trim());
        if (!isNaN(num)) {
          handleUpdateQuotaFlag(key, num <= 0 ? -1 : num);
        } else {
          toast.error('Invalid number entered');
        }
      }
    } else {
      handleUpdateQuotaFlag(key, Number(rawVal));
    }
  };

  const handleToggleAutoApprove = async () => {
    const newValue = !isAutoApproveOn;
    await fetch('/api/admin/flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'email.auto_approve_enabled', value: newValue }),
    });
    toast.success(`Auto Approve New Emails is now ${newValue ? 'ENABLED' : 'DISABLED'}`);
    loadAdminData();
  };

  const handleToggleBlockUser = async (userId: string, currentBlocked: boolean, userEmail: string, isEnvAdmin: boolean) => {
    if (isEnvAdmin) {
      toast.error('ENV Superadmin account cannot be blocked.');
      return;
    }

    let reason: string | null = null;
    if (!currentBlocked) {
      const input = prompt(`Enter block/suspension reason for ${userEmail}:`, 'Violated terms / abuse');
      if (input === null) return; // Cancelled
      reason = input.trim() || 'Blocked by administrator';
    }

    try {
      const res = await fetch(`/api/admin/users/${userId}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block: !currentBlocked, reason }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to update user block status');
      }
      toast.success(json.message || `User block status updated.`);
      fetchPaginatedUsers(userPage, debouncedUserSearch, userLimit, userRoleFilter);
    } catch (err: any) {
      toast.error(err.message || 'Error updating user block status');
    }
  };

  const openTestEmailModalFor = (email?: string) => {
    setTestRecipientEmail(email || '');
    setTestEmailTemplate('otp');
    setTestCustomSubject('');
    setTestCustomMessage('');
    setShowTestEmailModal(true);
  };

  const handleSendTestEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testRecipientEmail || !testRecipientEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }
    setSendingTestEmail(true);
    try {
      const res = await fetch('/api/admin/emails/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: testRecipientEmail,
          template: testEmailTemplate,
          customSubject: testCustomSubject,
          customMessage: testCustomMessage,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to send test email.');
      }
      toast.success(json.message || 'Test email dispatched successfully via Brevo!');
      setShowTestEmailModal(false);
    } catch (err: any) {
      toast.error(err.message || 'Error sending test email');
    } finally {
      setSendingTestEmail(false);
    }
  };

  const handleToggleGlobalTimer = async () => {
    const newValue = !isGlobalTimerOn;
    await fetch('/api/admin/flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'scraper.use_global_timer', value: newValue }),
    });
    toast.success(`Master Scrape Timer for all sites is now ${newValue ? 'ENABLED' : 'DISABLED'}`);
    loadAdminData();
  };

  const handleUpdateGlobalInterval = async (intervalMins: number) => {
    await fetch('/api/admin/flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'scraper.global_check_interval_minutes', value: intervalMins }),
    });
    toast.success(`Global Master Scrape Interval updated to ${intervalMins} minutes!`);
    loadAdminData();
  };

  const [syncingAll, setSyncingAll] = useState(false);

  const handleSyncAllPages = async () => {
    if (!careerPagesList || careerPagesList.length === 0) return;
    setSyncingAll(true);
    toast.info(`Checking updates for all ${careerPagesList.length} monitored company career pages...`);

    let totalFound = 0;
    let totalAdded = 0;

    for (const p of careerPagesList) {
      try {
        const res = await fetch(`/api/career-pages/${p.id}`, { method: 'POST' });
        const json = await res.json();
        if (res.ok) {
          totalFound += json.result?.jobsFound || 0;
          totalAdded += json.result?.jobsAdded || 0;
        }
      } catch {
        // continue
      }
    }

    toast.success(`Check complete! Found ${totalFound} jobs (${totalAdded} new added).`);
    fetchPaginatedCareerPages(companyPage, debouncedCompanySearch, companyLimit);
    setSyncingAll(false);
  };

  const handleForceScrape = async (pageId: string) => {
    setTriggeringId(pageId);
    try {
      const res = await fetch(`/api/admin/career-pages/${pageId}/scrape`, { method: 'POST' });
      const json = await res.json();
      const found = json.result?.jobsFound || 0;
      const added = json.result?.jobsAdded || 0;
      if (found === 0) {
        toast.success('Check completed! No active jobs found on page.');
      } else if (added > 0) {
        toast.success(`Check completed! Found ${found} job${found === 1 ? '' : 's'} (${added} new added).`);
      } else {
        toast.success(`Check completed! Found ${found} job${found === 1 ? '' : 's'} (all up to date).`);
      }
      fetchPaginatedCareerPages(companyPage, debouncedCompanySearch, companyLimit);
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setTriggeringId(null);
    }
  };

  // Toggle monitoring status (active vs paused) or change check interval
  const handleUpdatePageMonitoring = async (pageId: string, currentStatus: string, checkIntervalMinutes?: number) => {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';
    try {
      const res = await fetch(`/api/admin/career-pages/${pageId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, checkIntervalMinutes }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(`Career page monitoring set to ${newStatus.toUpperCase()}`);
        fetchPaginatedCareerPages(companyPage, debouncedCompanySearch, companyLimit);
      } else {
        toast.error(json.error || 'Failed to update page status');
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleChangeInterval = async (pageId: string, currentStatus: string, intervalMins: number) => {
    try {
      const res = await fetch(`/api/admin/career-pages/${pageId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: currentStatus, checkIntervalMinutes: intervalMins }),
      });
      if (res.ok) {
        toast.success(`Check interval updated to ${formatMins(intervalMins)}!`);
        fetchPaginatedCareerPages(companyPage, debouncedCompanySearch, companyLimit);
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleSaveCustomTimer = async () => {
    const totalMins = Math.max(1, Math.round(customValue * customUnit));
    if (customTargetType === 'global') {
      await handleUpdateGlobalInterval(totalMins);
    } else if (customPageId) {
      await handleChangeInterval(customPageId, customPageStatus, totalMins);
    }
    setShowCustomTimerModal(false);
  };

  function formatMins(mins: number): string {
    if (!mins || mins <= 0) return '3 hours';
    if (mins % 525600 === 0) {
      const yrs = mins / 525600;
      return `${yrs} year${yrs > 1 ? 's' : ''}`;
    }
    if (mins % 43200 === 0) {
      const m = mins / 43200;
      return `${m} month${m > 1 ? 's' : ''}`;
    }
    if (mins % 10080 === 0) {
      const w = mins / 10080;
      return `${w} week${w > 1 ? 's' : ''}`;
    }
    if (mins % 1440 === 0) {
      const d = mins / 1440;
      return `${d} day${d > 1 ? 's' : ''}`;
    }
    if (mins % 60 === 0) {
      const h = mins / 60;
      return `${h} hour${h > 1 ? 's' : ''}`;
    }
    return `${mins} mins`;
  }

  const handleToggleFlag = async (key: string, currentValue: boolean) => {
    const newValue = !currentValue;

    // For limit flags, turning OFF sets value to -1 (Unlimited), turning ON sets default limit (e.g. 10 / 25 / 20)
    let payloadValue: any = newValue;
    if (key.startsWith('limits.')) {
      if (!newValue) {
        payloadValue = -1; // Unlimited when OFF
      } else {
        payloadValue = key.includes('list') ? 10 : key.includes('url') ? 25 : 20;
      }
    }

    await fetch('/api/admin/flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: payloadValue }),
    });

    if (key.startsWith('limits.')) {
      toast.success(`Quota limit '${key}' set to ${!newValue ? 'UNLIMITED (OFF)' : 'ACTIVE (ON)'}`);
    } else {
      toast.success(`Feature flag '${key}' set to ${newValue ? 'ENABLED' : 'DISABLED'}`);
    }
    loadAdminData();
  };

  const handleChangeRole = async (userId: string, currentRole: string, isEnvAdmin?: boolean) => {
    if (isEnvAdmin) {
      toast.error('The primary environment administrator cannot be modified or downgraded.');
      return;
    }

    const nextRole = currentRole === 'admin' ? 'user' : 'admin';
    if (!confirm(`Change role of user to '${nextRole}'?`)) return;

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: userId, newRole: nextRole }),
    });
    const json = await res.json();
    if (res.ok) {
      toast.info(`User role updated to '${nextRole}'`);
      loadAdminData();
    } else {
      toast.error(json.error || 'Failed to change user role');
    }
  };

  // Email Actions
  const handleApproveEmail = async (emailId: string) => {
    await fetch('/api/admin/emails', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailId, newStatus: 'approved' }),
    });
    toast.success('Email address approved!');
    fetchPaginatedEmails(emailPage, debouncedEmailSearch, emailLimit, emailStatusFilter);
  };

  const handleUnapproveEmail = async (emailId: string) => {
    await fetch('/api/admin/emails', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailId, newStatus: 'unapproved' }),
    });
    toast.error('Email approval revoked.');
    fetchPaginatedEmails(emailPage, debouncedEmailSearch, emailLimit, emailStatusFilter);
  };

  const handleApproveAllPending = async () => {
    if (!confirm('Approve all pending email addresses at once?')) return;
    const res = await fetch('/api/admin/emails', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve_all_pending' }),
    });
    const json = await res.json();
    toast.success(json.message || 'Approved all pending emails!');
    setSelectedEmailIds([]);
    fetchPaginatedEmails(emailPage, debouncedEmailSearch, emailLimit, emailStatusFilter);
  };

  // Batch action with single group API call
  const handleBatchProcess = async (action: 'approve' | 'unapprove') => {
    if (selectedEmailIds.length === 0) return;
    if (!confirm(`Batch ${action} ${selectedEmailIds.length} selected email(s)?`)) return;

    setProcessingBatch(true);
    try {
      const res = await fetch('/api/admin/emails/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailIds: selectedEmailIds, action }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(`Batch ${action} completed for ${json.processedCount} email(s)!`);
        setSelectedEmailIds([]);
        fetchPaginatedEmails(emailPage, debouncedEmailSearch, emailLimit, emailStatusFilter);
      } else {
        toast.error(json.error || 'Batch process failed');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessingBatch(false);
    }
  };

  const handleManualAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingEmail(true);
    try {
      const res = await fetch('/api/admin/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: manualEmail }),
      });
      if (res.ok) {
        toast.success(`Manually added '${manualEmail}' to approved emails!`);
        setManualEmail('');
        setShowAddEmailModal(false);
        fetchPaginatedEmails(emailPage, debouncedEmailSearch, emailLimit, emailStatusFilter);
      } else {
        const json = await res.json();
        toast.error(json.error || 'Failed to add email');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddingEmail(false);
    }
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyUrl.trim()) return;

    setAddingCompany(true);
    try {
      const res = await fetch('/api/admin/career-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: newCompanyUrl.trim(),
          companyName: newCompanyName.trim() || undefined,
          checkIntervalMinutes: newCompanyInterval,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        toast.success(json.message || `Added unique company '${json.careerPage.companyName}'!`);
        setNewCompanyUrl('');
        setNewCompanyName('');
        setShowAddCompanyModal(false);
        fetchPaginatedCareerPages(companyPage, debouncedCompanySearch, companyLimit);
      } else {
        toast.error(json.error || 'Failed to add company career page');
      }
    } catch (e: any) {
      toast.error(e.message || 'An error occurred');
    } finally {
      setAddingCompany(false);
    }
  };

  // Company Selection & Batch Deletion Helpers
  const isAllCompaniesSelected = careerPagesList.length > 0 && careerPagesList.every(p => selectedCompanyIds.includes(p.id));

  const toggleSelectAllCompanies = () => {
    if (isAllCompaniesSelected) {
      setSelectedCompanyIds(selectedCompanyIds.filter(id => !careerPagesList.some(p => p.id === id)));
    } else {
      const allIds = Array.from(new Set([...selectedCompanyIds, ...careerPagesList.map(p => p.id)]));
      setSelectedCompanyIds(allIds);
    }
  };

  const toggleSelectCompanyRow = (id: string) => {
    if (selectedCompanyIds.includes(id)) {
      setSelectedCompanyIds(selectedCompanyIds.filter(i => i !== id));
    } else {
      setSelectedCompanyIds([...selectedCompanyIds, id]);
    }
  };

  const handleDeleteSingleCompany = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete '${name}'? This action cannot be undone.`)) {
      return;
    }
    setDeletingCompanyId(id);
    try {
      const res = await fetch(`/api/admin/career-pages/${id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(json.message || 'Company page deleted successfully!');
        setSelectedCompanyIds(prev => prev.filter(i => i !== id));
        fetchPaginatedCareerPages(companyPage, debouncedCompanySearch, companyLimit);
      } else {
        toast.error(json.error || 'Failed to delete company page');
      }
    } catch (e: any) {
      toast.error(e.message || 'An error occurred');
    } finally {
      setDeletingCompanyId(null);
    }
  };

  const handleBatchDeleteCompanies = async () => {
    if (selectedCompanyIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedCompanyIds.length} selected company career page(s)? This action cannot be undone.`)) {
      return;
    }

    setProcessingCompanyBatch(true);
    try {
      const res = await fetch('/api/admin/career-pages/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageIds: selectedCompanyIds, action: 'delete' }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(json.message || `Deleted ${json.processedCount} company page(s)!`);
        setSelectedCompanyIds([]);
        fetchPaginatedCareerPages(companyPage, debouncedCompanySearch, companyLimit);
      } else {
        toast.error(json.error || 'Batch delete failed');
      }
    } catch (e: any) {
      toast.error(e.message || 'An error occurred');
    } finally {
      setProcessingCompanyBatch(false);
    }
  };

  const handlePurgeOrphaned = async () => {
    if (!confirm('Purge all company career page URLs that are not linked to any watch list?')) return;
    try {
      const res = await fetch('/api/admin/career-pages/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'purge_orphaned' }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(json.message || 'Purged orphaned career pages!');
        fetchPaginatedCareerPages(companyPage, debouncedCompanySearch, companyLimit);
      } else {
        toast.error(json.error || 'Failed to purge orphaned career pages');
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading Admin Control Suite..." fullPage />;
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#080c14] text-slate-900 dark:text-slate-100 flex flex-col justify-between">
        <Navbar showBackHome />
        <div className="p-6 md:p-12 max-w-xl mx-auto w-full flex-1 flex items-center justify-center">
          <div className="glass-panel p-8 sm:p-12 rounded-3xl border-slate-200 dark:border-slate-800 text-center space-y-5 shadow-2xl w-full">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Admin Access Required</h2>
            {currentUser ? (
              <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-2xl text-xs text-rose-700 dark:text-rose-400 space-y-1">
                <div>Logged in as: <strong>{currentUser.email}</strong></div>
                <div>Current Role: <span className="uppercase font-extrabold">{currentUser.role || 'user'}</span></div>
              </div>
            ) : null}
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {currentUser ? (
                <>Your account (<strong>{currentUser.email}</strong>) has the <strong>{currentUser.role || 'user'}</strong> role. You must be an <strong>admin</strong> to access this page.</>
              ) : (
                <>You must be logged in with an authorized Administrator account to view and manage the JobPingly Admin Suite.</>
              )}
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/login"
                className="w-full sm:w-auto px-6 py-3 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all text-center cursor-pointer"
              >
                Sign In as Admin
              </Link>
              <Link
                href="/"
                className="w-full sm:w-auto px-6 py-3 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition-all text-center cursor-pointer"
              >
                Return to Homepage
              </Link>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const { metrics } = data;
  const pendingEmailCount = pendingEmailsCountState ?? metrics?.pendingEmailsCount ?? 0;

  const filteredUsers = userList.filter(u =>
    u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearch.toLowerCase())
  );

  // Checkbox Selection Helpers for Email Approvals
  const isAllFilteredSelected = emailApprovals.length > 0 && emailApprovals.every(e => selectedEmailIds.includes(e.id));

  const toggleSelectAll = () => {
    if (isAllFilteredSelected) {
      setSelectedEmailIds(selectedEmailIds.filter(id => !emailApprovals.some(e => e.id === id)));
    } else {
      const allIds = Array.from(new Set([...selectedEmailIds, ...emailApprovals.map(e => e.id)]));
      setSelectedEmailIds(allIds);
    }
  };

  const toggleSelectRow = (id: string) => {
    if (selectedEmailIds.includes(id)) {
      setSelectedEmailIds(selectedEmailIds.filter(i => i !== id));
    } else {
      setSelectedEmailIds([...selectedEmailIds, id]);
    }
  };

  // Preset options checkers
  const listPresets = [-1, 5, 10, 20, 50, 100];
  const urlPresets = [-1, 10, 25, 50, 100, 250];
  const kwPresets = [-1, 10, 20, 50, 100];

  const isCustomList = !listPresets.includes(maxListsPerUser);
  const isCustomUrl = !urlPresets.includes(maxUrlsPerList);
  const isCustomKw = !kwPresets.includes(maxKeywordsPerSub);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Return to Dashboard */}
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors glass-panel px-4 py-2 rounded-xl"
        >
          <ArrowLeft className="w-4 h-4" /> Return to Dashboard
        </Link>
      </div>

      {/* Control Header & Tabs */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/20">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Admin Control Center</h1>
                <span className="px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-extrabold uppercase border border-rose-500/30">LIVE</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">System health, scraper pipeline controls, email approval queue &amp; audit trails</p>
            </div>
          </div>

          <button
            onClick={() => {
              loadAdminData();
              fetchPaginatedCareerPages(companyPage, debouncedCompanySearch, companyLimit);
              fetchPaginatedEmails(emailPage, debouncedEmailSearch, emailLimit, emailStatusFilter);
              toast.info('Admin metrics refreshed');
            }}
            className="px-4 py-2.5 rounded-xl bg-slate-900 text-white dark:bg-slate-800 dark:hover:bg-slate-700 font-semibold text-xs transition-all flex items-center gap-2 shrink-0 self-start sm:self-center cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Admin Data
          </button>
        </div>

        {/* Tab Controls Bar */}
        <div className="flex items-center gap-3 border-t border-slate-200 dark:border-slate-800/80 pt-4 flex-wrap">
          <button
            onClick={() => handleTabChange('overview')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/50'
            }`}
          >
            <Activity className="w-4 h-4" /> Overview &amp; Scrapers
          </button>

          <button
            onClick={() => handleTabChange('emails')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'emails'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/50'
            }`}
          >
            <Mail className="w-4 h-4" /> Email Approvals
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              pendingEmailCount > 0
                ? 'bg-amber-500 text-white animate-pulse'
                : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300/60 dark:border-slate-700/60'
            }`}>
              {pendingEmailCount}
            </span>
          </button>

          <button
            onClick={() => handleTabChange('users')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'users'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/50'
            }`}
          >
            <Users className="w-4 h-4" /> Users ({userList.length})
          </button>

          <button
            onClick={() => handleTabChange('watchlists')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'watchlists'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/50'
            }`}
          >
            <Layers className="w-4 h-4 text-purple-500 dark:text-purple-400" /> Watch Lists
            <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-700 dark:text-purple-300 text-[10px] font-extrabold border border-purple-500/30">
              {watchlistPagination.total}
            </span>
          </button>

          <button
            onClick={() => handleTabChange('unverified')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'unverified'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/50'
            }`}
          >
            <Clock className="w-4 h-4 text-amber-500 dark:text-amber-400" /> Unverified Emails
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-extrabold border border-amber-500/30">
              {unverifiedPagination.total}
            </span>
          </button>

          <button
            onClick={() => handleTabChange('issues')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'issues'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/50'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-rose-500" /> Reported Issues
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              openIssuesCount > 0
                ? 'bg-rose-500 text-white animate-pulse'
                : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300/60 dark:border-slate-700/60'
            }`}>
              {openIssuesCount}
            </span>
          </button>

          <button
            onClick={() => handleTabChange('audit')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/50'
            }`}
          >
            <History className="w-4 h-4" /> Audit Log ({auditLogs.length})
          </button>
        </div>
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            <div className="glass-card p-5 rounded-2xl border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">Total Users</span>
                <span className="text-3xl font-black text-slate-900 dark:text-white">{metrics.totalUsers}</span>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
            </div>

            <div className="glass-card p-5 rounded-2xl border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">Monitored Pages</span>
                <span className="text-3xl font-black text-slate-900 dark:text-white">{metrics.totalCareerPages}</span>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
            </div>

            <div className="glass-card p-5 rounded-2xl border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">Scrape Success</span>
                <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{metrics.scrapeSuccessRate}%</span>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Activity className="w-5 h-5" />
              </div>
            </div>

            <div className="glass-card p-5 rounded-2xl border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">Pending Emails</span>
                <span className="text-3xl font-black text-amber-600 dark:text-amber-400">{pendingEmailCount}</span>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Mail className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* System Quotas & User Limits Configuration Panel */}
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-5 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              System Quotas &amp; Site-Wide User Limits
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {/* Max Watch Lists */}
              <div className="glass-card p-5 rounded-2xl border-slate-200 dark:border-slate-800 space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Max Watch Lists per User
                </label>
                <select
                  value={isCustomList ? 'custom' : maxListsPerUser}
                  onChange={e => handleQuotaSelectChange('limits.max_lists_per_user', e.target.value, maxListsPerUser)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value={-1}>♾ Unlimited Lists</option>
                  <option value={5}>5 Watch Lists</option>
                  <option value={10}>10 Watch Lists (Default)</option>
                  <option value={20}>20 Watch Lists</option>
                  <option value={50}>50 Watch Lists</option>
                  <option value={100}>100 Watch Lists</option>
                  {isCustomList && (
                    <option value="custom">Custom ({maxListsPerUser})</option>
                  )}
                  <option value="custom">✏ Set Custom Value...</option>
                </select>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Enforced when users create new lists.</p>
              </div>

              {/* Max URLs per List */}
              <div className="glass-card p-5 rounded-2xl border-slate-200 dark:border-slate-800 space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Max URLs per Watch List
                </label>
                <select
                  value={isCustomUrl ? 'custom' : maxUrlsPerList}
                  onChange={e => handleQuotaSelectChange('limits.max_urls_per_list', e.target.value, maxUrlsPerList)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value={-1}>♾ Unlimited URLs</option>
                  <option value={10}>10 URLs</option>
                  <option value={25}>25 URLs (Default)</option>
                  <option value={50}>50 URLs</option>
                  <option value={100}>100 URLs</option>
                  <option value={250}>250 URLs</option>
                  {isCustomUrl && (
                    <option value="custom">Custom ({maxUrlsPerList})</option>
                  )}
                  <option value="custom">✏ Set Custom Value...</option>
                </select>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Enforced when adding career pages to a list.</p>
              </div>

              {/* Max Keywords */}
              <div className="glass-card p-5 rounded-2xl border-slate-200 dark:border-slate-800 space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Max Keywords per Filter
                </label>
                <select
                  value={isCustomKw ? 'custom' : maxKeywordsPerSub}
                  onChange={e => handleQuotaSelectChange('limits.max_keywords_per_sub', e.target.value, maxKeywordsPerSub)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value={-1}>♾ Unlimited Keywords</option>
                  <option value={10}>10 Keywords</option>
                  <option value={20}>20 Keywords (Default)</option>
                  <option value={50}>50 Keywords</option>
                  <option value={100}>100 Keywords</option>
                  {isCustomKw && (
                    <option value="custom">Custom ({maxKeywordsPerSub})</option>
                  )}
                  <option value="custom">✏ Set Custom Value...</option>
                </select>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Enforced on positive keyword match filters.</p>
              </div>
            </div>
          </div>

          {/* Feature Flags */}
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Flag className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              System Feature Flags
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...flags].sort((a, b) => a.key.localeCompare(b.key)).map(f => {
                const isLimitFlag = f.key.startsWith('limits.');
                const isUnlimited = isLimitFlag && (f.value === -1 || f.value === '-1' || f.value === false || f.value === 'false');
                const isEnabled = !isUnlimited && (f.value === true || f.value === 'true' || Number(f.value) > 0);

                return (
                  <div key={f.key} className="glass-card p-4 rounded-2xl border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 block">
                        {f.key}
                      </span>
                      <span className="text-xs text-slate-600 dark:text-slate-400 block truncate max-w-[170px]">
                        {f.description || (isLimitFlag ? 'Enforced system quota limit' : 'System feature flag')}
                      </span>

                      {/* Status Badge: Displays Unlimited when OFF */}
                      {isLimitFlag ? (
                        isUnlimited ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/30 uppercase">
                            ♾ Unlimited
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/30">
                            Active Limit: {f.value === true ? 'Enforced' : `${f.value}`}
                          </span>
                        )
                      ) : (
                        <span className={`inline-flex items-center text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                          isEnabled
                            ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30'
                            : 'text-slate-500 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700'
                        }`}>
                          {isEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => handleToggleFlag(f.key, isEnabled)}
                      type="button"
                      title={isLimitFlag ? (isEnabled ? 'Click to set Unlimited (OFF)' : 'Click to Enable Limit (ON)') : 'Toggle Flag'}
                      className={`w-11 h-6 rounded-full transition-colors p-0.5 relative flex items-center cursor-pointer shrink-0 ml-3 ${
                        isEnabled ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white transition-transform transform shadow-sm ${
                          isEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Master Scrape Timer Control Bar (Placed directly above Monitored Career Pages) */}
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/20">
                  <Timer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Master Sync Timer Configuration
                    {isGlobalTimerOn && (
                      <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 text-[10px] font-extrabold uppercase">
                        MASTER TIMER ACTIVE
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    When active, all monitored company sites follow this master timer instead of individual per-site timers.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                {/* Global Timer Toggle Switch */}
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 px-3 py-2 rounded-xl">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Master Timer:
                  </span>
                  <button
                    onClick={handleToggleGlobalTimer}
                    type="button"
                    className={`w-10 h-5 rounded-full transition-colors p-0.5 relative flex items-center cursor-pointer ${
                      isGlobalTimerOn ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform transform shadow-sm ${
                        isGlobalTimerOn ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className={`text-xs font-extrabold ${isGlobalTimerOn ? 'text-purple-600 dark:text-purple-400' : 'text-slate-500'}`}>
                    {isGlobalTimerOn ? 'ON' : 'OFF'}
                  </span>
                </div>

                {/* Global Interval Dropdown */}
                {isGlobalTimerOn && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Global Period:
                    </span>
                    <select
                      value={[30, 60, 180, 360, 720, 1440, 10080, 43200].includes(globalIntervalMinutes) ? globalIntervalMinutes : 'custom'}
                      onChange={e => {
                        if (e.target.value === 'custom') {
                          setCustomTargetType('global');
                          setCustomValue(2);
                          setCustomUnit(60);
                          setShowCustomTimerModal(true);
                        } else {
                          handleUpdateGlobalInterval(Number(e.target.value));
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-purple-500/40 text-xs font-bold text-purple-700 dark:text-purple-300 focus:outline-none cursor-pointer"
                    >
                      <option value={30}>Every 30 mins</option>
                      <option value={60}>Every 1 hour</option>
                      <option value={180}>Every 3 hours</option>
                      <option value={360}>Every 6 hours</option>
                      <option value={720}>Every 12 hours</option>
                      <option value={1440}>Every 24 hours (1 day)</option>
                      <option value={10080}>Every 7 days (1 week)</option>
                      <option value={43200}>Every 30 days (1 month)</option>
                      {![30, 60, 180, 360, 720, 1440, 10080, 43200].includes(globalIntervalMinutes) && (
                        <option value="custom">Custom: Every {formatMins(globalIntervalMinutes)}</option>
                      )}
                      <option value="custom">⚙ Custom Period...</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Monitored Pages Table with Items Per Page Dropdown & Server Pagination */}
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  Monitored Company Career Pages ({companyPagination.total})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isGlobalTimerOn
                    ? `Master Timer Active: All sites auto-check every ${formatMins(globalIntervalMinutes)}.`
                    : 'Individual Timers Active: Sites check on per-site intervals.'}
                </p>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {/* Add Monitored Company Button */}
                <button
                  onClick={() => setShowAddCompanyModal(true)}
                  className="text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Company
                </button>

                {/* Check All Companies Button */}
                {careerPagesList.length > 0 && (
                  <button
                    onClick={handleSyncAllPages}
                    disabled={syncingAll}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncingAll ? 'animate-spin' : ''}`} />
                    {syncingAll ? 'Checking All...' : 'Check All Companies'}
                  </button>
                )}

                {/* Purge Orphaned URLs Button */}
                <button
                  onClick={handlePurgeOrphaned}
                  title="Remove all company career pages that are not linked to any watch list"
                  className="text-xs font-bold text-amber-700 dark:text-amber-300 hover:text-amber-800 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-amber-500" />
                  Purge Orphaned URLs
                </button>

                {/* Items Per Page Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400 shrink-0">
                    Load per page:
                  </span>
                  <select
                    value={companyLimit}
                    onChange={e => handleLimitChange(Number(e.target.value))}
                    className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 cursor-pointer"
                  >
                    <option value={10}>10 companies</option>
                    <option value={25}>25 companies</option>
                    <option value={50}>50 companies</option>
                    <option value={100}>100 companies</option>
                  </select>
                </div>

                {/* Debounced Search Bar */}
                <div className="relative w-full md:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={companySearch}
                    onChange={e => setCompanySearch(e.target.value)}
                    placeholder="Search company by name or URL..."
                    className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>
            </div>

            {/* Batch Action Bar for Company Career Pages */}
            {selectedCompanyIds.length > 0 && (
              <div className="flex items-center justify-between gap-4 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 animate-in fade-in duration-150">
                <div className="flex items-center gap-2 font-bold text-xs">
                  <CheckSquare className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <span>{selectedCompanyIds.length} company career page(s) selected</span>
                </div>
                <button
                  onClick={handleBatchDeleteCompanies}
                  disabled={processingCompanyBatch}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all"
                >
                  <Trash2 className={`w-3.5 h-3.5 ${processingCompanyBatch ? 'animate-spin' : ''}`} />
                  {processingCompanyBatch ? 'Deleting...' : `Delete Selected (${selectedCompanyIds.length})`}
                </button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm text-slate-800 dark:text-slate-200">
                <thead className="bg-slate-100 dark:bg-slate-900/90 text-slate-600 dark:text-slate-400 uppercase font-semibold border-b border-slate-200 dark:border-slate-800 text-xs">
                  <tr>
                    <th className="py-3.5 px-4 w-10 text-center">
                      <button
                        type="button"
                        onClick={toggleSelectAllCompanies}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        title={isAllCompaniesSelected ? 'Deselect All' : 'Select All'}
                      >
                        {isAllCompaniesSelected ? (
                          <CheckSquare className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="py-3.5 px-4">Company &amp; Target URL</th>
                    <th className="py-3.5 px-4">Monitoring Status</th>
                    <th className="py-3.5 px-4">Check Interval (Period)</th>
                    <th className="py-3.5 px-4">Last Checked</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
                  {loadingPages ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center">
                        <LoadingSpinner message="Loading company career pages..." fullPage={false} />
                      </td>
                    </tr>
                  ) : careerPagesList.map((p: any) => {
                    const isPaused = p.status === 'paused';
                    const isSelected = selectedCompanyIds.includes(p.id);
                    return (
                      <tr key={p.id} className={`hover:bg-slate-100/60 dark:hover:bg-slate-900/40 transition-colors ${isSelected ? 'bg-purple-50/50 dark:bg-purple-950/20' : ''}`}>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => toggleSelectCompanyRow(p.id)}
                            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="font-bold text-slate-900 dark:text-white text-sm block">{p.companyName || 'Unknown'}</span>
                          <a href={p.url} target="_blank" rel="noreferrer" className="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline truncate max-w-sm block mt-0.5">
                            {p.url}
                          </a>
                          {p.watchListCount > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-bold mt-1">
                              <Layers className="w-3 h-3" /> In {p.watchListCount} Watch List{p.watchListCount > 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-[10px] font-bold mt-1">
                              <ShieldAlert className="w-3 h-3 text-amber-500" /> Orphaned (0 Watch Lists)
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <button
                            onClick={() => handleUpdatePageMonitoring(p.id, p.status)}
                            className={`px-3 py-1 rounded-full text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer transition-all ${
                              isPaused
                                ? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-300'
                                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                            }`}
                          >
                            {isPaused ? <PauseCircle className="w-3.5 h-3.5 text-slate-500" /> : <PlayCircle className="w-3.5 h-3.5 text-emerald-500" />}
                            {isPaused ? 'PAUSED' : 'ACTIVE'}
                          </button>
                        </td>

                        <td className="py-3.5 px-4">
                          {isGlobalTimerOn ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/30 text-xs font-extrabold">
                              <Timer className="w-3.5 h-3.5" /> MASTER ({formatMins(globalIntervalMinutes)})
                            </span>
                          ) : (
                            <select
                              value={[30, 60, 180, 360, 720, 1440, 10080, 43200].includes(p.checkIntervalMinutes || 180) ? (p.checkIntervalMinutes || 180) : 'custom'}
                              onChange={e => {
                                if (e.target.value === 'custom') {
                                  setCustomTargetType('page');
                                  setCustomPageId(p.id);
                                  setCustomPageStatus(p.status);
                                  setCustomValue(2);
                                  setCustomUnit(60);
                                  setShowCustomTimerModal(true);
                                } else {
                                  handleChangeInterval(p.id, p.status, Number(e.target.value));
                                }
                              }}
                              className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 cursor-pointer"
                            >
                              <option value={30}>Every 30 mins</option>
                              <option value={60}>Every 1 hour</option>
                              <option value={180}>Every 3 hours</option>
                              <option value={360}>Every 6 hours</option>
                              <option value={720}>Every 12 hours</option>
                              <option value={1440}>Every 24 hours (1 day)</option>
                              <option value={10080}>Every 7 days (1 week)</option>
                              <option value={43200}>Every 30 days (1 month)</option>
                              {![30, 60, 180, 360, 720, 1440, 10080, 43200].includes(p.checkIntervalMinutes || 180) && (
                                <option value="custom">Custom: Every {formatMins(p.checkIntervalMinutes)}</option>
                              )}
                              <option value="custom">⚙ Custom Period...</option>
                            </select>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                          {p.lastScrapedAt ? (
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {new Date(p.lastScrapedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {new Date(p.lastScrapedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          ) : (
                            'Never'
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleForceScrape(p.id)}
                              disabled={triggeringId === p.id}
                              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 inline-flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${triggeringId === p.id ? 'animate-spin' : ''}`} />
                              {triggeringId === p.id ? 'Checking...' : 'Check Now'}
                            </button>

                            <button
                              onClick={() => handleDeleteSingleCompany(p.id, p.companyName || p.url)}
                              disabled={deletingCompanyId === p.id}
                              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 cursor-pointer transition-all disabled:opacity-50 flex items-center justify-center"
                              title="Delete company career page"
                            >
                              <Trash2 className={`w-3.5 h-3.5 ${deletingCompanyId === p.id ? 'animate-spin' : ''}`} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {!loadingPages && careerPagesList.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                        No company career pages match the search criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Bar */}
            {companyPagination.totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
                <span className="text-xs text-slate-500">
                  Showing Page <span className="font-bold text-slate-900 dark:text-white">{companyPagination.page}</span> of <span className="font-bold text-slate-900 dark:text-white">{companyPagination.totalPages}</span> ({companyPagination.total} total items)
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCompanyPage(prev => Math.max(1, prev - 1))}
                    disabled={companyPage <= 1}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Previous
                  </button>

                  <button
                    onClick={() => setCompanyPage(prev => Math.min(companyPagination.totalPages, prev + 1))}
                    disabled={companyPage >= companyPagination.totalPages}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EMAIL APPROVALS TAB WITH SERVER PAGINATION */}
      {activeTab === 'emails' && (
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Email Approval Queue &amp; Management ({emailPagination.total})
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Approve, unapprove, or manually add email addresses authorized for digest delivery.
              </p>
            </div>

            {/* Auto Approve Toggle Switch */}
            <div className="flex items-center gap-3 glass-card px-4 py-2.5 rounded-2xl border-slate-200 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Auto Approve New Emails:
              </span>
              <button
                onClick={handleToggleAutoApprove}
                type="button"
                className={`w-11 h-6 rounded-full transition-colors p-0.5 relative flex items-center cursor-pointer ${
                  isAutoApproveOn ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform transform shadow-sm ${
                    isAutoApproveOn ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className={`text-xs font-extrabold uppercase ${isAutoApproveOn ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
                {isAutoApproveOn ? 'ON' : 'OFF'}
              </span>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            {/* Top Row: Filter Tabs on Left, Primary Actions on Right */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl overflow-x-auto">
                <button
                  onClick={() => { setEmailStatusFilter('pending'); setEmailPage(1); }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    emailStatusFilter === 'pending'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Pending Queue
                </button>

                <button
                  onClick={() => { setEmailStatusFilter('approved'); setEmailPage(1); }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    emailStatusFilter === 'approved'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Approved
                </button>

                <button
                  onClick={() => { setEmailStatusFilter('unapproved'); setEmailPage(1); }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    emailStatusFilter === 'unapproved'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Unapproved
                </button>

                <button
                  onClick={() => { setEmailStatusFilter('all'); setEmailPage(1); }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    emailStatusFilter === 'all'
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  All Statuses
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => openTestEmailModalFor()}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <Mail className="w-4 h-4" /> Send Test Email
                </button>

                <button
                  onClick={() => setShowAddEmailModal(true)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" /> Add Email
                </button>
              </div>
            </div>

            {/* Bottom Row: Full-width Search Bar & Page Limit Dropdown */}
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={emailSearch}
                  onChange={e => setEmailSearch(e.target.value)}
                  placeholder="Search email address..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600"
                />
              </div>

              <select
                value={emailLimit}
                onChange={e => { setEmailLimit(Number(e.target.value)); setEmailPage(1); }}
                className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer shrink-0"
              >
                <option value={10}>10 per page</option>
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
              </select>
            </div>
          </div>

          {/* Single Batch Group Action Toolbar */}
          {selectedEmailIds.length > 0 && (
            <div className="p-4 rounded-2xl bg-blue-600 text-white shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-2 text-xs font-bold">
                <CheckSquare className="w-4 h-4" />
                <span>{selectedEmailIds.length} email(s) selected for batch action</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleBatchProcess('approve')}
                  disabled={processingBatch}
                  className="px-4 py-2 rounded-xl text-xs font-extrabold bg-white text-blue-700 hover:bg-slate-100 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {processingBatch ? 'Processing...' : 'Batch Approve Selected'}
                </button>

                <button
                  onClick={() => handleBatchProcess('unapprove')}
                  disabled={processingBatch}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {processingBatch ? 'Processing...' : 'Batch Unapprove Selected'}
                </button>

                <button
                  onClick={() => setSelectedEmailIds([])}
                  className="px-3 py-2 rounded-xl text-xs text-blue-100 hover:text-white cursor-pointer"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}

          {/* Email Queue Table with Checkboxes */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm text-slate-800 dark:text-slate-200">
              <thead className="bg-slate-100 dark:bg-slate-900/90 text-slate-600 dark:text-slate-400 uppercase font-semibold border-b border-slate-200 dark:border-slate-800 text-xs">
                <tr>
                  <th className="py-3.5 px-4 w-10">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer"
                    >
                      {isAllFilteredSelected ? (
                        <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3.5 px-4">Email Address &amp; User</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Requested Date</th>
                  <th className="py-3.5 px-4 text-right">Approval Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
                {loadingEmails ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center">
                      <LoadingSpinner message="Loading email approvals..." fullPage={false} />
                    </td>
                  </tr>
                ) : emailApprovals.map((e: any) => {
                  const isChecked = selectedEmailIds.includes(e.id);
                  return (
                    <tr
                      key={e.id}
                      className={`hover:bg-slate-100/60 dark:hover:bg-slate-900/40 transition-colors ${
                        isChecked ? 'bg-blue-500/5 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 w-10">
                        <button
                          type="button"
                          onClick={() => toggleSelectRow(e.id)}
                          className="text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-900 dark:text-white text-sm block">{e.email}</span>
                        <span className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 block">
                          {e.userName ? `Account: ${e.userName}` : 'Manual Entry'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleInspectSubscriptions(e.email)}
                          className="text-[10px] font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 mt-1 cursor-pointer"
                          title="Inspect watch lists and URLs sending emails to this address"
                        >
                          <Layers className="w-3 h-3" /> Audit Lists &amp; URLs
                        </button>
                      </td>

                      <td className="py-3.5 px-4">
                        {e.status === 'approved' && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold uppercase">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                          </span>
                        )}
                        {e.status === 'pending' && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-xs font-bold uppercase">
                            <Clock className="w-3.5 h-3.5" /> Pending Queue
                          </span>
                        )}
                        {e.status === 'unapproved' && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/30 text-xs font-bold uppercase">
                            <XCircle className="w-3.5 h-3.5" /> Unapproved
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 text-xs">
                        {new Date(e.requestedAt).toLocaleString()}
                      </td>

                      <td className="py-3.5 px-4 text-right flex items-center justify-end gap-2">
                        <button
                          onClick={() => openTestEmailModalFor(e.email)}
                          title="Send Brevo Test Email to this address"
                          className="px-3 py-2 rounded-xl text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 flex items-center gap-1.5 cursor-pointer shrink-0"
                        >
                          <Mail className="w-3.5 h-3.5" /> Test Email
                        </button>
                        {e.status === 'pending' || e.status === 'unapproved' ? (
                          <button
                            onClick={() => handleApproveEmail(e.id)}
                            className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm cursor-pointer shrink-0"
                          >
                            Approve Email
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUnapproveEmail(e.id)}
                            className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 cursor-pointer shrink-0"
                          >
                            Unapprove / Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {!loadingEmails && emailApprovals.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 text-xs">
                      No email approvals found matching criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Email Approval Pagination Controls */}
          {emailPagination.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
              <span className="text-xs text-slate-500">
                Page <span className="font-bold text-slate-900 dark:text-white">{emailPagination.page}</span> of <span className="font-bold text-slate-900 dark:text-white">{emailPagination.totalPages}</span> ({emailPagination.total} total items)
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEmailPage(prev => Math.max(1, prev - 1))}
                  disabled={emailPage <= 1}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>

                <button
                  onClick={() => setEmailPage(prev => Math.min(emailPagination.totalPages, prev + 1))}
                  disabled={emailPage >= emailPagination.totalPages}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* USER MODERATION TAB WITH ENV ADMIN PROTECTION & PAGINATION */}
      {activeTab === 'users' && (
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Registered User Moderation ({userPagination.total})
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Manage user access permissions, upgrade/downgrade roles, and enforce ENV Superadmin safety locks.
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            {/* Top Row: Role Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl overflow-x-auto">
                <button
                  onClick={() => { setUserRoleFilter('all'); setUserPage(1); }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    userRoleFilter === 'all'
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  All Roles ({userPagination.total})
                </button>

                <button
                  onClick={() => { setUserRoleFilter('admin'); setUserPage(1); }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    userRoleFilter === 'admin'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Administrators
                </button>

                <button
                  onClick={() => { setUserRoleFilter('user'); setUserPage(1); }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    userRoleFilter === 'user'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Standard Users
                </button>
              </div>

              {/* Search & Limit dropdown */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    placeholder="Search users..."
                    className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600"
                  />
                </div>

                <select
                  value={userLimit}
                  onChange={e => { setUserLimit(Number(e.target.value)); setUserPage(1); }}
                  className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer shrink-0"
                >
                  <option value={10}>10 per page</option>
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm text-slate-800 dark:text-slate-200">
              <thead className="bg-slate-100 dark:bg-slate-900/90 text-slate-600 dark:text-slate-400 uppercase font-semibold border-b border-slate-200 dark:border-slate-800 text-xs">
                <tr>
                  <th className="py-3.5 px-4">User Account</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Joined Date</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
                {loadingUsers ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center">
                      <LoadingSpinner message="Loading user accounts..." fullPage={false} />
                    </td>
                  </tr>
                ) : userList.map((u: any) => (
                  <tr key={u.id} className="hover:bg-slate-100/60 dark:hover:bg-slate-900/40">
                    <td className="py-3.5 px-4">
                      <button
                        type="button"
                        onClick={() => setSelectedUserId(u.id)}
                        className="text-left group/user cursor-pointer"
                        title="Click to view User Profile & Published Watchlists"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white text-sm block group-hover/user:underline group-hover/user:text-blue-600 dark:group-hover/user:text-blue-400 transition-colors">{u.name || 'User'}</span>
                          {u.isEnvAdmin && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-extrabold uppercase flex items-center gap-1">
                              <Lock className="w-3 h-3" /> ENV SUPERADMIN
                            </span>
                          )}
                        </div>
                        <span className="text-slate-500 dark:text-slate-400 text-xs block group-hover/user:underline">{u.email}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInspectSubscriptions(u.email)}
                        className="text-[10px] font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 mt-1 cursor-pointer"
                        title="Inspect watch lists and URLs sending emails to this user"
                      >
                        <Layers className="w-3 h-3" /> Audit Lists &amp; URLs
                      </button>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                        u.role === 'admin'
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                          : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                      }`}>
                        {u.role}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      {u.isBlocked ? (
                        <span
                          title={u.blockedReason || 'Blocked by administrator'}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/30 text-xs font-bold uppercase"
                        >
                          <Ban className="w-3.5 h-3.5" /> Blocked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold uppercase">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Active
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 text-xs">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      {u.isEnvAdmin ? (
                        <span className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-not-allowed inline-flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Protected ENV Admin
                        </span>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleChangeRole(u.id, u.role, u.isEnvAdmin)}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 cursor-pointer"
                          >
                            Toggle Role
                          </button>

                          <button
                            onClick={() => handleToggleBlockUser(u.id, Boolean(u.isBlocked), u.email, Boolean(u.isEnvAdmin))}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              u.isBlocked
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/20'
                            }`}
                          >
                            {u.isBlocked ? 'Unblock User' : 'Block User'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}

                {!loadingUsers && userList.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 text-xs">
                      No user accounts found matching criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* User Pagination Controls */}
          {userPagination.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
              <span className="text-xs text-slate-500">
                Page <span className="font-bold text-slate-900 dark:text-white">{userPagination.page}</span> of <span className="font-bold text-slate-900 dark:text-white">{userPagination.totalPages}</span> ({userPagination.total} total registered users)
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setUserPage(prev => Math.max(1, prev - 1))}
                  disabled={userPage <= 1}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>

                <button
                  onClick={() => setUserPage(prev => Math.min(userPagination.totalPages, prev + 1))}
                  disabled={userPage >= userPagination.totalPages}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ALL WATCH LISTS MODERATION TAB WITH SERVER PAGINATION & SEARCH */}
      {activeTab === 'watchlists' && (
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-500" />
                All Watch Lists Moderation ({watchlistPagination.total})
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Browse, search by user or list name, edit details, or delete watch lists created by all users across the platform.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* View Mode Switcher */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setWatchlistViewMode('grid')}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    watchlistViewMode === 'grid'
                      ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Grid Cards View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setWatchlistViewMode('tiles')}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    watchlistViewMode === 'tiles'
                      ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Compact Tiles View"
                >
                  <Grid2X2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setWatchlistViewMode('table')}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    watchlistViewMode === 'table'
                      ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Table List View"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => fetchPaginatedWatchlists(watchlistPage, debouncedWatchlistSearch, watchlistLimit, watchlistVisibilityFilter, watchlistCanonicalFilter, watchlistUserIdFilter)}
                className="px-3.5 py-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingWatchlists ? 'animate-spin' : ''}`} />
                Refresh Watch Lists
              </button>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            {/* Filter controls row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={watchlistSearch}
                  onChange={e => { setWatchlistSearch(e.target.value); setWatchlistPage(1); }}
                  placeholder="Search list name, slug, email..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Specific User Filter */}
              <div className="relative">
                <Users className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={watchlistUserIdFilter}
                  onChange={e => { setWatchlistUserIdFilter(e.target.value); setWatchlistPage(1); }}
                  placeholder="Filter by User ID or Email..."
                  className="w-full pl-10 pr-8 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-purple-500"
                />
                {watchlistUserIdFilter && (
                  <button
                    onClick={() => { setWatchlistUserIdFilter(''); setWatchlistPage(1); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Visibility Filter */}
              <select
                value={watchlistVisibilityFilter}
                onChange={e => { setWatchlistVisibilityFilter(e.target.value as any); setWatchlistPage(1); }}
                className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              >
                <option value="all">All Visibilities</option>
                <option value="public">Public Only</option>
                <option value="private">Private Only</option>
              </select>

              {/* Canonical / Items Per Page */}
              <div className="flex items-center gap-2">
                <select
                  value={watchlistCanonicalFilter}
                  onChange={e => { setWatchlistCanonicalFilter(e.target.value as any); setWatchlistPage(1); }}
                  className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                >
                  <option value="all">All Lineages</option>
                  <option value="canonical">Verified Canonical</option>
                  <option value="non-canonical">Non-Canonical</option>
                </select>

                <select
                  value={watchlistLimit}
                  onChange={e => { setWatchlistLimit(Number(e.target.value)); setWatchlistPage(1); }}
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer shrink-0"
                >
                  <option value={10}>10/page</option>
                  <option value={25}>25/page</option>
                  <option value={50}>50/page</option>
                  <option value={100}>100/page</option>
                </select>
              </div>
            </div>
          </div>

          {/* Batch Actions Toolbar */}
          {selectedWatchlistIds.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex flex-wrap items-center justify-between gap-3 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-purple-600 text-white font-bold text-xs">
                  {selectedWatchlistIds.length} Selected
                </span>
                <span className="text-xs text-purple-700 dark:text-purple-300 font-semibold">
                  Batch actions for selected watch lists:
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={processingWatchlistBatch}
                  onClick={() => handleBatchWatchlistAction('make_public')}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-1 disabled:opacity-50"
                >
                  <Globe className="w-3.5 h-3.5" /> Make Public
                </button>

                <button
                  type="button"
                  disabled={processingWatchlistBatch}
                  onClick={() => handleBatchWatchlistAction('make_private')}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-1 disabled:opacity-50"
                >
                  <Lock className="w-3.5 h-3.5" /> Make Private
                </button>

                <button
                  type="button"
                  disabled={processingWatchlistBatch}
                  onClick={() => handleBatchWatchlistAction('make_canonical')}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-1 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Verify Canonical
                </button>

                <button
                  type="button"
                  disabled={processingWatchlistBatch}
                  onClick={() => handleBatchWatchlistAction('delete')}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-1 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Selected
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedWatchlistIds([])}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}

          {/* Watchlists Directory Views (Grid, Tiles, or Table) */}
          {loadingWatchlists ? (
            <div className="py-12 text-center">
              <LoadingSpinner message="Loading watch lists directory..." fullPage={false} />
            </div>
          ) : watchlistList.length === 0 ? (
            <div className="glass-panel p-12 rounded-3xl text-center border-slate-200 dark:border-slate-800">
              <Globe className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">No Watch Lists Found</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">No watch lists match the specified search or filter criteria.</p>
            </div>
          ) : watchlistViewMode !== 'table' ? (
            /* VIEW 1 & 2: Grid & Compact Tiles View */
            <div className={watchlistViewMode === 'tiles' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'}>
              {watchlistList.map(wl => (
                <div key={wl.id} className={`glass-card rounded-2xl border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between hover:shadow-xl hover:border-purple-500/30 transition-all duration-300 group relative ${selectedWatchlistIds.includes(wl.id) ? 'bg-purple-500/5 dark:bg-purple-500/10 border-purple-500/40' : ''} ${watchlistViewMode === 'tiles' ? 'p-4 space-y-3' : 'p-6 space-y-4'}`}>
                  <div className="space-y-3">
                    {/* Top Header Badge & Multi-select Checkbox */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedWatchlistIds.includes(wl.id)}
                          onChange={() => handleToggleWatchlistSelect(wl.id)}
                          className={`w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer transition-opacity duration-200 ${
                            selectedWatchlistIds.length > 0 || selectedWatchlistIds.includes(wl.id)
                              ? 'opacity-100'
                              : 'opacity-0 group-hover:opacity-100'
                          }`}
                          title="Select for batch action"
                        />
                        <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase flex items-center gap-1 ${
                          wl.visibility === 'public'
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                        }`}>
                          {wl.visibility === 'public' ? <Globe className="w-3 h-3 text-emerald-500" /> : <Lock className="w-3 h-3 text-slate-400" />}
                          {wl.visibility}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 flex-wrap">
                        {wl.isCanonical !== false && <Badge variant="canonical">Verified</Badge>}
                        {wl.parentListId && <Badge variant="forked" />}
                      </div>
                    </div>

                    {/* Title & Description */}
                    <div>
                      <Link href={`/lists/${wl.slug}`} target="_blank" className="block group/title hover:underline decoration-purple-500/50">
                        <h3 className={`font-extrabold text-slate-900 dark:text-white tracking-tight group-hover/title:text-purple-600 dark:group-hover/title:text-purple-400 transition-colors ${watchlistViewMode === 'tiles' ? 'text-base leading-snug' : 'text-xl'}`}>
                          {wl.name}
                        </h3>
                      </Link>
                      {wl.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                          {wl.description}
                        </p>
                      )}
                      <span className="inline-block text-[10px] font-mono text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20 mt-1.5">
                        /{wl.slug}
                      </span>
                    </div>

                    {/* Stats Badges Bar */}
                    <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                      <Badge variant="company" count={wl.companyCount || 0} />
                      <Badge variant="job" count={wl.jobCount || 0} />
                      {wl.followerCount > 0 && (
                        <Badge variant="follower" count={wl.followerCount} />
                      )}
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between gap-2">
                    {/* Curator Avatar & Name (Clicking opens Curator Profile Modal!) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (wl.userId) setSelectedUserId(wl.userId);
                      }}
                      className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 group/user transition-colors cursor-pointer text-left truncate"
                      title="Click to view Curator Profile"
                    >
                      {wl.userAvatarUrl ? (
                        <img src={wl.userAvatarUrl} alt={wl.userName || 'User'} className="w-4 h-4 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-blue-600 text-white font-bold text-[8px] flex items-center justify-center shrink-0 shadow-sm">
                          {(wl.userName?.[0] || 'U').toUpperCase()}
                        </div>
                      )}
                      <span className="truncate max-w-[90px] font-semibold text-slate-700 dark:text-slate-300 group-hover/user:underline">
                        {wl.userName || 'Curator'}
                      </span>
                    </button>

                    {/* Action Controls - Visible on Card Hover */}
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <button
                        type="button"
                        onClick={() => handleOpenEditWatchlist(wl)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-blue-600 dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                        title="Edit Watchlist Details"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteWatchlist(wl.id, wl.name)}
                        className="p-1.5 rounded-lg border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                        title="Delete Watchlist"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <Link
                        href={`/lists/${wl.slug}`}
                        target="_blank"
                        className="text-xs font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1 pl-1 transition-all"
                        title="View Public Openings Page"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* VIEW 3: Table List View */
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm text-slate-800 dark:text-slate-200">
                <thead className="bg-slate-100 dark:bg-slate-900/90 text-slate-600 dark:text-slate-400 uppercase font-semibold border-b border-slate-200 dark:border-slate-800 text-xs">
                  <tr>
                    <th className="py-3.5 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={watchlistList.length > 0 && watchlistList.every(l => selectedWatchlistIds.includes(l.id))}
                        onChange={handleToggleSelectAllWatchlists}
                        className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                        title="Select all watch lists on this page"
                      />
                    </th>
                    <th className="py-3.5 px-4">Watch List &amp; Slug</th>
                    <th className="py-3.5 px-4">Curator / Owner</th>
                    <th className="py-3.5 px-4">Visibility &amp; Lineage</th>
                    <th className="py-3.5 px-4">Monitored Metrics</th>
                    <th className="py-3.5 px-4">Created Date</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
                  {watchlistList.map((wl: any) => (
                    <tr key={wl.id} className={`hover:bg-slate-100/60 dark:hover:bg-slate-900/40 ${selectedWatchlistIds.includes(wl.id) ? 'bg-purple-500/5 dark:bg-purple-500/10' : ''}`}>
                      <td className="py-3.5 px-4">
                        <input
                          type="checkbox"
                          checked={selectedWatchlistIds.includes(wl.id)}
                          onChange={() => handleToggleWatchlistSelect(wl.id)}
                          className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <Link
                            href={`/lists/${wl.slug}`}
                            target="_blank"
                            className="font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 text-sm flex items-center gap-1.5 transition-colors"
                          >
                            {wl.name}
                            <ExternalLink className="w-3 h-3 text-slate-400" />
                          </Link>
                          {wl.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 max-w-xs">{wl.description}</p>
                          )}
                          <span className="inline-block text-[10px] font-mono text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20">
                            /{wl.slug}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (wl.userId) setSelectedUserId(wl.userId);
                            }}
                            className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer text-left text-xs group/user"
                            title="Click to view Curator Profile"
                          >
                            {wl.userAvatarUrl ? (
                              <img src={wl.userAvatarUrl} alt={wl.userName || 'User'} className="w-4 h-4 rounded-full object-cover shrink-0" />
                            ) : (
                              <div className="w-4 h-4 rounded-full bg-blue-600 text-white font-bold text-[8px] flex items-center justify-center shrink-0">
                                {(wl.userName?.[0] || 'U').toUpperCase()}
                              </div>
                            )}
                            <span className="underline-offset-2 group-hover/user:underline">{wl.userName || 'User'}</span>
                          </button>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate max-w-[160px]">{wl.userEmail || wl.userId}</span>
                          <button
                            onClick={() => { setWatchlistUserIdFilter(wl.userId); setWatchlistPage(1); }}
                            className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-block"
                          >
                            Filter user lists
                          </button>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase flex items-center gap-1 ${
                            wl.visibility === 'public'
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                          }`}>
                            {wl.visibility === 'public' ? <Globe className="w-3 h-3 text-emerald-500" /> : <Lock className="w-3 h-3 text-slate-400" />}
                            {wl.visibility}
                          </span>

                          {wl.isCanonical !== false && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                              Verified Canonical
                            </span>
                          )}

                          {wl.parentListId && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                              Forked List
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="space-y-1 text-xs">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300 block w-fit">
                            {wl.companyCount || 0} Pages
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[11px] font-medium block w-fit">
                            {wl.jobCount || 0} Jobs
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 text-xs">
                        {new Date(wl.createdAt).toLocaleDateString()}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditWatchlist(wl)}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
                            title="Edit Watchlist Details"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-blue-500" /> Edit
                          </button>

                          <button
                            onClick={() => handleDeleteWatchlist(wl.id, wl.name)}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                            title="Permanently Delete Watchlist"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Watchlists Pagination Controls */}
          {watchlistPagination.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
              <span className="text-xs text-slate-500">
                Page <span className="font-bold text-slate-900 dark:text-white">{watchlistPagination.page}</span> of <span className="font-bold text-slate-900 dark:text-white">{watchlistPagination.totalPages}</span> ({watchlistPagination.total} total watch lists)
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setWatchlistPage(prev => Math.max(1, prev - 1))}
                  disabled={watchlistPage <= 1}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>

                <button
                  onClick={() => setWatchlistPage(prev => Math.min(watchlistPagination.totalPages, prev + 1))}
                  disabled={watchlistPage >= watchlistPagination.totalPages}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ADMIN WATCHLIST EDIT MODAL */}
      {editingWatchlist && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel max-w-lg w-full p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-5 bg-white dark:bg-slate-950 shadow-2xl animate-in fade-in zoom-in-95 duration-150 relative">
            <button
              onClick={() => setEditingWatchlist(null)}
              type="button"
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2 pr-6">
              <Edit3 className="w-5 h-5 text-blue-500" />
              Edit Watch List Details
            </h3>

            <form onSubmit={handleSaveEditWatchlist} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                  Watchlist Name *
                </label>
                <input
                  type="text"
                  required
                  value={editWatchlistName}
                  onChange={e => setEditWatchlistName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-blue-500 text-slate-900 dark:text-white font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                  URL Slug *
                </label>
                <input
                  type="text"
                  required
                  value={editWatchlistSlug}
                  onChange={e => setEditWatchlistSlug(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-blue-500 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={editWatchlistDescription}
                  onChange={e => setEditWatchlistDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                    Visibility Mode
                  </label>
                  <select
                    value={editWatchlistVisibility}
                    onChange={e => setEditWatchlistVisibility(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-blue-500 text-slate-900 dark:text-white font-bold cursor-pointer"
                  >
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={editWatchlistIsCanonical}
                      onChange={e => setEditWatchlistIsCanonical(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    Verified Canonical
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end pt-3 gap-2">
                <button
                  type="button"
                  onClick={() => setEditingWatchlist(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingWatchlist}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md cursor-pointer transition-all disabled:opacity-50"
                >
                  {savingWatchlist ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UNVERIFIED EMAILS VIEW TAB */}
      {activeTab === 'unverified' && (
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" />
                Unverified Email Signups (Pending OTP Verification)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Users who registered but have not yet verified their 6-digit email OTP code. You can manually verify them, resend OTP emails, or purge unverified signups.
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={unverifiedSearch}
                onChange={e => setUnverifiedSearch(e.target.value)}
                placeholder="Search unverified emails..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-900/90 text-slate-600 dark:text-slate-400 uppercase font-semibold border-b border-slate-200 dark:border-slate-800 text-xs">
                <tr>
                  <th className="py-3.5 px-4">User &amp; Email</th>
                  <th className="py-3.5 px-4">Registered Date</th>
                  <th className="py-3.5 px-4">OTP Verification Status</th>
                  <th className="py-3.5 px-4 text-right">Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80 text-xs">
                {loadingUnverified ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center">
                      <LoadingSpinner message="Loading unverified email signups..." fullPage={false} />
                    </td>
                  </tr>
                ) : unverifiedList.map(u => (
                  <tr key={u.id} className="hover:bg-slate-100/60 dark:hover:bg-slate-900/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-900 dark:text-white text-sm block">{u.email}</span>
                      <span className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 block">
                        {u.name || 'No Name Provided'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                      {new Date(u.createdAt).toLocaleString()}
                    </td>

                    <td className="py-3.5 px-4">
                      {u.verification ? (
                        <div className="space-y-1">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase border ${
                            u.verification.isExpired
                              ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'
                              : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
                          }`}>
                            {u.verification.isExpired ? 'Code Expired' : 'Code Active'}
                          </span>
                          <span className="text-[11px] text-slate-500 block">
                            Attempts: {u.verification.attempts}/5 &bull; Last sent: {new Date(u.verification.lastSentAt).toLocaleTimeString()}
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-bold">
                          No Active Code
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleManuallyVerifyEmail(u.id, u.email)}
                          title="Manually verify this email & activate account"
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all cursor-pointer flex items-center gap-1 shrink-0"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Verify Email
                        </button>

                        <button
                          onClick={() => handleResendUnverifiedOtp(u.id, u.email)}
                          title="Resend verification OTP code email"
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-all cursor-pointer flex items-center gap-1 shrink-0"
                        >
                          <Mail className="w-3.5 h-3.5" /> Resend OTP
                        </button>

                        <button
                          onClick={() => handleDeleteUnverifiedUser(u.id, u.email)}
                          title="Delete unverified signup record"
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-all cursor-pointer flex items-center gap-1 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!loadingUnverified && unverifiedList.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500 text-xs">
                      No unverified email signups found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Unverified Pagination Controls */}
          {unverifiedPagination.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
              <span className="text-xs text-slate-500">
                Page <span className="font-bold text-slate-900 dark:text-white">{unverifiedPagination.page}</span> of <span className="font-bold text-slate-900 dark:text-white">{unverifiedPagination.totalPages}</span> ({unverifiedPagination.total} unverified signups)
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setUnverifiedPage(prev => Math.max(1, prev - 1))}
                  disabled={unverifiedPage <= 1}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>

                <button
                  onClick={() => setUnverifiedPage(prev => Math.min(unverifiedPagination.totalPages, prev + 1))}
                  disabled={unverifiedPage >= unverifiedPagination.totalPages}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* REPORTED ISSUES VIEW TAB */}
      {activeTab === 'issues' && (
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-500" />
                User Reported Issues &amp; Bug Reports ({issuesPagination.total})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Manage user-submitted reports for broken career page URLs, scraper bugs, UI issues, and feature requests.
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Category Filter */}
              <select
                value={issuesCategoryFilter}
                onChange={e => { setIssuesCategoryFilter(e.target.value); setIssuesPage(1); }}
                className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              >
                <option value="all">All Categories</option>
                <option value="jobs_not_loading">Jobs Not Loading</option>
                <option value="broken_url">Broken URL</option>
                <option value="scraper_bug">System Bug</option>
                <option value="ui_bug">UI Bug</option>
                <option value="feature_request">Feature Request</option>
                <option value="general">General</option>
              </select>

              {/* Status Filter */}
              <select
                value={issuesStatusFilter}
                onChange={e => { setIssuesStatusFilter(e.target.value as any); setIssuesPage(1); }}
                className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>

              {/* Search Bar */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={issuesSearch}
                  onChange={e => setIssuesSearch(e.target.value)}
                  placeholder="Search issues..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-900/90 text-slate-600 dark:text-slate-400 uppercase font-semibold border-b border-slate-200 dark:border-slate-800 text-xs">
                <tr>
                  <th className="py-3.5 px-4">Subject &amp; Reporter</th>
                  <th className="py-3.5 px-4">Category &amp; Target URL</th>
                  <th className="py-3.5 px-4">Priority</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Submitted Date</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80 text-xs">
                {loadingIssues ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center">
                      <LoadingSpinner message="Loading reported issues..." fullPage={false} />
                    </td>
                  </tr>
                ) : issuesList.map(issue => (
                  <tr key={issue.id} className="hover:bg-slate-100/60 dark:hover:bg-slate-900/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-900 dark:text-white text-sm block">{issue.subject}</span>
                      <span className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 block">
                        By {issue.reporterName || 'Anonymous'} ({issue.reporterEmail})
                      </span>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 max-w-md bg-slate-50 dark:bg-slate-900/60 p-2 rounded-lg border border-slate-200/60 dark:border-slate-800/60">
                        {issue.description}
                      </p>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-bold uppercase inline-block mb-1">
                        {issue.category.replace('_', ' ')}
                      </span>
                      {issue.targetUrl && (
                        <a href={issue.targetUrl} target="_blank" rel="noreferrer" className="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline truncate max-w-xs block">
                          {issue.targetUrl}
                        </a>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <select
                        value={issue.priority}
                        onChange={e => handleUpdateIssuePriority(issue.id, e.target.value)}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-bold uppercase cursor-pointer border focus:outline-none ${
                          issue.priority === 'critical' || issue.priority === 'high'
                            ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'
                            : issue.priority === 'medium'
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </td>

                    <td className="py-3.5 px-4">
                      <select
                        value={issue.status}
                        onChange={e => handleUpdateIssueStatus(issue.id, e.target.value)}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-bold uppercase cursor-pointer border focus:outline-none ${
                          issue.status === 'resolved' || issue.status === 'closed'
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                            : issue.status === 'in_progress'
                            ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30'
                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
                        }`}
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                    </td>

                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 text-xs">
                      {new Date(issue.createdAt).toLocaleString()}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {issue.status !== 'resolved' && (
                          <button
                            onClick={() => handleUpdateIssueStatus(issue.id, 'resolved')}
                            title="Mark as resolved"
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all cursor-pointer flex items-center gap-1 shrink-0"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
                          </button>
                        )}

                        <button
                          onClick={() => handleDeleteIssue(issue.id)}
                          title="Delete issue report"
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-all cursor-pointer flex items-center gap-1 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!loadingIssues && issuesList.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                      No issue reports found matching criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Issues Pagination Controls */}
          {issuesPagination.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
              <span className="text-xs text-slate-500">
                Page <span className="font-bold text-slate-900 dark:text-white">{issuesPagination.page}</span> of <span className="font-bold text-slate-900 dark:text-white">{issuesPagination.totalPages}</span> ({issuesPagination.total} issues)
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIssuesPage(prev => Math.max(1, prev - 1))}
                  disabled={issuesPage <= 1}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>

                <button
                  onClick={() => setIssuesPage(prev => Math.min(issuesPagination.totalPages, prev + 1))}
                  disabled={issuesPage >= issuesPagination.totalPages}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AUDIT LOG TAB WITH INFINITE SCROLL */}
      {activeTab === 'audit' && (
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <History className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              Administrative Audit Trail ({auditLogs.length} loaded)
            </h2>
            <span className="text-xs text-slate-500 font-medium">Scroll down to automatically load more logs</span>
          </div>

          <div className="overflow-x-auto max-h-[600px] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800/80">
            <table className="w-full text-left text-xs sm:text-sm text-slate-800 dark:text-slate-200">
              <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 uppercase font-semibold border-b border-slate-200 dark:border-slate-800 text-xs">
                <tr>
                  <th className="py-3.5 px-4">Timestamp</th>
                  <th className="py-3.5 px-4">Admin</th>
                  <th className="py-3.5 px-4">Action</th>
                  <th className="py-3.5 px-4">Target Entity</th>
                  <th className="py-3.5 px-4">Parameters</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
                {auditLogs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-slate-100/60 dark:hover:bg-slate-900/40 font-mono text-xs">
                    <td className="py-3.5 px-4 text-slate-500">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white font-sans">{log.adminName || log.adminEmail || 'Admin'}</td>
                    <td className="py-3.5 px-4"><span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded text-xs font-bold">{log.action}</span></td>
                    <td className="py-3.5 px-4 text-slate-500">{log.targetType}: {log.targetId}</td>
                    <td className="py-3.5 px-4 text-slate-500">{JSON.stringify(log.metadata || {})}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Infinite Scroll Sentinel & Loading Indicator */}
            <div ref={auditSentinelRef} className="p-4 text-center">
              {loadingAudit ? (
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-slate-500 py-2">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span>Loading audit logs...</span>
                </div>
              ) : !auditHasMore ? (
                <span className="text-xs font-bold text-slate-400 py-2 inline-block">
                  ✓ All audit logs loaded ({auditLogs.length} entries)
                </span>
              ) : (
                <span className="text-xs text-slate-400 py-2 inline-block">
                  Scroll down to load next logs...
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual Add Email Modal */}
      {showAddEmailModal && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-panel p-6 rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Manually Add Approved Email Address
            </h3>

            <form onSubmit={handleManualAddEmail} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={manualEmail}
                  onChange={e => setManualEmail(e.target.value)}
                  placeholder="e.g. user@targetcompany.com"
                  className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="pt-3 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddEmailModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingEmail}
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md cursor-pointer"
                >
                  {addingEmail ? 'Adding...' : 'Add to Approved Emails'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Test Email Dispatcher Modal */}
      {showTestEmailModal && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Mail className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Send Brevo Test Email
              </h3>
              <button
                type="button"
                onClick={() => setShowTestEmailModal(false)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSendTestEmailSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Recipient Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={testRecipientEmail}
                  onChange={e => setTestRecipientEmail(e.target.value)}
                  placeholder="e.g. targetuser@gmail.com"
                  className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Select Email Format / Template *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTestEmailTemplate('otp')}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                      testEmailTemplate === 'otp'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-indigo-500'
                    }`}
                  >
                    🔑 6-Digit OTP Code
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestEmailTemplate('digest')}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                      testEmailTemplate === 'digest'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-indigo-500'
                    }`}
                  >
                    📬 Job Digest Alert
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestEmailTemplate('custom')}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                      testEmailTemplate === 'custom'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-indigo-500'
                    }`}
                  >
                    ✏️ Custom Message
                  </button>
                </div>
              </div>

              {testEmailTemplate === 'custom' && (
                <div className="space-y-3 pt-1 animate-in fade-in duration-150">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                      Custom Email Subject
                    </label>
                    <input
                      type="text"
                      value={testCustomSubject}
                      onChange={e => setTestCustomSubject(e.target.value)}
                      placeholder="e.g. System Maintenance Notice"
                      className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-indigo-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                      Custom Message Body
                    </label>
                    <textarea
                      rows={3}
                      value={testCustomMessage}
                      onChange={e => setTestCustomMessage(e.target.value)}
                      placeholder="Type your message body content here..."
                      className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-indigo-600 resize-none"
                    />
                  </div>
                </div>
              )}

              <div className="pt-3 flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTestEmailModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingTestEmail}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {sendingTestEmail ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" /> Send Test Email via Brevo
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Flexible Custom Time Interval Modal */}
      {showCustomTimerModal && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 rounded-3xl shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                Set Flexible Custom Check Period
              </h3>
              <button
                type="button"
                onClick={() => setShowCustomTimerModal(false)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Enter any custom check frequency using minutes, hours, days, weeks, months, or years.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Frequency Value
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={customValue}
                  onChange={e => setCustomValue(Math.max(1, Number(e.target.value)))}
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-bold focus:outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Time Unit
                </label>
                <select
                  value={customUnit}
                  onChange={e => setCustomUnit(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-bold focus:outline-none focus:border-purple-600 cursor-pointer"
                >
                  <option value={1}>Minute(s)</option>
                  <option value={60}>Hour(s)</option>
                  <option value={1440}>Day(s)</option>
                  <option value={10080}>Week(s)</option>
                  <option value={43200}>Month(s)</option>
                  <option value={525600}>Year(s)</option>
                </select>
              </div>
            </div>

            {/* Real-time Calculated Preview Badge */}
            <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-center">
              <span className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Calculated Check Frequency:</span>
              <span className="text-sm font-black text-purple-600 dark:text-purple-300 block">
                Every {customValue} {customUnit === 1 ? 'Minute' : customUnit === 60 ? 'Hour' : customUnit === 1440 ? 'Day' : customUnit === 10080 ? 'Week' : customUnit === 43200 ? 'Month' : 'Year'}{customValue > 1 ? 's' : ''} ({Math.round(customValue * customUnit)} total minutes)
              </span>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCustomTimerModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCustomTimer}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-md cursor-pointer transition-all"
              >
                Save Custom Period
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add Monitored Company Modal */}
      {showAddCompanyModal && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 rounded-3xl shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                Add Monitored Company
              </h3>
              <button
                type="button"
                onClick={() => setShowAddCompanyModal(false)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Enter the company career page URL. URLs are automatically formatted (trimming trailing slashes, adding scheme, removing tracking params) so each company has max one unique entry.
            </p>

            <form onSubmit={handleAddCompany} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Career Page URL *
                </label>
                <input
                  type="text"
                  required
                  value={newCompanyUrl}
                  onChange={e => setNewCompanyUrl(e.target.value)}
                  placeholder="e.g. stripe.com/jobs/ or https://stripe.com/jobs"
                  className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-purple-600 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Company Name (Optional)
                </label>
                <input
                  type="text"
                  value={newCompanyName}
                  onChange={e => setNewCompanyName(e.target.value)}
                  placeholder="e.g. Stripe (leave empty to auto-derive from domain)"
                  className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Default Check Interval
                </label>
                <select
                  value={newCompanyInterval}
                  onChange={e => setNewCompanyInterval(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-bold focus:outline-none focus:border-purple-600 cursor-pointer"
                >
                  <option value={30}>Every 30 mins</option>
                  <option value={60}>Every 1 hour</option>
                  <option value={180}>Every 3 hours (Default)</option>
                  <option value={360}>Every 6 hours</option>
                  <option value={720}>Every 12 hours</option>
                  <option value={1440}>Every 24 hours (1 day)</option>
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddCompanyModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingCompany}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-md cursor-pointer transition-all disabled:opacity-50"
                >
                  {addingCompany ? 'Adding...' : 'Add Unique Company'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      {/* User Subscriptions & Monitored URLs Audit Modal */}
      {inspectingEmail && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-3xl w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-8">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                    Email Notifications &amp; Subscription Audit
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs font-bold border border-purple-500/20">
                    AUDIT
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Inspecting active watch lists and monitored company URLs generating email alerts for{' '}
                  <strong className="text-slate-900 dark:text-white font-mono">{inspectingEmail}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingEmail(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingInspection ? (
              <div className="py-12 text-center">
                <LoadingSpinner message="Auditing user subscriptions & monitored URLs..." fullPage={false} />
              </div>
            ) : inspectionData ? (
              <div className="space-y-5">
                {/* Overview Summary Badges */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 block">
                      Subscribed Lists
                    </span>
                    <span className="text-2xl font-black text-purple-700 dark:text-purple-300">
                      {inspectionData.subscribedListsCount || 0}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                      Created Watch Lists
                    </span>
                    <span className="text-2xl font-black text-blue-700 dark:text-blue-300">
                      {inspectionData.ownedListsCount || 0}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center col-span-2 sm:col-span-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                      Total Monitored Company URLs
                    </span>
                    <span className="text-2xl font-black text-emerald-700 dark:text-emerald-300">
                      {inspectionData.totalUniqueUrlsCount || 0} URLs
                    </span>
                  </div>
                </div>

                {/* Sub-Tabs */}
                <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                  <button
                    type="button"
                    onClick={() => setInspectionActiveTab('subscribed')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      inspectionActiveTab === 'subscribed'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Subscribed Lists ({inspectionData.subscribedListsCount || 0})
                  </button>

                  <button
                    type="button"
                    onClick={() => setInspectionActiveTab('owned')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      inspectionActiveTab === 'owned'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Created Watch Lists ({inspectionData.ownedListsCount || 0})
                  </button>

                  <button
                    type="button"
                    onClick={() => setInspectionActiveTab('urls')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      inspectionActiveTab === 'urls'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    All Monitored URLs ({inspectionData.totalUniqueUrlsCount || 0})
                  </button>
                </div>

                {/* Tab 1: Subscribed Lists */}
                {inspectionActiveTab === 'subscribed' && (
                  <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                    {inspectionData.subscribedLists.length === 0 ? (
                      <div className="py-8 text-center space-y-1">
                        <p className="text-xs text-slate-500">
                          This email address is not currently following any other user's public watch lists.
                        </p>
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                          💡 Note: Owned watch lists automatically deliver email alerts to the creator.
                        </p>
                      </div>
                    ) : (
                      inspectionData.subscribedLists.map((sl: any) => (
                        <div key={sl.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <Link
                                href={`/lists/${sl.slug}`}
                                target="_blank"
                                className="font-extrabold text-slate-900 dark:text-white text-sm hover:text-purple-600 dark:hover:text-purple-400 flex items-center gap-1.5"
                              >
                                {sl.name} <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                              </Link>
                              {sl.description && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">{sl.description}</p>
                              )}
                              <span className="text-[10px] font-mono text-purple-600 dark:text-purple-400">/{sl.slug}</span>
                            </div>

                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-300 text-[10px] font-extrabold uppercase border border-purple-500/30">
                                {sl.digestFrequency || 'instant'} digest
                              </span>
                              <span className="text-[10px] text-slate-400">Subscribed {new Date(sl.subscribedAt).toLocaleDateString()}</span>
                            </div>
                          </div>

                          {/* Attached URLs */}
                          <div className="space-y-1.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                              Monitored Links in this list ({sl.careerPages.length}):
                            </span>
                            {sl.careerPages.length === 0 ? (
                              <span className="text-xs text-slate-400 italic">No company URLs attached to this list.</span>
                            ) : (
                              <div className="space-y-1">
                                {sl.careerPages.map((cp: any) => (
                                  <div key={cp.id} className="flex items-center justify-between text-xs p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                                    <div className="truncate max-w-[420px]">
                                      <span className="font-semibold text-slate-900 dark:text-white mr-2">{cp.companyName || 'Company'}</span>
                                      <a href={cp.url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline text-[11px] truncate">
                                        {cp.url}
                                      </a>
                                    </div>
                                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                      {cp.atsType || 'generic'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Tab 2: Owned Lists */}
                {inspectionActiveTab === 'owned' && (
                  <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                    {inspectionData.ownedLists.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-500">
                        This user has not created any watch lists.
                      </div>
                    ) : (
                      inspectionData.ownedLists.map((ol: any) => (
                        <div key={ol.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <Link
                                href={`/lists/${ol.slug}`}
                                target="_blank"
                                className="font-extrabold text-slate-900 dark:text-white text-sm hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1.5"
                              >
                                {ol.name} <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                              </Link>
                              {ol.description && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">{ol.description}</p>
                              )}
                              <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400">/{ol.slug}</span>
                            </div>

                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold uppercase border border-emerald-500/30">
                                Auto-Subscribed (Owner)
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[10px] font-extrabold uppercase border border-blue-500/30">
                                {ol.visibility}
                              </span>
                            </div>
                          </div>

                          {/* Attached URLs */}
                          <div className="space-y-1.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                              Monitored Links in this list ({ol.careerPages.length}):
                            </span>
                            {ol.careerPages.length === 0 ? (
                              <span className="text-xs text-slate-400 italic">No company URLs attached to this list.</span>
                            ) : (
                              <div className="space-y-1">
                                {ol.careerPages.map((cp: any) => (
                                  <div key={cp.id} className="flex items-center justify-between text-xs p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                                    <div className="truncate max-w-[420px]">
                                      <span className="font-semibold text-slate-900 dark:text-white mr-2">{cp.companyName || 'Company'}</span>
                                      <a href={cp.url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline text-[11px] truncate">
                                        {cp.url}
                                      </a>
                                    </div>
                                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                      {cp.atsType || 'generic'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Tab 3: All Monitored Unique URLs */}
                {inspectionActiveTab === 'urls' && (
                  <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                    {inspectionData.uniqueUrls.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-500">
                        No company career page URLs are currently sending email alerts to this address.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        {inspectionData.uniqueUrls.map((cp: any) => (
                          <div key={cp.id} className="p-3.5 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 flex items-center justify-between gap-3">
                            <div className="space-y-1 truncate max-w-[500px]">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 dark:text-white text-xs">{cp.companyName || 'Company Career Page'}</span>
                                <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[9px] font-extrabold uppercase">
                                  {cp.atsType || 'generic'}
                                </span>
                              </div>
                              <a href={cp.url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline text-xs flex items-center gap-1 truncate">
                                {cp.url} <ExternalLink className="w-3 h-3 text-slate-400" />
                              </a>
                            </div>

                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                cp.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                              }`}>
                                {cp.status || 'active'}
                              </span>
                              {cp.lastScrapedAt && (
                                <span className="text-[9px] text-slate-400">Last scraped {new Date(cp.lastScrapedAt).toLocaleTimeString()}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectingEmail(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white font-bold text-xs hover:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer"
              >
                Close Inspection Audit
              </button>
            </div>
          </div>
        </div>
      )}

      <PublicUserProfileModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
    </div>
  );
}
