'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  ShieldAlert, Cpu, Zap, RefreshCw, Flag, Layers, Users, Activity, History, UserCheck,
  ExternalLink, Play, Search, ArrowLeft, Mail, CheckCircle2, Clock, XCircle, Plus, CheckCheck, CheckSquare, Square, PauseCircle, PlayCircle, Timer, Sliders, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Lock, Trash2, Ban, MailCheck, UserX, Edit3, Globe, Eye, X,
  LayoutGrid, Grid2X2, List, Crown, GitFork, Send, Database, KeyRound, Megaphone, FlaskConical, Inbox
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/components/auth/AuthContext';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { PublicUserProfileModal } from '@/components/PublicUserProfileModal';
import { Badge } from '@/components/Badge';
import { pluralize } from '@/lib/utils/pluralize';
import { FREQUENCY_OPTIONS, formatFrequencyLabel, parseCustomFrequency, buildCustomFrequency, normalizeFrequencyValue } from '@/lib/utils/frequency';

export default function AdminDashboardPage() {
  const toast = useToast();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'emails' | 'users' | 'watchlists' | 'unverified' | 'issues' | 'audit' | 'sent_emails' | 'companies'>('overview');
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
  const [watchlistStatusFilter, setWatchlistStatusFilter] = useState<'active' | 'deleted'>('active');
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

  // Notification Frequency Enforcement State
  const [freqEnforceGlobal, setFreqEnforceGlobal] = useState(false);
  const [freqEnforceValue, setFreqEnforceValue] = useState<string>('daily');
  const [freqStats, setFreqStats] = useState({ totalUsers: 0, enforcedUsersCount: 0, exemptUsersCount: 0 });
  const [freqUsers, setFreqUsers] = useState<any[]>([]);
  const [freqUserFilter, setFreqUserFilter] = useState<'all' | 'enforced' | 'exempt'>('all');
  const [freqUserSearch, setFreqUserSearch] = useState('');
  const [debouncedFreqUserSearch, setDebouncedFreqUserSearch] = useState('');
  const [freqUserPage, setFreqUserPage] = useState(1);
  const [freqUserLimit, setFreqUserLimit] = useState(10);
  const [freqUserPagination, setFreqUserPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [freqSelectedUserIds, setFreqSelectedUserIds] = useState<string[]>([]);
  const [loadingFreqUsers, setLoadingFreqUsers] = useState(false);
  const [savingFreqPolicy, setSavingFreqPolicy] = useState(false);
  const [savingFreqExemption, setSavingFreqExemption] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFreqUserSearch(freqUserSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [freqUserSearch]);

  const fetchFrequencyEnforcementPolicy = async () => {
    try {
      const res = await fetch('/api/admin/frequency-enforcement');
      if (res.ok) {
        const json = await res.json();
        setFreqEnforceGlobal(Boolean(json.isEnforced));
        setFreqEnforceValue(json.enforcedFrequency || 'daily');
        if (json.stats) setFreqStats(json.stats);
      }
    } catch {}
  };

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (sectionKey: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  const handleSaveFrequencyPolicy = async (isEnforced: boolean, enforcedFrequency: string) => {
    setSavingFreqPolicy(true);
    try {
      const res = await fetch('/api/admin/frequency-enforcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnforced, enforcedFrequency }),
      });
      if (res.ok) {
        toast.success(`Frequency enforcement policy ${isEnforced ? 'enabled' : 'disabled'}`);
        fetchFrequencyEnforcementPolicy();
        fetchFrequencyUsers(freqUserPage, debouncedFreqUserSearch, freqUserLimit, freqUserFilter);
      } else {
        toast.error('Failed to update policy');
      }
    } catch (e: any) {
      toast.error(e.message || 'Error updating policy');
    } finally {
      setSavingFreqPolicy(false);
    }
  };

  const fetchFrequencyUsers = async (p = 1, q = '', l = 10, f = 'all') => {
    setLoadingFreqUsers(true);
    try {
      const res = await fetch(`/api/admin/frequency-enforcement/users?page=${p}&limit=${l}&search=${encodeURIComponent(q)}&filter=${f}`);
      if (res.ok) {
        const json = await res.json();
        setFreqUsers(json.users || []);
        if (json.pagination) setFreqUserPagination(json.pagination);
      }
    } catch {}
    finally {
      setLoadingFreqUsers(false);
    }
  };

  const handleToggleUserExemption = async (userIds: string[], exempt: boolean) => {
    if (userIds.length === 0) return;
    setSavingFreqExemption(true);
    try {
      const res = await fetch('/api/admin/frequency-enforcement/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds, exempt }),
      });
      if (res.ok) {
        toast.success(`Updated exemption status for ${userIds.length} user(s).`);
        setFreqSelectedUserIds([]);
        fetchFrequencyEnforcementPolicy();
        fetchFrequencyUsers(freqUserPage, debouncedFreqUserSearch, freqUserLimit, freqUserFilter);
      } else {
        toast.error('Failed to update user exemption.');
      }
    } catch (e: any) {
      toast.error(e.message || 'Error updating user exemption.');
    } finally {
      setSavingFreqExemption(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'emails') {
      fetchFrequencyEnforcementPolicy();
      fetchFrequencyUsers(freqUserPage, debouncedFreqUserSearch, freqUserLimit, freqUserFilter);
    }
  }, [activeTab, freqUserPage, debouncedFreqUserSearch, freqUserLimit, freqUserFilter]);

  // Manual Add Email Modal State
  const [showAddEmailModal, setShowAddEmailModal] = useState(false);
  const [manualEmail, setManualEmail] = useState('');
  const [addingEmail, setAddingEmail] = useState(false);
  const addEmailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showAddEmailModal) {
      setTimeout(() => addEmailInputRef.current?.focus(), 50);
    }
  }, [showAddEmailModal]);

  // Test Email Modal State
  const [showTestEmailModal, setShowTestEmailModal] = useState(false);
  const testEmailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showTestEmailModal) {
      setTimeout(() => testEmailInputRef.current?.focus(), 50);
    }
  }, [showTestEmailModal]);

  // Manual Add Company Modal State
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [newCompanyUrl, setNewCompanyUrl] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyInterval, setNewCompanyInterval] = useState(180);
  const [addingCompany, setAddingCompany] = useState(false);
  const addAdminCompanyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showAddCompanyModal) {
      setTimeout(() => addAdminCompanyInputRef.current?.focus(), 50);
    }
  }, [showAddCompanyModal]);

  // Flexible Custom Time Modal State
  const [showCustomTimerModal, setShowCustomTimerModal] = useState(false);
  const customTimerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showCustomTimerModal) {
      setTimeout(() => customTimerInputRef.current?.focus(), 50);
    }
  }, [showCustomTimerModal]);
  const [customTargetType, setCustomTargetType] = useState<'global' | 'page'>('global');
  const [customPageId, setCustomPageId] = useState<string | null>(null);
  const [customPageStatus, setCustomPageStatus] = useState<string>('active');
  const [customValue, setCustomValue] = useState(2);
  const [customUnit, setCustomUnit] = useState<number>(60); // 1=mins, 60=hrs, 1440=days, 10080=weeks, 43200=months, 525600=years

  // Test Email Dispatcher Modal State
  const [testRecipientEmail, setTestRecipientEmail] = useState('');
  const [testEmailTemplate, setTestEmailTemplate] = useState<'otp' | 'digest' | 'custom'>('otp');
  const [testCustomSubject, setTestCustomSubject] = useState('');
  const [testCustomMessage, setTestCustomMessage] = useState('');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  // Broadcast Email Announcement Modal State
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastSubject, setBroadcastSubject] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastOnlyVerified, setBroadcastOnlyVerified] = useState(true);
  const [broadcastTargetRole, setBroadcastTargetRole] = useState<'all' | 'user' | 'admin'>('all');
  const [broadcastUsersList, setBroadcastUsersList] = useState<any[]>([]);
  const [loadingBroadcastUsers, setLoadingBroadcastUsers] = useState(false);
  const [excludedBroadcastUserIds, setExcludedBroadcastUserIds] = useState<string[]>([]);
  const [broadcastSearch, setBroadcastSearch] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const broadcastSubjectRef = useRef<HTMLInputElement>(null);

  // Site Announcement Banner Admin State
  const [bannerEnabled, setBannerEnabled] = useState(false);
  const [bannerMessage, setBannerMessage] = useState('');
  const [bannerType, setBannerType] = useState<'info' | 'warning' | 'danger' | 'success'>('info');
  const [bannerLinkUrl, setBannerLinkUrl] = useState('');
  const [bannerLinkText, setBannerLinkText] = useState('');
  const [savingBanner, setSavingBanner] = useState(false);

  // Sent Email History Logs State
  const [sentEmailLogsList, setSentEmailLogsList] = useState<any[]>([]);
  const [loadingSentEmailLogs, setLoadingSentEmailLogs] = useState(false);
  const [sentEmailLogsPagination, setSentEmailLogsPagination] = useState({ total: 0, page: 1, limit: 15, totalPages: 1 });
  const [sentEmailLogsPage, setSentEmailLogsPage] = useState(1);
  const [sentEmailLogsSearch, setSentEmailLogsSearch] = useState('');
  const [sentEmailLogsType, setSentEmailLogsType] = useState('all');
  const [sentEmailLogsTypeCounts, setSentEmailLogsTypeCounts] = useState<Record<string, number>>({
    all: 0, broadcast: 0, otp: 0, digest: 0, invite: 0, reset: 0, test: 0
  });
  const [inspectingEmailLog, setInspectingEmailLog] = useState<any | null>(null);
  const [showPruneLogsModal, setShowPruneLogsModal] = useState(false);
  const [pruneDays, setPruneDays] = useState(30);
  const [pruneTemplateType, setPruneTemplateType] = useState('all');
  const [pruningLogs, setPruningLogs] = useState(false);

  const handlePruneLogsSubmit = async (action: 'purge_html' | 'delete_logs') => {
    const confirmMsg = action === 'purge_html'
      ? `Are you sure you want to purge HTML content bodies older than ${pruneDays} days? Audit log entries and counts will remain intact.`
      : `CAUTION: Are you sure you want to permanently delete sent email log entries older than ${pruneDays} days?`;
    
    if (!confirm(confirmMsg)) return;

    setPruningLogs(true);
    try {
      const res = await fetch('/api/admin/emails/logs/prune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          days: pruneDays,
          templateType: pruneTemplateType,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to prune email logs.');
      }

      toast.success(json.message || 'Email logs pruned successfully.');
      setShowPruneLogsModal(false);
      fetchSentEmailLogs();
    } catch (err: any) {
      toast.error(err.message || 'Error pruning email logs');
    } finally {
      setPruningLogs(false);
    }
  };

  const handleDeleteSingleSentEmailLog = async (logId: string) => {
    if (!confirm('Are you sure you want to delete this email log entry?')) return;

    try {
      const res = await fetch('/api/admin/emails/logs/prune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_single',
          logId,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to delete email log.');
      }

      toast.success('Email log deleted successfully.');
      fetchSentEmailLogs();
    } catch (err: any) {
      toast.error(err.message || 'Error deleting email log');
    }
  };


  useEffect(() => {
    if (showBroadcastModal) {
      setTimeout(() => broadcastSubjectRef.current?.focus(), 50);
    }
  }, [showBroadcastModal]);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditingWatchlist(null);
        setInspectingEmail(null);
        setSelectedUserId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
    uId: string,
    status: string = 'active'
  ) => {
    setLoadingWatchlists(true);
    try {
      const url = `/api/admin/watchlists?page=${p}&limit=${l}&search=${encodeURIComponent(q)}&visibility=${vis}&canonical=${canon}&userId=${encodeURIComponent(uId)}&status=${status}`;
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
        watchlistUserIdFilter,
        watchlistStatusFilter
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to update watchlist');
    } finally {
      setSavingWatchlist(false);
    }
  };

  const handleSoftDeleteWatchlist = async (listId: string, listName: string) => {
    if (!confirm(`ADMIN ACTION: Are you sure you want to move watchlist "${listName}" to trash?`)) return;
    try {
      const res = await fetch(`/api/admin/watchlists/${listId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to move watchlist to trash');
      toast.success(json.message || 'Watchlist moved to trash.');
      fetchPaginatedWatchlists(
        watchlistPage,
        debouncedWatchlistSearch,
        watchlistLimit,
        watchlistVisibilityFilter,
        watchlistCanonicalFilter,
        watchlistUserIdFilter,
        watchlistStatusFilter
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete watchlist');
    }
  };

  const handleRestoreWatchlist = async (listId: string, listName: string) => {
    if (!confirm(`ADMIN ACTION: Are you sure you want to restore watchlist "${listName}" from trash?`)) return;
    try {
      const res = await fetch(`/api/admin/watchlists/${listId}/restore`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to restore watchlist');
      toast.success(json.message || 'Watchlist restored successfully!');
      fetchPaginatedWatchlists(
        watchlistPage,
        debouncedWatchlistSearch,
        watchlistLimit,
        watchlistVisibilityFilter,
        watchlistCanonicalFilter,
        watchlistUserIdFilter,
        watchlistStatusFilter
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to restore watchlist');
    }
  };

  const handlePermanentDeleteWatchlist = async (listId: string, listName: string) => {
    if (!confirm(`ADMIN ACTION: PERMANENTLY delete watchlist "${listName}"? This action CANNOT be undone!`)) return;
    try {
      const res = await fetch(`/api/admin/watchlists/${listId}?permanent=true`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to permanently delete watchlist');
      toast.success(json.message || 'Watchlist permanently deleted.');
      fetchPaginatedWatchlists(
        watchlistPage,
        debouncedWatchlistSearch,
        watchlistLimit,
        watchlistVisibilityFilter,
        watchlistCanonicalFilter,
        watchlistUserIdFilter,
        watchlistStatusFilter
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

  const handleBatchWatchlistAction = async (action: 'delete' | 'soft_delete' | 'restore' | 'permanent_delete' | 'make_public' | 'make_private' | 'make_canonical') => {
    if (selectedWatchlistIds.length === 0) return;
    const actionLabel = action === 'delete' || action === 'soft_delete'
      ? 'move to trash'
      : action === 'restore'
      ? 'restore'
      : action === 'permanent_delete'
      ? 'permanently delete'
      : action === 'make_public'
      ? 'make public'
      : action === 'make_private'
      ? 'make private'
      : 'mark as verified canonical';

    if (!confirm(`ADMIN ACTION: Are you sure you want to ${actionLabel} ${pluralize(selectedWatchlistIds.length, 'selected watchlist')}?`)) return;

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
        watchlistUserIdFilter,
        watchlistStatusFilter
      );
    } catch (err: any) {
      toast.error(err.message || 'Batch action failed');
    } finally {
      setProcessingWatchlistBatch(false);
    }
  };

  const handleTabChange = (tab: 'overview' | 'emails' | 'users' | 'watchlists' | 'unverified' | 'issues' | 'audit' | 'sent_emails' | 'companies') => {
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
      const validTabs = ['overview', 'emails', 'users', 'watchlists', 'unverified', 'issues', 'audit', 'sent_emails', 'companies'];
      const initialTab = validTabs.includes(urlTab) ? urlTab : validTabs.includes(savedTab) ? savedTab : 'overview';
      if (initialTab !== activeTab) {
        setActiveTab(initialTab);
      }
    }

    // Initial fetch for badge counts
    fetchPaginatedUsers(1, '', 10, 'all');
    fetchUnverifiedUsers(1, '', 10);
    fetchPaginatedIssues(1, '', 10, 'open', 'all');

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
      fetchSentEmailLogs();
    } else if (activeTab === 'users') {
      fetchPaginatedUsers(userPage, debouncedUserSearch, userLimit, userRoleFilter);
    } else if (activeTab === 'watchlists') {
      fetchPaginatedWatchlists(
        watchlistPage,
        debouncedWatchlistSearch,
        watchlistLimit,
        watchlistVisibilityFilter,
        watchlistCanonicalFilter,
        watchlistUserIdFilter,
        watchlistStatusFilter
      );
    } else if (activeTab === 'unverified') {
      fetchUnverifiedUsers(unverifiedPage, debouncedUnverifiedSearch, unverifiedLimit);
    } else if (activeTab === 'issues') {
      fetchPaginatedIssues(issuesPage, debouncedIssuesSearch, issuesLimit, issuesStatusFilter, issuesCategoryFilter);
    } else if (activeTab === 'sent_emails') {
      fetchSentEmailLogs();
    }
  }, [
    companyPage, debouncedCompanySearch, companyLimit,
    emailPage, debouncedEmailSearch, emailLimit, emailStatusFilter,
    userPage, debouncedUserSearch, userLimit, userRoleFilter,
    watchlistPage, debouncedWatchlistSearch, watchlistLimit, watchlistVisibilityFilter, watchlistCanonicalFilter, watchlistUserIdFilter, watchlistStatusFilter,
    unverifiedPage, debouncedUnverifiedSearch, unverifiedLimit,
    issuesPage, debouncedIssuesSearch, issuesLimit, issuesStatusFilter, issuesCategoryFilter,
    sentEmailLogsPage, sentEmailLogsType, sentEmailLogsSearch,
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
    if (activeTab === 'sent_emails' || activeTab === 'emails') {
      fetchSentEmailLogs();
    }
  }, [activeTab, sentEmailLogsPage, sentEmailLogsType, sentEmailLogsSearch]);


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

  const { user: currentUser } = useAuth();

  const loadAdminData = async (retryCount = 0) => {
    try {
      const [overviewRes, flagsRes] = await Promise.all([
        fetch('/api/admin/overview'),
        fetch('/api/admin/flags'),
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
      fetchAdminBannerConfig();
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
      fetchSentEmailLogs();
    } catch (err: any) {
      toast.error(err.message || 'Error sending test email');
    } finally {
      setSendingTestEmail(false);
    }
  };

  const handleOpenBroadcastModal = async () => {
    setShowBroadcastModal(true);
    setBroadcastSubject('');
    setBroadcastMessage('');
    setBroadcastOnlyVerified(true);
    setBroadcastTargetRole('all');
    setExcludedBroadcastUserIds([]);
    setBroadcastSearch('');
    setLoadingBroadcastUsers(true);
    try {
      const res = await fetch('/api/admin/emails/broadcast');
      if (res.ok) {
        const json = await res.json();
        setBroadcastUsersList(json.users || []);
      } else {
        toast.error('Failed to load user list for broadcast');
      }
    } catch (e: any) {
      toast.error(e.message || 'Error loading user list');
    } finally {
      setLoadingBroadcastUsers(false);
    }
  };

  const handleToggleExcludeBroadcastUser = (userId: string) => {
    setExcludedBroadcastUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleToggleExcludeAllBroadcastUsers = () => {
    const visibleUserIds = broadcastUsersList
      .filter(u => {
        if (broadcastTargetRole !== 'all' && u.role !== broadcastTargetRole) return false;
        if (broadcastOnlyVerified && u.emailVerified === false) return false;
        if (broadcastSearch) {
          const q = broadcastSearch.toLowerCase();
          return u.email.toLowerCase().includes(q) || (u.name && u.name.toLowerCase().includes(q));
        }
        return true;
      })
      .map(u => u.id);

    const allVisibleExcluded = visibleUserIds.length > 0 && visibleUserIds.every(id => excludedBroadcastUserIds.includes(id));

    if (allVisibleExcluded) {
      setExcludedBroadcastUserIds(prev => prev.filter(id => !visibleUserIds.includes(id)));
    } else {
      setExcludedBroadcastUserIds(prev => Array.from(new Set([...prev, ...visibleUserIds])));
    }
  };

  const handleSendBroadcastSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastSubject.trim()) {
      toast.error('Please enter a broadcast subject line');
      return;
    }
    if (!broadcastMessage.trim()) {
      toast.error('Please enter the announcement message content');
      return;
    }

    const targetedUsers = broadcastUsersList.filter(u => {
      if (broadcastTargetRole !== 'all' && u.role !== broadcastTargetRole) return false;
      if (broadcastOnlyVerified && u.emailVerified === false) return false;
      if (excludedBroadcastUserIds.includes(u.id)) return false;
      return true;
    });

    if (targetedUsers.length === 0) {
      toast.error('No users match your criteria. All users are currently excluded.');
      return;
    }

    if (!confirm(`Are you sure you want to send this broadcast email to ${pluralize(targetedUsers.length, 'user')} (${excludedBroadcastUserIds.length} excluded)?`)) {
      return;
    }

    setSendingBroadcast(true);
    try {
      const res = await fetch('/api/admin/emails/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: broadcastSubject,
          message: broadcastMessage,
          excludedUserIds: excludedBroadcastUserIds,
          onlyVerified: broadcastOnlyVerified,
          targetRole: broadcastTargetRole,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to dispatch broadcast emails');
      }

      toast.success(json.message || `Broadcast email sent to ${json.stats?.sentCount || targetedUsers.length} users!`);
      setShowBroadcastModal(false);
      fetchSentEmailLogs();
    } catch (err: any) {
      toast.error(err.message || 'Error sending broadcast email');
    } finally {
      setSendingBroadcast(false);
    }
  };

  const fetchAdminBannerConfig = async () => {
    try {
      const res = await fetch('/api/admin/banner');
      if (res.ok) {
        const json = await res.json();
        setBannerEnabled(Boolean(json.enabled));
        setBannerMessage(json.message || '');
        setBannerType(json.type || 'info');
        setBannerLinkUrl(json.linkUrl || '');
        setBannerLinkText(json.linkText || '');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handlePublishBanner = async (enable: boolean, resetDismissals: boolean = false) => {
    if (enable && !bannerMessage.trim()) {
      toast.error('Please enter an announcement message content before publishing');
      return;
    }

    setSavingBanner(true);
    try {
      const res = await fetch('/api/admin/banner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: enable,
          message: bannerMessage,
          type: bannerType,
          linkUrl: bannerLinkUrl,
          linkText: bannerLinkText,
          forceResetDismissal: resetDismissals,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update announcement banner');

      setBannerEnabled(enable);
      toast.success(
        enable
          ? (resetDismissals ? 'Banner published & reset for ALL users!' : 'Site Announcement Banner published & LIVE!')
          : 'Site Announcement Banner turned OFF.'
      );
      fetchAdminBannerConfig();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update banner');
    } finally {
      setSavingBanner(false);
    }
  };

  const fetchSentEmailLogs = async () => {
    setLoadingSentEmailLogs(true);
    try {
      const query = new URLSearchParams({
        page: sentEmailLogsPage.toString(),
        limit: '15',
        type: sentEmailLogsType,
        search: sentEmailLogsSearch,
      });
      const res = await fetch(`/api/admin/emails/logs?${query.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setSentEmailLogsList(json.logs || []);
        if (json.typeCounts) {
          setSentEmailLogsTypeCounts(json.typeCounts);
        }
        if (json.pagination) {
          setSentEmailLogsPagination(json.pagination);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSentEmailLogs(false);
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
    toast.info(`Checking updates for all ${pluralize(careerPagesList.length, 'monitored company career page')}...`);

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

    toast.success(`Check complete! Found ${pluralize(totalFound, 'job')} (${totalAdded} new added).`);
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
    if (!confirm(`Batch ${action} ${pluralize(selectedEmailIds.length, 'selected email')}?`)) return;

    setProcessingBatch(true);
    try {
      const res = await fetch('/api/admin/emails/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailIds: selectedEmailIds, action }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(`Batch ${action} completed for ${pluralize(json.processedCount, 'email')}!`);
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
    if (!confirm(`Are you sure you want to delete ${pluralize(selectedCompanyIds.length, 'selected company career page')}? This action cannot be undone.`)) {
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
        toast.success(json.message || `Deleted ${pluralize(json.processedCount, 'company page')}!`);
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
    const isUserAdminRole = currentUser?.role === 'admin';
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#080c14] text-slate-900 dark:text-slate-100 flex flex-col justify-between">
        <Navbar showBackHome />
        <div className="p-6 md:p-12 max-w-xl mx-auto w-full flex-1 flex items-center justify-center">
          <div className="glass-panel p-8 sm:p-12 rounded-3xl border-slate-200 dark:border-slate-800 text-center space-y-5 shadow-2xl w-full">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {isUserAdminRole ? 'Unable to Load Admin Data' : 'Admin Access Required'}
            </h2>
            {currentUser ? (
              <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-2xl text-xs text-rose-700 dark:text-rose-400 space-y-1">
                <div>Logged in as: <strong>{currentUser.email}</strong></div>
                <div>Current Role: <span className="uppercase font-extrabold">{currentUser.role || 'user'}</span></div>
              </div>
            ) : null}
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {isUserAdminRole ? (
                <>Your admin session is active, but the overview metrics could not be retrieved. Click <strong>Retry Loading</strong> below or refresh the page.</>
              ) : currentUser ? (
                <>Your account (<strong>{currentUser.email}</strong>) has the <strong>{currentUser.role || 'user'}</strong> role. You must be an <strong>admin</strong> to access this page.</>
              ) : (
                <>You must be logged in with an authorized Administrator account to view and manage the JobPingly Admin Suite.</>
              )}
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              {isUserAdminRole ? (
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    loadAdminData();
                  }}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all text-center cursor-pointer flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry Loading
                </button>
              ) : (
                <Link
                  href="/login"
                  className="w-full sm:w-auto px-6 py-3 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all text-center cursor-pointer"
                >
                  Sign In as Admin
                </Link>
              )}
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
    <div className="max-w-7xl mx-auto space-y-6">
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

        {/* CATEGORIES NAVIGATION BAR */}
        <div className="border-t border-slate-200 dark:border-slate-800/80 pt-5 space-y-4">
          {/* Tier 1: Main Category Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Category 1: Overview */}
            <button
              type="button"
              onClick={() => handleTabChange('overview')}
              className={`p-3.5 rounded-2xl text-left border transition-all cursor-pointer flex items-center justify-between ${
                activeTab === 'overview'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-500/30'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${activeTab === 'overview' ? 'bg-white/20 text-white' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'}`}>
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-extrabold text-xs">1. Overview</div>
                  <div className={`text-[11px] font-medium ${activeTab === 'overview' ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>System &amp; Scrapers</div>
                </div>
              </div>
            </button>

            {/* Category 2: Content & Scraping */}
            <button
              type="button"
              onClick={() => handleTabChange(['companies', 'watchlists'].includes(activeTab) ? activeTab : 'companies')}
              className={`p-3.5 rounded-2xl text-left border transition-all cursor-pointer flex items-center justify-between ${
                ['companies', 'watchlists'].includes(activeTab)
                  ? 'bg-purple-600 text-white border-purple-600 shadow-md ring-2 ring-purple-500/30'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${['companies', 'watchlists'].includes(activeTab) ? 'bg-white/20 text-white' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'}`}>
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-extrabold text-xs">2. Content &amp; Pages</div>
                  <div className={`text-[11px] font-medium ${['companies', 'watchlists'].includes(activeTab) ? 'text-purple-100' : 'text-slate-500 dark:text-slate-400'}`}>Career Pages &amp; Lists</div>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${['companies', 'watchlists'].includes(activeTab) ? 'bg-white/20 text-white' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'}`}>
                {companyPagination.total + watchlistPagination.total}
              </span>
            </button>

            {/* Category 3: Users & Access */}
            <button
              type="button"
              onClick={() => handleTabChange(['users', 'unverified'].includes(activeTab) ? activeTab : 'users')}
              className={`p-3.5 rounded-2xl text-left border transition-all cursor-pointer flex items-center justify-between ${
                ['users', 'unverified'].includes(activeTab)
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500/30'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${['users', 'unverified'].includes(activeTab) ? 'bg-white/20 text-white' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-extrabold text-xs">3. Users &amp; Accounts</div>
                  <div className={`text-[11px] font-medium ${['users', 'unverified'].includes(activeTab) ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'}`}>Accounts &amp; Unverified</div>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${['users', 'unverified'].includes(activeTab) ? 'bg-white/20 text-white' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>
                {userPagination.total || metrics?.totalUsers || userList.length}
              </span>
            </button>

            {/* Category 4: Emails, Issues & Audit */}
            <button
              type="button"
              onClick={() => handleTabChange(['emails', 'sent_emails', 'issues', 'audit'].includes(activeTab) ? activeTab : 'emails')}
              className={`p-3.5 rounded-2xl text-left border transition-all cursor-pointer flex items-center justify-between ${
                ['emails', 'sent_emails', 'issues', 'audit'].includes(activeTab)
                  ? 'bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-500/30'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${['emails', 'sent_emails', 'issues', 'audit'].includes(activeTab) ? 'bg-white/20 text-white' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-extrabold text-xs">4. Emails &amp; Audit Logs</div>
                  <div className={`text-[11px] font-medium ${['emails', 'sent_emails', 'issues', 'audit'].includes(activeTab) ? 'text-amber-100' : 'text-slate-500 dark:text-slate-400'}`}>Approvals &amp; Logs</div>
                </div>
              </div>
              {(pendingEmailCount > 0 || openIssuesCount > 0) && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500 text-white animate-pulse">
                  {pendingEmailCount + openIssuesCount}
                </span>
              )}
            </button>
          </div>

          {/* Tier 2: Sub-Tab Pills Bar */}
          {['companies', 'watchlists'].includes(activeTab) && (
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900/90 p-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 animate-in fade-in duration-150 overflow-x-auto">
              <button
                onClick={() => handleTabChange('companies')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                  activeTab === 'companies'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" /> Monitored Career Pages ({companyPagination.total})
              </button>
              <button
                onClick={() => handleTabChange('watchlists')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                  activeTab === 'watchlists'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> Watch Lists Moderation ({watchlistPagination.total})
              </button>
            </div>
          )}

          {['users', 'unverified'].includes(activeTab) && (
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900/90 p-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 animate-in fade-in duration-150 overflow-x-auto">
              <button
                onClick={() => handleTabChange('users')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                  activeTab === 'users'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" /> User Accounts ({userPagination.total || metrics?.totalUsers || userList.length})
              </button>
              <button
                onClick={() => handleTabChange('unverified')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                  activeTab === 'unverified'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Clock className="w-3.5 h-3.5" /> Unverified Emails ({unverifiedPagination.total})
              </button>
            </div>
          )}

          {['emails', 'sent_emails', 'issues', 'audit'].includes(activeTab) && (
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900/90 p-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 animate-in fade-in duration-150 overflow-x-auto">
              <button
                onClick={() => handleTabChange('emails')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                  activeTab === 'emails'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Mail className="w-3.5 h-3.5" /> Email Approvals Queue ({pendingEmailCount})
              </button>

              <button
                onClick={() => handleTabChange('sent_emails')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                  activeTab === 'sent_emails'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <MailCheck className="w-3.5 h-3.5" /> Sent Email History ({sentEmailLogsPagination.total})
              </button>

              <button
                onClick={() => handleTabChange('issues')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                  activeTab === 'issues'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" /> Reported Issues ({openIssuesCount})
              </button>

              <button
                onClick={() => handleTabChange('audit')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                  activeTab === 'audit'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" /> Administrative Audit Log
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ACTIVE TAB CONTENT AREA WITH FIXED MIN-HEIGHT TO PREVENT STRUCTURE MOVEMENT */}
      <div className="min-h-[600px] transition-all duration-150">
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

          {/* Top Site Announcement Banner Configuration Card */}
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleSection('banner')}
                  className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
                  title={collapsedSections.banner ? 'Expand Section' : 'Collapse Section'}
                >
                  {collapsedSections.banner ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                </button>
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/20">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer select-none" onClick={() => toggleSection('banner')}>
                    Top Site Announcement Banner
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Configure a global announcement banner displayed at the top of the site for all users. Users can dismiss it with an X (saved in localStorage).
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2 shrink-0">
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border flex items-center gap-1.5 ${
                  bannerEnabled
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${bannerEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                  {bannerEnabled ? 'LIVE ON SITE' : 'DISABLED / HIDDEN'}
                </span>
              </div>
            </div>

            {!collapsedSections.banner && (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Theme Variant Picker */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Variant Style &amp; Color
                  </label>
                  <select
                    value={bannerType}
                    onChange={e => setBannerType(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                  >
                    <option value="info">🔵 Info / Update (Blue)</option>
                    <option value="warning">🟠 Warning / Alert (Amber)</option>
                    <option value="danger">🔴 Danger / Maintenance (Red)</option>
                    <option value="success">🟢 Success / Launch (Green)</option>
                  </select>
                </div>

                {/* Optional CTA Link URL */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Optional Action Link URL
                  </label>
                  <input
                    type="text"
                    value={bannerLinkUrl}
                    onChange={e => setBannerLinkUrl(e.target.value)}
                    placeholder="e.g. /discover or https://..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-600 font-mono"
                  />
                </div>

                {/* Optional CTA Link Text */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Optional Link Button Label
                  </label>
                  <input
                    type="text"
                    value={bannerLinkText}
                    onChange={e => setBannerLinkText(e.target.value)}
                    placeholder="e.g. Check Watch Lists &rarr;"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-600"
                  />
                </div>
              </div>

              {/* Banner Message Text */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Announcement Message Content *
                </label>
                <input
                  type="text"
                  required
                  value={bannerMessage}
                  onChange={e => setBannerMessage(e.target.value)}
                  placeholder="e.g. Scheduled system maintenance tonight at 10:00 PM UTC."
                  className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:border-purple-600"
                />
              </div>

              {/* Live Preview Bar */}
              {bannerMessage.trim() && (
                <div className="space-y-1 pt-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Live Banner Preview:
                  </span>
                  <div className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between gap-3 text-white shadow-sm ${
                    bannerType === 'warning' ? 'bg-gradient-to-r from-amber-500 to-orange-600' :
                    bannerType === 'danger' ? 'bg-gradient-to-r from-rose-600 to-red-600' :
                    bannerType === 'success' ? 'bg-gradient-to-r from-emerald-600 to-teal-600' :
                    'bg-gradient-to-r from-blue-600 to-indigo-600'
                  }`}>
                    <div className="flex items-center gap-2 truncate">
                      <span className="truncate">{bannerMessage}</span>
                      {bannerLinkUrl && (
                        <span className="px-2 py-0.5 rounded bg-white text-slate-900 text-[10px] font-bold shrink-0">
                          {bannerLinkText || 'Learn More'}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono opacity-80 shrink-0">&times;</span>
                  </div>
                </div>
              )}

              {/* Action Buttons Row */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                {bannerEnabled ? (
                  <button
                    type="button"
                    disabled={savingBanner}
                    onClick={() => handlePublishBanner(false, false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <X className="w-4 h-4" /> Turn Off / Hide Banner
                  </button>
                ) : (
                  <span className="text-xs text-slate-500">
                    Banner is currently turned off. Click Publish to show it on site.
                  </span>
                )}

                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <button
                    type="button"
                    disabled={savingBanner}
                    onClick={() => handlePublishBanner(true, true)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer flex items-center gap-1.5"
                    title="Publish and force reset closed state so even users who clicked X before will see this new message"
                  >
                    <Zap className="w-4 h-4 text-amber-500" /> Re-Publish to ALL Users (Reset Closed State)
                  </button>

                  <button
                    type="button"
                    disabled={savingBanner}
                    onClick={() => handlePublishBanner(true, false)}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Globe className="w-4 h-4" />
                    {savingBanner ? 'Publishing...' : 'Publish & Enable Banner'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

          {/* System Quotas & User Limits Configuration Panel */}
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-5 shadow-sm">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => toggleSection('quotas')}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
                title={collapsedSections.quotas ? 'Expand Section' : 'Collapse Section'}
              >
                {collapsedSections.quotas ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
              </button>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer select-none" onClick={() => toggleSection('quotas')}>
                <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                System Quotas &amp; Site-Wide User Limits
              </h2>
            </div>

            {!collapsedSections.quotas && (
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
                  <option value={-1}>Unlimited Lists</option>
                  <option value={5}>5 Watch Lists</option>
                  <option value={10}>10 Watch Lists (Default)</option>
                  <option value={20}>20 Watch Lists</option>
                  <option value={50}>50 Watch Lists</option>
                  <option value={100}>100 Watch Lists</option>
                  {isCustomList && (
                    <option value="custom">Custom ({maxListsPerUser})</option>
                  )}
                  <option value="custom">Set Custom Value...</option>
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
                  <option value={-1}>Unlimited URLs</option>
                  <option value={10}>10 URLs</option>
                  <option value={25}>25 URLs (Default)</option>
                  <option value={50}>50 URLs</option>
                  <option value={100}>100 URLs</option>
                  <option value={250}>250 URLs</option>
                  {isCustomUrl && (
                    <option value="custom">Custom ({maxUrlsPerList})</option>
                  )}
                  <option value="custom">Set Custom Value...</option>
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
                  <option value={-1}>Unlimited Keywords</option>
                  <option value={10}>10 Keywords</option>
                  <option value={20}>20 Keywords (Default)</option>
                  <option value={50}>50 Keywords</option>
                  <option value={100}>100 Keywords</option>
                  {isCustomKw && (
                    <option value="custom">Custom ({maxKeywordsPerSub})</option>
                  )}
                  <option value="custom">Set Custom Value...</option>
                </select>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Enforced on positive keyword match filters.</p>
              </div>
            </div>
            )}
          </div>

          {/* Feature Flags */}
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => toggleSection('feature_flags')}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
                title={collapsedSections.feature_flags ? 'Expand Section' : 'Collapse Section'}
              >
                {collapsedSections.feature_flags ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
              </button>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer select-none" onClick={() => toggleSection('feature_flags')}>
                <Flag className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                System Feature Flags
              </h2>
            </div>

            {!collapsedSections.feature_flags && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...flags].sort((a, b) => a.key.localeCompare(b.key)).map(f => {
                const isLimitFlag = f.key.startsWith('limits.');
                const isUnlimited = isLimitFlag && (f.value === -1 || f.value === '-1' || f.value === false || f.value === 'false');
                const isEnabled = !isUnlimited && (f.value === true || f.value === 'true' || Number(f.value) > 0);

                return (
                  <div key={f.key} className="glass-card p-4 rounded-2xl border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 min-w-0 overflow-hidden">
                    <div className="space-y-1 min-w-0 flex-1">
                      <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 block break-all">
                        {f.key}
                      </span>
                      <span className="text-xs text-slate-600 dark:text-slate-400 block truncate">
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
                      className={`w-11 h-6 rounded-full transition-colors p-0.5 relative flex items-center cursor-pointer shrink-0 ml-1 ${
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
          )}
          </div>

          {/* Master Scrape Timer Control Bar (Placed directly above Monitored Career Pages) */}
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleSection('master_timer')}
                  className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
                  title={collapsedSections.master_timer ? 'Expand Section' : 'Collapse Section'}
                >
                  {collapsedSections.master_timer ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                </button>
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/20">
                  <Timer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 cursor-pointer select-none" onClick={() => toggleSection('master_timer')}>
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

              {!collapsedSections.master_timer && (
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
                        <option value="custom">Custom Period...</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Monitored Pages Table with Items Per Page Dropdown & Server Pagination */}
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleSection('career_pages')}
                  className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
                  title={collapsedSections.career_pages ? 'Expand Section' : 'Collapse Section'}
                >
                  {collapsedSections.career_pages ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                </button>
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer select-none" onClick={() => toggleSection('career_pages')}>
                    <Cpu className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    Monitored Company Career Pages ({companyPagination.total})
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isGlobalTimerOn
                      ? `Master Timer Active: All sites auto-check every ${formatMins(globalIntervalMinutes)}.`
                      : 'Individual Timers Active: Sites check on per-site intervals.'}
                  </p>
                </div>
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

            {!collapsedSections.career_pages && (
              <div className="space-y-4">

            {/* Batch Action Bar for Company Career Pages */}
            {selectedCompanyIds.length > 0 && (
              <div className="flex items-center justify-between gap-4 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 animate-in fade-in duration-150">
                <div className="flex items-center gap-2 font-bold text-xs">
                  <CheckSquare className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <span>{pluralize(selectedCompanyIds.length, 'company career page')} selected</span>
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
                <thead className="bg-slate-100/90 dark:bg-slate-900/90 text-slate-500 dark:text-slate-400 uppercase font-extrabold border-b border-slate-200 dark:border-slate-800 text-[11px] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3.5 w-10 text-center">
                      <button
                        type="button"
                        onClick={toggleSelectAllCompanies}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        title={isAllCompaniesSelected ? 'Deselect All' : 'Select All'}
                      >
                        {isAllCompaniesSelected ? (
                          <CheckSquare className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                        ) : (
                          <Square className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </th>
                    <th className="py-2.5 px-3.5">Company &amp; Target URL</th>
                    <th className="py-2.5 px-3.5">Status</th>
                    <th className="py-2.5 px-3.5">Check Interval</th>
                    <th className="py-2.5 px-3.5">Last Checked</th>
                    <th className="py-2.5 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
                  {loadingPages ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center">
                        <LoadingSpinner message="Loading company career pages..." fullPage={false} />
                      </td>
                    </tr>
                  ) : careerPagesList.map((p: any) => {
                    const isPaused = p.status === 'paused';
                    const isSelected = selectedCompanyIds.includes(p.id);
                    return (
                      <tr key={p.id} className={`hover:bg-slate-100/60 dark:hover:bg-slate-900/40 transition-colors ${isSelected ? 'bg-purple-50/50 dark:bg-purple-950/20' : ''}`}>
                        <td className="py-2.5 px-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => toggleSelectCompanyRow(p.id)}
                            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                            ) : (
                              <Square className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>

                        <td className="py-2.5 px-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white text-xs block">{p.companyName || 'Unknown'}</span>
                            {p.watchListCount > 0 ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-[9px] font-extrabold">
                                <Layers className="w-2.5 h-2.5" /> {p.watchListCount} Lists
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-[9px] font-extrabold">
                                Orphaned
                              </span>
                            )}
                          </div>
                          <a href={p.url} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[240px] block mt-0.5" title={p.url}>
                            {p.url}
                          </a>
                        </td>

                        <td className="py-2.5 px-3.5">
                          <button
                            onClick={() => handleUpdatePageMonitoring(p.id, p.status)}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase flex items-center gap-1 cursor-pointer transition-all border ${
                              isPaused
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700'
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-slate-400' : 'bg-emerald-500 animate-pulse'}`} />
                            {isPaused ? 'PAUSED' : 'ACTIVE'}
                          </button>
                        </td>

                        <td className="py-2.5 px-3.5">
                          {isGlobalTimerOn ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/30 text-[10px] font-extrabold">
                              <Timer className="w-3 h-3" /> MASTER ({formatMins(globalIntervalMinutes)})
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
                              className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-[11px] font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 cursor-pointer"
                            >
                              <option value={30}>Every 30 mins</option>
                              <option value={60}>Every 1 hour</option>
                              <option value={180}>Every 3 hours</option>
                              <option value={360}>Every 6 hours</option>
                              <option value={720}>Every 12 hours</option>
                              <option value={1440}>Every 24 hours (1 day)</option>
                              <option value={10080}>Every 7 days (1 week)</option>
                              <option value={43200}>Every 30 days (1 month)</option>
                              {![30, 60, 180, 360, 720, 1440, 43200].includes(p.checkIntervalMinutes || 180) && (
                                <option value="custom">Custom: Every {formatMins(p.checkIntervalMinutes)}</option>
                              )}
                              <option value="custom">⚙ Custom Period...</option>
                            </select>
                          )}
                        </td>

                        <td className="py-2.5 px-3.5 text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap font-mono">
                          {p.lastScrapedAt ? (
                            <span>{new Date(p.lastScrapedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} {new Date(p.lastScrapedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          ) : (
                            'Never'
                          )}
                        </td>

                        <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleForceScrape(p.id)}
                              disabled={triggeringId === p.id}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 inline-flex items-center gap-1 shadow-sm cursor-pointer transition-all"
                            >
                              <RefreshCw className={`w-3 h-3 ${triggeringId === p.id ? 'animate-spin' : ''}`} />
                              {triggeringId === p.id ? 'Checking...' : 'Check'}
                            </button>

                            <button
                              onClick={() => handleDeleteSingleCompany(p.id, p.companyName || p.url)}
                              disabled={deletingCompanyId === p.id}
                              className="p-1 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 cursor-pointer transition-all disabled:opacity-50 flex items-center justify-center"
                              title="Delete company career page"
                            >
                              <Trash2 className={`w-3 h-3 ${deletingCompanyId === p.id ? 'animate-spin' : ''}`} />
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
                  Showing Page <span className="font-bold text-slate-900 dark:text-white">{companyPagination.page}</span> of <span className="font-bold text-slate-900 dark:text-white">{companyPagination.totalPages}</span> ({pluralize(companyPagination.total, 'total item')})
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
          )}
          </div>
        </div>
      )}

      {/* EMAIL APPROVALS & FREQUENCY ENFORCEMENT TAB */}
      {activeTab === 'emails' && (
        <div className="space-y-6">
          {/* Notification Digest Frequency Policy & User Control Policy Card */}
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleSection('frequency_policy')}
                  className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
                  title={collapsedSections.frequency_policy ? 'Expand Section' : 'Collapse Section'}
                >
                  {collapsedSections.frequency_policy ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                </button>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2.5 cursor-pointer select-none" onClick={() => toggleSection('frequency_policy')}>
                    <Sliders className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    Notification Digest Frequency Policy &amp; User Control
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Control and enforce email digest notification frequency for users globally, with granular user-level exemption toggles.
                  </p>
                </div>
              </div>

              {/* Enable Policy Toggle Switch */}
              <div className="flex items-center gap-3 glass-card px-4 py-2.5 rounded-2xl border-slate-200 dark:border-slate-800 shrink-0">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Enforce Global Policy:
                </span>
                <button
                  onClick={() => handleSaveFrequencyPolicy(!freqEnforceGlobal, freqEnforceValue)}
                  disabled={savingFreqPolicy}
                  type="button"
                  className={`w-11 h-6 rounded-full transition-colors p-0.5 relative flex items-center cursor-pointer disabled:opacity-50 ${
                    freqEnforceGlobal ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform transform shadow-sm ${
                      freqEnforceGlobal ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className={`text-xs font-extrabold uppercase ${freqEnforceGlobal ? 'text-purple-600 dark:text-purple-400' : 'text-slate-500'}`}>
                  {freqEnforceGlobal ? 'ENFORCED' : 'UNENFORCED'}
                </span>
              </div>
            </div>

            {!collapsedSections.frequency_policy && (
              <div className="space-y-6 pt-2">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Enforced Frequency Option
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Non-exempt users will have their notification frequency dropdown bound to this setting.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <select
                    value={FREQUENCY_OPTIONS.some(o => o.value === normalizeFrequencyValue(freqEnforceValue)) ? normalizeFrequencyValue(freqEnforceValue) : 'custom'}
                    onChange={(e) => {
                      const selectedVal = e.target.value;
                      if (selectedVal === 'custom') {
                        const defaultCustom = buildCustomFrequency(3, 'hours');
                        setFreqEnforceValue(defaultCustom);
                        if (freqEnforceGlobal) handleSaveFrequencyPolicy(true, defaultCustom);
                      } else {
                        setFreqEnforceValue(selectedVal);
                        if (freqEnforceGlobal) handleSaveFrequencyPolicy(true, selectedVal);
                      }
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-purple-600 cursor-pointer"
                  >
                    {FREQUENCY_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  {!freqEnforceGlobal && (
                    <button
                      onClick={() => handleSaveFrequencyPolicy(true, freqEnforceValue)}
                      disabled={savingFreqPolicy}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-sm disabled:opacity-50 cursor-pointer transition-colors whitespace-nowrap"
                    >
                      Enable &amp; Enforce
                    </button>
                  )}
                </div>
              </div>

              {/* Custom Interval Builder Box (Rendered when custom option is selected) */}
              {(freqEnforceValue === 'custom' || freqEnforceValue.startsWith('custom_')) && (
                <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5" /> Configure Custom Frequency Interval
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-extrabold uppercase">
                      ACTIVE CUSTOM
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Repeat Every:</span>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={parseCustomFrequency(freqEnforceValue).num}
                        onChange={(e) => {
                          const newNum = Math.max(1, parseInt(e.target.value, 10) || 1);
                          const { unit } = parseCustomFrequency(freqEnforceValue);
                          const newCustom = buildCustomFrequency(newNum, unit);
                          setFreqEnforceValue(newCustom);
                          if (freqEnforceGlobal) handleSaveFrequencyPolicy(true, newCustom);
                        }}
                        className="w-20 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-700 text-xs font-black text-slate-900 dark:text-white focus:outline-none text-center"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Unit:</span>
                      <select
                        value={parseCustomFrequency(freqEnforceValue).unit}
                        onChange={(e) => {
                          const newUnit = e.target.value as 'hours' | 'days' | 'weeks';
                          const { num } = parseCustomFrequency(freqEnforceValue);
                          const newCustom = buildCustomFrequency(num, newUnit);
                          setFreqEnforceValue(newCustom);
                          if (freqEnforceGlobal) handleSaveFrequencyPolicy(true, newCustom);
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-700 text-xs font-extrabold text-purple-700 dark:text-purple-300 focus:outline-none cursor-pointer"
                      >
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                        <option value="weeks">Weeks</option>
                      </select>
                    </div>

                    <div className="text-xs font-bold text-slate-600 dark:text-slate-400 pl-2 border-l border-purple-300 dark:border-purple-700">
                      Summary: <span className="text-purple-600 dark:text-purple-400 font-extrabold">{formatFrequencyLabel(freqEnforceValue)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Users</span>
                  <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{freqStats.totalUsers}</p>
                </div>
                <Users className="w-6 h-6 text-slate-400" />
              </div>

              <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/30 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider">Bound / Enforced Users</span>
                  <p className="text-xl font-black text-purple-700 dark:text-purple-300 mt-1">{freqStats.enforcedUsersCount}</p>
                </div>
                <Lock className="w-6 h-6 text-purple-500" />
              </div>

              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Exempt / Self-Managed Users</span>
                  <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1">{freqStats.exemptUsersCount}</p>
                </div>
                <UserCheck className="w-6 h-6 text-emerald-500" />
              </div>
            </div>

            {/* User Exemption Management Table & Filters */}
            <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl overflow-x-auto">
                  <button
                    onClick={() => { setFreqUserFilter('all'); setFreqUserPage(1); }}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      freqUserFilter === 'all'
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    All Users ({freqStats.totalUsers})
                  </button>

                  <button
                    onClick={() => { setFreqUserFilter('enforced'); setFreqUserPage(1); }}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      freqUserFilter === 'enforced'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Applied on Users ({freqStats.enforcedUsersCount})
                  </button>

                  <button
                    onClick={() => { setFreqUserFilter('exempt'); setFreqUserPage(1); }}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      freqUserFilter === 'exempt'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Not Applied / Exempt ({freqStats.exemptUsersCount})
                  </button>
                </div>

                <div className="relative flex-1 max-w-xs">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={freqUserSearch}
                    onChange={(e) => { setFreqUserSearch(e.target.value); setFreqUserPage(1); }}
                    placeholder="Search user email or name..."
                    className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-purple-600"
                  />
                </div>
              </div>

              {/* Batch Action Toolbar for Exemption */}
              {freqSelectedUserIds.length > 0 && (
                <div className="p-4 rounded-2xl bg-purple-600 text-white shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <CheckSquare className="w-4 h-4" />
                    <span>{pluralize(freqSelectedUserIds.length, 'user')} selected</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleUserExemption(freqSelectedUserIds, true)}
                      disabled={savingFreqExemption}
                      className="px-4 py-2 rounded-xl text-xs font-extrabold bg-white text-purple-700 hover:bg-slate-100 shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                      {savingFreqExemption ? 'Updating...' : 'Exempt Selected Users'}
                    </button>

                    <button
                      onClick={() => handleToggleUserExemption(freqSelectedUserIds, false)}
                      disabled={savingFreqExemption}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-800 hover:bg-purple-900 text-white shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                      {savingFreqExemption ? 'Updating...' : 'Enforce Policy on Selected'}
                    </button>

                    <button
                      onClick={() => setFreqSelectedUserIds([])}
                      className="px-3 py-2 rounded-xl text-xs text-purple-200 hover:text-white cursor-pointer"
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>
              )}

              {/* Users Exemption Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs text-slate-800 dark:text-slate-200">
                  <thead className="bg-slate-100/90 dark:bg-slate-900/90 uppercase text-[11px] font-extrabold text-slate-500 border-b border-slate-200 dark:border-slate-800 tracking-wider">
                    <tr>
                      <th className="px-3.5 py-2.5 w-10 text-center">
                        <button
                          onClick={() => {
                            if (freqSelectedUserIds.length === freqUsers.length) {
                              setFreqSelectedUserIds([]);
                            } else {
                              setFreqSelectedUserIds(freqUsers.map(u => u.id));
                            }
                          }}
                          className="cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          {freqUsers.length > 0 && freqSelectedUserIds.length === freqUsers.length ? (
                            <CheckSquare className="w-3.5 h-3.5 text-purple-600" />
                          ) : (
                            <Square className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </th>
                      <th className="px-3.5 py-2.5">User</th>
                      <th className="px-3.5 py-2.5">Role</th>
                      <th className="px-3.5 py-2.5">Enforcement Policy</th>
                      <th className="px-3.5 py-2.5">Effective Interval</th>
                      <th className="px-3.5 py-2.5 text-right">Exemption Toggle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {loadingFreqUsers ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-500">
                          <LoadingSpinner message="Loading user policies..." fullPage={false} />
                        </td>
                      </tr>
                    ) : freqUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-500 text-xs">
                          No users found matching filter criteria.
                        </td>
                      </tr>
                    ) : (
                      freqUsers.map((u) => {
                        const isSelected = freqSelectedUserIds.includes(u.id);
                        return (
                          <tr key={u.id} className={`hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors ${isSelected ? 'bg-purple-500/5' : ''}`}>
                            <td className="px-3.5 py-2.5 text-center">
                              <button
                                onClick={() => {
                                  if (isSelected) {
                                    setFreqSelectedUserIds(freqSelectedUserIds.filter(id => id !== u.id));
                                  } else {
                                    setFreqSelectedUserIds([...freqSelectedUserIds, u.id]);
                                  }
                                }}
                                className="cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                              >
                                {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-purple-600" /> : <Square className="w-3.5 h-3.5" />}
                              </button>
                            </td>
                            <td className="px-3.5 py-2.5">
                              <div className="font-bold text-slate-900 dark:text-white text-xs truncate max-w-[180px]">{u.name || 'Unnamed User'}</div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-[180px]">{u.email}</div>
                            </td>
                            <td className="px-3.5 py-2.5">
                              <span className="capitalize text-[10px] font-extrabold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase">
                                {u.role}
                              </span>
                            </td>
                            <td className="px-3.5 py-2.5">
                              {u.isEnforced ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/30 text-[10px] font-extrabold uppercase">
                                  <Lock className="w-3 h-3" /> Enforced Policy
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold uppercase">
                                  <UserCheck className="w-3 h-3" /> Exempt (Self-Managed)
                                </span>
                              )}
                            </td>
                            <td className="px-3.5 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {formatFrequencyLabel(u.effectiveFrequency)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right">
                              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean(u.frequencyEnforcementExempt)}
                                  onChange={(e) => handleToggleUserExemption([u.id], e.target.checked)}
                                  disabled={savingFreqExemption}
                                  className="w-3.5 h-3.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer disabled:opacity-50"
                                />
                                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                  Exempt
                                </span>
                              </label>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls for Frequency Users */}
              {freqUserPagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-3">
                  <span className="text-xs text-slate-500">
                    Page {freqUserPagination.page} of {freqUserPagination.totalPages} ({freqUserPagination.total} total)
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setFreqUserPage(p => Math.max(1, p - 1))}
                      disabled={freqUserPage === 1}
                      className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-40 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => setFreqUserPage(p => Math.min(freqUserPagination.totalPages, p + 1))}
                      disabled={freqUserPage >= freqUserPagination.totalPages}
                      className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-40 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
              </div>
            </div>
          )}
        </div>

          <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleSection('email_approvals')}
                  className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
                  title={collapsedSections.email_approvals ? 'Expand Section' : 'Collapse Section'}
                >
                  {collapsedSections.email_approvals ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                </button>
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer select-none" onClick={() => toggleSection('email_approvals')}>
                    <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    Email Approval Queue &amp; Management ({emailPagination.total})
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Approve, unapprove, or manually add email addresses authorized for digest delivery.
                  </p>
                </div>
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

            {!collapsedSections.email_approvals && (
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

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleOpenBroadcastModal}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-sm flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <MailCheck className="w-4 h-4" /> Broadcast Announcement
                </button>

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

            {/* Single Batch Group Action Toolbar */}
          {selectedEmailIds.length > 0 && (
            <div className="p-4 rounded-2xl bg-blue-600 text-white shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-2 text-xs font-bold">
                <CheckSquare className="w-4 h-4" />
                <span>{pluralize(selectedEmailIds.length, 'email')} selected for batch action</span>
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
            <table className="w-full text-left">
              <thead className="bg-slate-100/90 dark:bg-slate-900/90 text-slate-500 dark:text-slate-400 uppercase font-extrabold border-b border-slate-200 dark:border-slate-800 text-[11px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3.5 w-10 text-center">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {isAllFilteredSelected ? (
                        <CheckSquare className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <Square className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </th>
                  <th className="py-2.5 px-3.5">Email &amp; Account</th>
                  <th className="py-2.5 px-3.5">Status</th>
                  <th className="py-2.5 px-3.5">Requested</th>
                  <th className="py-2.5 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
                {loadingEmails ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center">
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
                      <td className="py-2.5 px-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => toggleSelectRow(e.id)}
                          className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <Square className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>

                      <td className="py-2.5 px-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 dark:text-white text-xs block truncate max-w-[200px]">{e.email}</span>
                          <button
                            type="button"
                            onClick={() => handleInspectSubscriptions(e.email)}
                            className="text-[10px] font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-0.5 cursor-pointer shrink-0"
                            title="Inspect watch lists and URLs sending emails to this address"
                          >
                            <Layers className="w-2.5 h-2.5" /> Audit
                          </button>
                        </div>
                        <span className="text-slate-500 dark:text-slate-400 text-[11px] block truncate max-w-[200px]">
                          {e.userName ? `User: ${e.userName}` : 'Manual'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3.5">
                        {e.status === 'approved' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold uppercase">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Approved
                          </span>
                        )}
                        {e.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-extrabold uppercase">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Pending
                          </span>
                        )}
                        {e.status === 'unapproved' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[10px] font-extrabold uppercase">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Revoked
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3.5 text-slate-500 dark:text-slate-400 text-[11px] font-mono whitespace-nowrap">
                        {new Date(e.requestedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} {new Date(e.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>

                      <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openTestEmailModalFor(e.email)}
                            title="Send Brevo Test Email"
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 flex items-center gap-1 cursor-pointer"
                          >
                            <Mail className="w-3 h-3" /> Test
                          </button>
                          {e.status === 'pending' || e.status === 'unapproved' ? (
                            <button
                              onClick={() => handleApproveEmail(e.id)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm cursor-pointer"
                            >
                              Approve
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUnapproveEmail(e.id)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 cursor-pointer"
                            >
                              Revoke
                            </button>
                          )}
                        </div>
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
                Page <span className="font-bold text-slate-900 dark:text-white">{emailPagination.page}</span> of <span className="font-bold text-slate-900 dark:text-white">{emailPagination.totalPages}</span> ({pluralize(emailPagination.total, 'total item')})
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
        </div>
      </div>
    )}

      {/* USER MODERATION TAB WITH ENV ADMIN PROTECTION & PAGINATION */}
      {activeTab === 'users' && (
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => toggleSection('users')}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
                title={collapsedSections.users ? 'Expand Section' : 'Collapse Section'}
              >
                {collapsedSections.users ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
              </button>
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer select-none" onClick={() => toggleSection('users')}>
                  <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Registered User Moderation ({userPagination.total})
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Manage user access permissions, upgrade/downgrade roles, and enforce ENV Superadmin safety locks.
                </p>
              </div>
            </div>
          </div>

          {!collapsedSections.users && (
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

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm text-slate-800 dark:text-slate-200">
              <thead className="bg-slate-100/90 dark:bg-slate-900/90 text-slate-500 dark:text-slate-400 uppercase font-extrabold border-b border-slate-200 dark:border-slate-800 text-[11px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3.5">User Account</th>
                  <th className="py-2.5 px-3.5">Role</th>
                  <th className="py-2.5 px-3.5">Status</th>
                  <th className="py-2.5 px-3.5">Joined</th>
                  <th className="py-2.5 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
                {loadingUsers ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center">
                      <LoadingSpinner message="Loading user accounts..." fullPage={false} />
                    </td>
                  </tr>
                ) : userList.map((u: any) => (
                  <tr key={u.id} className="hover:bg-slate-100/60 dark:hover:bg-slate-900/40">
                    <td className="py-2.5 px-3.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedUserId(u.id)}
                          className="text-left group/user cursor-pointer"
                          title="Click to view User Profile & Published Watchlists"
                        >
                          <span className="font-bold text-slate-900 dark:text-white text-xs block group-hover/user:underline group-hover/user:text-blue-600 dark:group-hover/user:text-blue-400 transition-colors">{u.name || 'User'}</span>
                          <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px] block group-hover/user:underline truncate max-w-[180px]">{u.email}</span>
                        </button>
                        {u.isEnvAdmin && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[9px] font-extrabold uppercase flex items-center gap-0.5 shrink-0">
                            <Lock className="w-2.5 h-2.5" /> SUPERADMIN
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleInspectSubscriptions(u.email)}
                          className="text-[10px] font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-0.5 shrink-0"
                          title="Inspect watch lists and URLs"
                        >
                          <Layers className="w-2.5 h-2.5" /> Audit
                        </button>
                      </div>
                    </td>

                    <td className="py-2.5 px-3.5">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase border ${
                        u.role === 'admin'
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                          : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                      }`}>
                        {u.role}
                      </span>
                    </td>

                    <td className="py-2.5 px-3.5">
                      {u.isBlocked ? (
                        <span
                          title={u.blockedReason || 'Blocked by administrator'}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[10px] font-extrabold uppercase"
                        >
                          <Ban className="w-3 h-3" /> Blocked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold uppercase">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-3.5 text-slate-500 dark:text-slate-400 text-[11px] font-mono whitespace-nowrap">
                      {new Date(u.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>

                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                      {u.isEnvAdmin ? (
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-not-allowed inline-flex items-center gap-1 uppercase">
                          <Lock className="w-3 h-3" /> Protected
                        </span>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleChangeRole(u.id, u.role, u.isEnvAdmin)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer border border-slate-200 dark:border-slate-700"
                          >
                            Role
                          </button>

                          <button
                            onClick={() => handleToggleBlockUser(u.id, Boolean(u.isBlocked), u.email, Boolean(u.isEnvAdmin))}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                              u.isBlocked
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/20'
                            }`}
                          >
                            {u.isBlocked ? 'Unblock' : 'Block'}
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
                Page <span className="font-bold text-slate-900 dark:text-white">{userPagination.page}</span> of <span className="font-bold text-slate-900 dark:text-white">{userPagination.totalPages}</span> ({pluralize(userPagination.total, 'total registered user')})
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
        </div>
      )}

      {/* ALL WATCH LISTS MODERATION TAB WITH SERVER PAGINATION & SEARCH */}
      {activeTab === 'watchlists' && (
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => toggleSection('watchlists')}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
                title={collapsedSections.watchlists ? 'Expand Section' : 'Collapse Section'}
              >
                {collapsedSections.watchlists ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
              </button>
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer select-none" onClick={() => toggleSection('watchlists')}>
                  <Layers className="w-4 h-4 text-purple-500" />
                  All Watch Lists Moderation ({watchlistPagination.total})
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Browse, search by user or list name, edit details, or delete watch lists created by all users across the platform.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Active vs Trash Sub-Tab Switcher */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setWatchlistStatusFilter('active');
                    setWatchlistPage(1);
                    setSelectedWatchlistIds([]);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    watchlistStatusFilter === 'active'
                      ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Active</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setWatchlistStatusFilter('deleted');
                    setWatchlistPage(1);
                    setSelectedWatchlistIds([]);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    watchlistStatusFilter === 'deleted'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Trash</span>
                </button>
              </div>

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
                onClick={() => fetchPaginatedWatchlists(watchlistPage, debouncedWatchlistSearch, watchlistLimit, watchlistVisibilityFilter, watchlistCanonicalFilter, watchlistUserIdFilter, watchlistStatusFilter)}
                className="px-3.5 py-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingWatchlists ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {!collapsedSections.watchlists && (
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
                {watchlistStatusFilter === 'deleted' ? (
                  <>
                    <button
                      type="button"
                      disabled={processingWatchlistBatch}
                      onClick={() => handleBatchWatchlistAction('restore')}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-1 disabled:opacity-50"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Restore Selected
                    </button>

                    <button
                      type="button"
                      disabled={processingWatchlistBatch}
                      onClick={() => handleBatchWatchlistAction('permanent_delete')}
                      className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-1 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Permanently Delete
                    </button>
                  </>
                ) : (
                  <>
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
                      onClick={() => handleBatchWatchlistAction('soft_delete')}
                      className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-1 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Move to Trash
                    </button>
                  </>
                )}

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
                      {wl.deletedAt ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleRestoreWatchlist(wl.id, wl.name)}
                            className="p-1.5 rounded-lg border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-all cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                            title="Restore Watch List"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-emerald-500" /> Restore
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePermanentDeleteWatchlist(wl.id, wl.name)}
                            className="p-1.5 rounded-lg border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                            title="Permanently Delete Watch List"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-500" /> Hard Delete
                          </button>
                        </>
                      ) : (
                        <>
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
                            onClick={() => handleSoftDeleteWatchlist(wl.id, wl.name)}
                            className="p-1.5 rounded-lg border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                            title="Move Watchlist to Trash"
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
                        </>
                      )}
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
                        className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                        title="Select all watch lists on this page"
                      />
                    </th>
                    <th className="py-2.5 px-3.5">Watch List &amp; Slug</th>
                    <th className="py-2.5 px-3.5">Curator / Owner</th>
                    <th className="py-2.5 px-3.5">Visibility</th>
                    <th className="py-2.5 px-3.5">Metrics</th>
                    <th className="py-2.5 px-3.5">Created</th>
                    <th className="py-2.5 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
                  {watchlistList.map((wl: any) => (
                    <tr key={wl.id} className={`hover:bg-slate-100/60 dark:hover:bg-slate-900/40 ${selectedWatchlistIds.includes(wl.id) ? 'bg-purple-500/5 dark:bg-purple-500/10' : ''}`}>
                      <td className="py-2.5 px-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedWatchlistIds.includes(wl.id)}
                          onChange={() => handleToggleWatchlistSelect(wl.id)}
                          className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-3.5">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/lists/${wl.slug}`}
                            target="_blank"
                            className="font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 text-xs flex items-center gap-1 transition-colors truncate max-w-[200px]"
                          >
                            {wl.name}
                            <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                          </Link>
                          <span className="text-[10px] font-mono text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.2 rounded border border-purple-500/20 shrink-0">
                            /{wl.slug}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (wl.userId) setSelectedUserId(wl.userId);
                          }}
                          className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer text-xs group/user"
                          title="Click to view Curator Profile"
                        >
                          <span className="font-semibold text-slate-900 dark:text-white text-xs underline-offset-2 group-hover/user:underline truncate max-w-[140px]">{wl.userName || 'User'}</span>
                          <span className="text-[10px] text-slate-400 font-mono truncate max-w-[120px]">({wl.userEmail || wl.userId})</span>
                        </button>
                      </td>

                      <td className="py-2.5 px-3.5">
                        <div className="flex items-center gap-1">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase flex items-center gap-1 border ${
                            wl.visibility === 'public'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${wl.visibility === 'public' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            {wl.visibility}
                          </span>
                          {wl.isCanonical !== false && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 uppercase">
                              Canonical
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-3.5 text-xs text-slate-600 dark:text-slate-400 font-mono">
                        {wl.companyCount || 0} pages • {wl.jobCount || 0} jobs
                      </td>

                      <td className="py-2.5 px-3.5 text-slate-500 dark:text-slate-400 text-[11px] font-mono whitespace-nowrap">
                        {new Date(wl.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>

                      <td className="py-2.5 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {wl.deletedAt ? (
                            <>
                              <button
                                onClick={() => handleRestoreWatchlist(wl.id, wl.name)}
                                className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                                title="Restore Watch List"
                              >
                                <RefreshCw className="w-3.5 h-3.5" /> Restore
                              </button>

                              <button
                                onClick={() => handlePermanentDeleteWatchlist(wl.id, wl.name)}
                                className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                                title="Permanently Delete Watch List"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Hard Delete
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleOpenEditWatchlist(wl)}
                                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
                                title="Edit Watchlist Details"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-blue-500" /> Edit
                              </button>

                              <button
                                onClick={() => handleSoftDeleteWatchlist(wl.id, wl.name)}
                                className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                                title="Move Watchlist to Trash"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Move to Trash
                              </button>
                            </>
                          )}
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
                Page <span className="font-bold text-slate-900 dark:text-white">{watchlistPagination.page}</span> of <span className="font-bold text-slate-900 dark:text-white">{watchlistPagination.totalPages}</span> ({pluralize(watchlistPagination.total, 'total watch list')})
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
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
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
      {(activeTab as string) === 'unverified' && (
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
                Page <span className="font-bold text-slate-900 dark:text-white">{unverifiedPagination.page}</span> of <span className="font-bold text-slate-900 dark:text-white">{unverifiedPagination.totalPages}</span> ({pluralize(unverifiedPagination.total, 'unverified signup')})
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
      {(activeTab as string) === 'issues' && (
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
                Page <span className="font-bold text-slate-900 dark:text-white">{issuesPagination.page}</span> of <span className="font-bold text-slate-900 dark:text-white">{issuesPagination.totalPages}</span> ({pluralize(issuesPagination.total, 'issue')})
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
        </div>
      )}

      {/* AUDIT LOG TAB WITH INFINITE SCROLL */}
      {activeTab === 'audit' && (
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => toggleSection('audit')}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
                title={collapsedSections.audit ? 'Expand Section' : 'Collapse Section'}
              >
                {collapsedSections.audit ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
              </button>
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer select-none" onClick={() => toggleSection('audit')}>
                  <History className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  Administrative Audit Trail ({auditLogs.length} loaded)
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Scroll down to automatically load more logs</p>
              </div>
            </div>
          </div>

          {!collapsedSections.audit && (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800/80">
            <table className="w-full text-left text-xs text-slate-800 dark:text-slate-200">
              <thead className="sticky top-0 z-10 bg-slate-100/90 dark:bg-slate-900/90 text-slate-500 dark:text-slate-400 uppercase font-extrabold border-b border-slate-200 dark:border-slate-800 text-[11px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3.5">Timestamp</th>
                  <th className="py-2.5 px-3.5">Admin</th>
                  <th className="py-2.5 px-3.5">Action</th>
                  <th className="py-2.5 px-3.5">Target Entity</th>
                  <th className="py-2.5 px-3.5">Parameters</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
                {auditLogs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-slate-100/60 dark:hover:bg-slate-900/40 font-mono text-[11px]">
                    <td className="py-2.5 px-3.5 text-slate-500 whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="py-2.5 px-3.5 font-bold text-slate-900 dark:text-white font-sans whitespace-nowrap">{log.adminName || log.adminEmail || 'Admin'}</td>
                    <td className="py-2.5 px-3.5"><span className="bg-purple-500/10 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border border-purple-500/20">{log.action}</span></td>
                    <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-400 max-w-[180px] truncate" title={`${log.targetType}: ${log.targetId}`}>{log.targetType}: <span className="text-slate-900 dark:text-white font-bold">{log.targetId}</span></td>
                    <td className="py-2.5 px-3.5 text-slate-500 max-w-[250px] truncate" title={JSON.stringify(log.metadata || {})}>{JSON.stringify(log.metadata || {})}</td>
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
        )}
      </div>
    )}

      {/* SENT EMAIL HISTORY LOGS TAB */}
      {activeTab === 'sent_emails' && (
        <div className="space-y-6">
          {/* Automated System Email Delivery Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => { setSentEmailLogsType('otp'); setSentEmailLogsPage(1); }}
              className={`p-4 rounded-2xl border transition-all cursor-pointer text-left flex items-center justify-between ${
                sentEmailLogsType === 'otp' ? 'bg-blue-500/10 border-blue-500/50 shadow-sm' : 'bg-slate-100/80 dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div>
                <p className="text-[11px] font-extrabold uppercase text-slate-400 tracking-wider flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5 text-blue-500" /> OTP Codes</p>
                <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{sentEmailLogsTypeCounts.otp || 0}</p>
              </div>
              <span className="px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 font-extrabold text-[10px] uppercase border border-blue-500/20">FILTER</span>
            </button>

            <button
              type="button"
              onClick={() => { setSentEmailLogsType('digest'); setSentEmailLogsPage(1); }}
              className={`p-4 rounded-2xl border transition-all cursor-pointer text-left flex items-center justify-between ${
                sentEmailLogsType === 'digest' ? 'bg-purple-500/10 border-purple-500/50 shadow-sm' : 'bg-slate-100/80 dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div>
                <p className="text-[11px] font-extrabold uppercase text-slate-400 tracking-wider flex items-center gap-1.5"><Inbox className="w-3.5 h-3.5 text-purple-500" /> Job Digests</p>
                <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{sentEmailLogsTypeCounts.digest || 0}</p>
              </div>
              <span className="px-2 py-0.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 font-extrabold text-[10px] uppercase border border-purple-500/20">FILTER</span>
            </button>

            <button
              type="button"
              onClick={() => { setSentEmailLogsType('invite'); setSentEmailLogsPage(1); }}
              className={`p-4 rounded-2xl border transition-all cursor-pointer text-left flex items-center justify-between ${
                sentEmailLogsType === 'invite' ? 'bg-emerald-500/10 border-emerald-500/50 shadow-sm' : 'bg-slate-100/80 dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div>
                <p className="text-[11px] font-extrabold uppercase text-slate-400 tracking-wider flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-emerald-500" /> Invites</p>
                <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{sentEmailLogsTypeCounts.invite || 0}</p>
              </div>
              <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold text-[10px] uppercase border border-emerald-500/20">FILTER</span>
            </button>

            <button
              type="button"
              onClick={() => { setSentEmailLogsType('reset'); setSentEmailLogsPage(1); }}
              className={`p-4 rounded-2xl border transition-all cursor-pointer text-left flex items-center justify-between ${
                sentEmailLogsType === 'reset' ? 'bg-amber-500/10 border-amber-500/50 shadow-sm' : 'bg-slate-100/80 dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div>
                <p className="text-[11px] font-extrabold uppercase text-slate-400 tracking-wider flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-amber-500" /> Resets</p>
                <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{sentEmailLogsTypeCounts.reset || 0}</p>
              </div>
              <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 font-extrabold text-[10px] uppercase border border-amber-500/20">FILTER</span>
            </button>
            
            <button
              type="button"
              onClick={() => { setSentEmailLogsType('broadcast'); setSentEmailLogsPage(1); }}
              className={`p-4 rounded-2xl border transition-all cursor-pointer text-left flex items-center justify-between ${
                sentEmailLogsType === 'broadcast' ? 'bg-purple-500/10 border-purple-500/50 shadow-sm' : 'bg-slate-100/80 dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div>
                <p className="text-[11px] font-extrabold uppercase text-slate-400 tracking-wider flex items-center gap-1.5"><Megaphone className="w-3.5 h-3.5 text-purple-500" /> Broadcasts</p>
                <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{sentEmailLogsTypeCounts.broadcast || 0}</p>
              </div>
              <span className="px-2 py-0.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 font-extrabold text-[10px] uppercase border border-purple-500/20">FILTER</span>
            </button>

            <button
              type="button"
              onClick={() => { setSentEmailLogsType('test'); setSentEmailLogsPage(1); }}
              className={`p-4 rounded-2xl border transition-all cursor-pointer text-left flex items-center justify-between ${
                sentEmailLogsType === 'test' ? 'bg-amber-500/10 border-amber-500/50 shadow-sm' : 'bg-slate-100/80 dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div>
                <p className="text-[11px] font-extrabold uppercase text-slate-400 tracking-wider flex items-center gap-1.5"><FlaskConical className="w-3.5 h-3.5 text-amber-500" /> Admin Tests</p>
                <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{sentEmailLogsTypeCounts.test || 0}</p>
              </div>
              <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 font-extrabold text-[10px] uppercase border border-amber-500/20">FILTER</span>
            </button>
          </div>

          <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleSection('sent_emails')}
                  className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
                  title={collapsedSections.sent_emails ? 'Expand Section' : 'Collapse Section'}
                >
                  {collapsedSections.sent_emails ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                </button>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 cursor-pointer select-none" onClick={() => toggleSection('sent_emails')}>
                    <MailCheck className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    Outbound Email Audit History ({sentEmailLogsPagination.total})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Comprehensive audit history, delivery logs, sender info, and HTML content previews for all emails sent from JobPingly (Admin &amp; Automated).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPruneLogsModal(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700 shrink-0"
              >
                <Database className="w-3.5 h-3.5 text-rose-500" /> Manage &amp; Prune DB Storage
              </button>
            </div>

            {!collapsedSections.sent_emails && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Category Filter Tabs */}
                  <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl overflow-x-auto">
                    <button
                      onClick={() => { setSentEmailLogsType('all'); setSentEmailLogsPage(1); }}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                        sentEmailLogsType === 'all' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                  All Emails
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    sentEmailLogsType === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {sentEmailLogsTypeCounts.all || 0}
                  </span>
                </button>

                <button
                  onClick={() => { setSentEmailLogsType('admin_all'); setSentEmailLogsPage(1); }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    sentEmailLogsType === 'admin_all' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Admin Dispatched
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    sentEmailLogsType === 'admin_all' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {sentEmailLogsTypeCounts.allAdmin || 0}
                  </span>
                </button>

                <button
                  onClick={() => { setSentEmailLogsType('broadcast'); setSentEmailLogsPage(1); }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    sentEmailLogsType === 'broadcast' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Megaphone className="w-3.5 h-3.5" /> Broadcasts
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    sentEmailLogsType === 'broadcast' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {sentEmailLogsTypeCounts.broadcast || 0}
                  </span>
                </button>

                <button
                  onClick={() => { setSentEmailLogsType('test'); setSentEmailLogsPage(1); }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    sentEmailLogsType === 'test' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <FlaskConical className="w-3.5 h-3.5" /> Tests
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    sentEmailLogsType === 'test' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {sentEmailLogsTypeCounts.test || 0}
                  </span>
                </button>

                <button
                  onClick={() => { setSentEmailLogsType('digest'); setSentEmailLogsPage(1); }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    sentEmailLogsType === 'digest' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Inbox className="w-3.5 h-3.5" /> Digests
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    sentEmailLogsType === 'digest' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {sentEmailLogsTypeCounts.digest || 0}
                  </span>
                </button>

                <button
                  onClick={() => { setSentEmailLogsType('otp'); setSentEmailLogsPage(1); }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    sentEmailLogsType === 'otp' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" /> OTP
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    sentEmailLogsType === 'otp' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {sentEmailLogsTypeCounts.otp || 0}
                  </span>
                </button>
              </div>

            {/* Search Bar */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={sentEmailLogsSearch}
                onChange={e => { setSentEmailLogsSearch(e.target.value); setSentEmailLogsPage(1); }}
                placeholder="Search email address or subject..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-600"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100/90 dark:bg-slate-900/90 text-slate-500 dark:text-slate-400 uppercase font-extrabold border-b border-slate-200 dark:border-slate-800 text-[11px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3.5">Sent Time</th>
                  <th className="py-2.5 px-3.5">Sender (From)</th>
                  <th className="py-2.5 px-3.5">Recipient (To)</th>
                  <th className="py-2.5 px-3.5">Template</th>
                  <th className="py-2.5 px-3.5">Subject</th>
                  <th className="py-2.5 px-3.5">Status</th>
                  <th className="py-2.5 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80 text-xs font-sans">
                {loadingSentEmailLogs ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center">
                      <LoadingSpinner message="Loading email logs..." fullPage={false} />
                    </td>
                  </tr>
                ) : sentEmailLogsList.map(log => (
                  <tr key={log.id} className="hover:bg-slate-100/60 dark:hover:bg-slate-900/40 transition-colors">
                    <td className="py-2.5 px-3.5 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      {log.senderId || ['broadcast', 'test', 'admin_custom'].includes(log.templateType) ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-purple-700 dark:text-purple-300 text-[11px] truncate max-w-[140px]">{log.senderEmail || 'Admin'}</span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30">ADMIN</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-slate-500 dark:text-slate-400 text-[11px] truncate max-w-[140px]">{log.senderEmail || 'notifications@jobpingly.com'}</span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400">AUTO</span>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span className="font-mono font-semibold text-slate-900 dark:text-white text-xs block truncate max-w-[180px]">{log.recipientEmail}</span>
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                        {log.templateType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate max-w-[220px]" title={log.subject}>{log.subject}</span>
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase border ${
                        log.status === 'sent'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${log.status === 'sent' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        {log.status === 'sent' ? 'SENT' : 'FAILED'}
                      </span>
                      {log.errorMessage && (
                        <p className="text-[10px] text-rose-500 mt-0.5 truncate max-w-[150px]" title={log.errorMessage}>{log.errorMessage}</p>
                      )}
                    </td>
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {log.htmlContent ? (
                          <button
                            type="button"
                            onClick={() => setInspectingEmailLog(log)}
                            className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-sm cursor-pointer transition-colors whitespace-nowrap"
                          >
                            <Eye className="w-3 h-3" /> View
                          </button>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 italic block">
                            Logged
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteSingleSentEmailLog(log.id)}
                          title="Delete log entry"
                          className="p-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer border border-rose-500/20"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!loadingSentEmailLogs && sentEmailLogsList.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                      No sent email logs recorded yet. Outbound emails will appear here automatically in real time!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Sent Emails Pagination Controls */}
          {sentEmailLogsPagination.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
              <span className="text-xs text-slate-500">
                Page <span className="font-bold text-slate-900 dark:text-white">{sentEmailLogsPagination.page}</span> of <span className="font-bold text-slate-900 dark:text-white">{sentEmailLogsPagination.totalPages}</span> ({pluralize(sentEmailLogsPagination.total, 'sent email log')})
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSentEmailLogsPage(prev => Math.max(1, prev - 1))}
                  disabled={sentEmailLogsPage <= 1}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>

                <button
                  onClick={() => setSentEmailLogsPage(prev => Math.min(sentEmailLogsPagination.totalPages, prev + 1))}
                  disabled={sentEmailLogsPage >= sentEmailLogsPagination.totalPages}
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
      </div>
    )}
  </div>

      {/* Manual Add Email Modal */}
      {showAddEmailModal && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 sm:p-8 overflow-y-auto hover-scrollbar space-y-4 flex-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Manually Add Approved Email Address
              </h3>

              <form onSubmit={handleManualAddEmail} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                    Email Address *
                  </label>
                  <input
                    ref={addEmailInputRef}
                    autoFocus
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
          </div>
        </div>,
        document.body
      )}

      {/* Test Email Dispatcher Modal */}
      {showTestEmailModal && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 sm:p-8 overflow-y-auto hover-scrollbar space-y-5 flex-1">
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
                    ref={testEmailInputRef}
                    autoFocus
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
                        Custom Message Content
                      </label>
                      <textarea
                        rows={3}
                        value={testCustomMessage}
                        onChange={e => setTestCustomMessage(e.target.value)}
                        placeholder="Type custom test email body..."
                        className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-indigo-600 font-sans"
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
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md cursor-pointer transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {sendingTestEmail ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Dispatching Test Email...
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" /> Send Test Email via Brevo
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Broadcast Announcement Email Modal */}
      {showBroadcastModal && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 sm:p-8 overflow-y-auto hover-scrollbar space-y-5 flex-1">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <MailCheck className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  Send Broadcast Email / Platform Announcement
                </h3>
                <button
                  type="button"
                  onClick={() => setShowBroadcastModal(false)}
                  className="text-slate-400 hover:text-slate-900 dark:hover:text-white text-xl font-bold cursor-pointer"
                >
                  &times;
                </button>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Send an update or announcement email to registered users. Use the checkboxes below to exclude specific users from receiving this broadcast.
              </p>

              <form onSubmit={handleSendBroadcastSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                      Target Role Filter
                    </label>
                    <select
                      value={broadcastTargetRole}
                      onChange={e => setBroadcastTargetRole(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                    >
                      <option value="all">All Users &amp; Admins</option>
                      <option value="user">Standard Users Only</option>
                      <option value="admin">Administrators Only</option>
                    </select>
                  </div>

                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300 select-none">
                      <input
                        type="checkbox"
                        checked={broadcastOnlyVerified}
                        onChange={e => setBroadcastOnlyVerified(e.target.checked)}
                        className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                      />
                      Only Email-Verified Users
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Broadcast Email Subject *
                  </label>
                  <input
                    ref={broadcastSubjectRef}
                    type="text"
                    required
                    value={broadcastSubject}
                    onChange={e => setBroadcastSubject(e.target.value)}
                    placeholder="e.g. Platform Update: New Job Search & Filtering Features"
                    className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-semibold focus:outline-none focus:border-purple-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Announcement Message Body *
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={broadcastMessage}
                    onChange={e => setBroadcastMessage(e.target.value)}
                    placeholder="Type your platform update message here..."
                    className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-purple-600"
                  />
                </div>

                {/* Exclusion Controls & Checkbox List */}
                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      User Recipient List ({broadcastUsersList.length} total)
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400">
                        Sending to {broadcastUsersList.filter(u => {
                          if (broadcastTargetRole !== 'all' && u.role !== broadcastTargetRole) return false;
                          if (broadcastOnlyVerified && u.emailVerified === false) return false;
                          if (excludedBroadcastUserIds.includes(u.id)) return false;
                          return true;
                        }).length} users ({excludedBroadcastUserIds.length} excluded)
                      </span>
                      <button
                        type="button"
                        onClick={handleToggleExcludeAllBroadcastUsers}
                        className="text-[11px] font-bold text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 underline cursor-pointer"
                      >
                        Toggle Exclude All
                      </button>
                    </div>
                  </div>

                  {/* User Search Input */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={broadcastSearch}
                      onChange={e => setBroadcastSearch(e.target.value)}
                      placeholder="Search users to exclude/include..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none"
                    />
                  </div>

                  {/* Scrollable User Checkbox List */}
                  <div className="max-h-48 overflow-y-auto hover-scrollbar rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50 p-1">
                    {loadingBroadcastUsers ? (
                      <div className="py-6 text-center text-xs text-slate-400">Loading user list...</div>
                    ) : broadcastUsersList.filter(u => {
                      if (broadcastTargetRole !== 'all' && u.role !== broadcastTargetRole) return false;
                      if (broadcastOnlyVerified && u.emailVerified === false) return false;
                      if (broadcastSearch) {
                        const q = broadcastSearch.toLowerCase();
                        return u.email.toLowerCase().includes(q) || (u.name && u.name.toLowerCase().includes(q));
                      }
                      return true;
                    }).length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-400">No matching users found for this filter.</div>
                    ) : (
                      broadcastUsersList.filter(u => {
                        if (broadcastTargetRole !== 'all' && u.role !== broadcastTargetRole) return false;
                        if (broadcastOnlyVerified && u.emailVerified === false) return false;
                        if (broadcastSearch) {
                          const q = broadcastSearch.toLowerCase();
                          return u.email.toLowerCase().includes(q) || (u.name && u.name.toLowerCase().includes(q));
                        }
                        return true;
                      }).map(u => {
                        const isExcluded = excludedBroadcastUserIds.includes(u.id);
                        return (
                          <div
                            key={u.id}
                            onClick={() => handleToggleExcludeBroadcastUser(u.id)}
                            className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                              isExcluded
                                ? 'bg-rose-500/10 opacity-70'
                                : 'hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={!isExcluded}
                                onChange={() => {}} // handled by parent div click
                                className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer shrink-0"
                              />
                              <div className="min-w-0 text-xs">
                                <span className="font-semibold block truncate">{u.name || 'User'}</span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">{u.email}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                                u.role === 'admin' ? 'bg-rose-500/10 text-rose-600' : 'bg-blue-500/10 text-blue-600'
                              }`}>
                                {u.role}
                              </span>
                              {isExcluded && (
                                <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-700 dark:text-rose-300 text-[9px] font-extrabold uppercase">
                                  Excluded
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowBroadcastModal(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sendingBroadcast}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-md cursor-pointer transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {sendingBroadcast ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Dispatching Broadcast...
                      </>
                    ) : (
                      <>
                        <MailCheck className="w-4 h-4" /> Send Broadcast Email
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
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
                  ref={customTimerInputRef}
                  autoFocus
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
                  ref={addAdminCompanyInputRef}
                  autoFocus
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
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-3xl w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 sm:p-8 overflow-y-auto hover-scrollbar space-y-6 flex-1">
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
                          This email address is not currently following any other user&apos;s public watch lists.
                        </p>
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
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
      </div>
      )}

      {/* Sent Email Inspector Modal */}
      {inspectingEmailLog && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-3xl w-full p-6 sm:p-8 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <MailCheck className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  Sent Email Inspector &amp; Full Content
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">ID: {inspectingEmailLog.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingEmailLog(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Email Headers Info Box */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shrink-0">
              <div>
                <span className="font-bold text-slate-500 block text-[11px] uppercase">From (Sender):</span>
                <span className="font-mono text-slate-900 dark:text-white">{inspectingEmailLog.senderEmail || 'notifications@jobpingly.com'}</span>
              </div>
              <div>
                <span className="font-bold text-slate-500 block text-[11px] uppercase">To (Recipient):</span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{inspectingEmailLog.recipientEmail}</span>
              </div>
              <div>
                <span className="font-bold text-slate-500 block text-[11px] uppercase">Subject:</span>
                <span className="font-semibold text-slate-900 dark:text-white">{inspectingEmailLog.subject}</span>
              </div>
              <div>
                <span className="font-bold text-slate-500 block text-[11px] uppercase">Template Type &amp; Status:</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                    {inspectingEmailLog.templateType}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                    inspectingEmailLog.status === 'sent'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                  }`}>
                    {inspectingEmailLog.status === 'sent' ? '✓ SENT' : 'FAILED'}
                  </span>
                </div>
              </div>
              <div className="sm:col-span-2">
                <span className="font-bold text-slate-500 block text-[11px] uppercase">Sent Time:</span>
                <span className="font-mono text-slate-600 dark:text-slate-400">{new Date(inspectingEmailLog.createdAt).toLocaleString()}</span>
              </div>
              {inspectingEmailLog.errorMessage && (
                <div className="sm:col-span-2 p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-600 dark:text-rose-400 text-xs">
                  <strong>Error Message:</strong> {inspectingEmailLog.errorMessage}
                </div>
              )}
            </div>

            {/* Email HTML Body View */}
            <div className="flex-1 flex flex-col min-h-0 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Email HTML Body Content
              </span>
              <div className="flex-1 min-h-[300px] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white">
                {inspectingEmailLog.htmlContent ? (
                  <iframe
                    srcDoc={inspectingEmailLog.htmlContent}
                    title="Sent Email Content Preview"
                    className="w-full h-full border-0 min-h-[350px]"
                  />
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center h-full">
                    <Mail className="w-8 h-8 mb-2 text-slate-300" />
                    <span>No HTML body captured for this record.</span>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setInspectingEmailLog(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 text-white dark:bg-slate-800 dark:hover:bg-slate-700 font-bold text-xs cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Sent Email Storage & Cleanup Prune Modal */}
      {showPruneLogsModal && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Database className="w-5 h-5 text-rose-500" />
                  Manage Sent Email Storage &amp; Pruning
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Manage database storage size by purging heavy HTML bodies or deleting old audit logs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPruneLogsModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Storage Stats Summary */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600 dark:text-slate-400">Total Email Logs:</span>
                <span className="font-bold text-slate-900 dark:text-white font-mono">{sentEmailLogsPagination.total} logs</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600 dark:text-slate-400">Retention Strategy:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">All HTML &amp; Metadata Tracked</span>
              </div>
            </div>

            {/* Config Controls */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5 uppercase tracking-wider">
                  Target Retention Window (Age Threshold)
                </label>
                <select
                  value={pruneDays}
                  onChange={e => setPruneDays(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-purple-600"
                >
                  <option value={7}>Older than 7 Days</option>
                  <option value={14}>Older than 14 Days</option>
                  <option value={30}>Older than 30 Days (Recommended)</option>
                  <option value={60}>Older than 60 Days</option>
                  <option value={90}>Older than 90 Days</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5 uppercase tracking-wider">
                  Target Template Category
                </label>
                <select
                  value={pruneTemplateType}
                  onChange={e => setPruneTemplateType(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-purple-600"
                >
                  <option value="all">All Categories (Automated &amp; Admin)</option>
                  <option value="digest">📬 Job Digests Only</option>
                  <option value="otp">🔑 OTP Codes Only</option>
                  <option value="invite">👥 Invites Only</option>
                  <option value="reset">🔒 Password Resets Only</option>
                  <option value="broadcast">📢 Broadcasts Only</option>
                  <option value="test">🧪 Tests Only</option>
                </select>
              </div>
            </div>

            {/* Prune Action Buttons */}
            <div className="space-y-3 pt-2">
              <button
                type="button"
                disabled={pruningLogs}
                onClick={() => handlePruneLogsSubmit('purge_html')}
                className="w-full p-3.5 rounded-2xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-between transition-all cursor-pointer shadow-sm"
              >
                <div className="text-left">
                  <p className="font-extrabold flex items-center gap-1.5">
                    <Trash2 className="w-4 h-4" /> Purge HTML Bodies Only (Keep Delivery History)
                  </p>
                  <p className="text-[11px] opacity-80 mt-0.5 font-normal">
                    Frees heavy HTML text storage. Recipient, timestamp &amp; delivery status are kept forever.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-white/20 text-white text-[10px] font-extrabold uppercase shrink-0">RECOMMENDED</span>
              </button>

              <button
                type="button"
                disabled={pruningLogs}
                onClick={() => handlePruneLogsSubmit('delete_logs')}
                className="w-full p-3.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 disabled:opacity-50 text-rose-600 dark:text-rose-400 font-bold text-xs flex items-center justify-between transition-all cursor-pointer"
              >
                <div className="text-left">
                  <p className="font-extrabold flex items-center gap-1.5">
                    <Trash2 className="w-4 h-4" /> Delete Entire Log Records Permanently
                  </p>
                  <p className="text-[11px] opacity-80 mt-0.5 font-normal">
                    Permanently removes both metadata and content for logs older than {pruneDays} days.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-700 dark:text-rose-300 text-[10px] font-extrabold uppercase shrink-0">HARD DELETE</span>
              </button>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowPruneLogsModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <PublicUserProfileModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
    </div>
  );
}
