'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  MailCheck, Zap, RefreshCw, Play, Search, AlertTriangle, ShieldCheck, CheckCircle2,
  Clock, XCircle, Users, Sliders, ChevronLeft, ChevronRight, Eye, Layers, Lock, Sparkles, Filter, Info
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Badge } from '@/components/Badge';

interface Props {
  onInspectSubscriptions: (email: string) => void;
}

export default function SubscribersBrevoTab({ onInspectSubscriptions }: Props) {
  const toast = useToast();
  const [subTab, setSubTab] = useState<'simulator' | 'diagnostics' | 'roster' | 'dispatcher'>('simulator');

  // Simulator State (with raw string inputs to support clearing the box to blank)
  const [brevoLimit, setBrevoLimit] = useState(300);
  const [brevoLimitInput, setBrevoLimitInput] = useState('300');
  const [safetyBuffer, setSafetyBuffer] = useState(50);
  const [safetyBufferInput, setSafetyBufferInput] = useState('50');
  const [worstPct, setWorstPct] = useState(100);
  const [avgPct, setAvgPct] = useState(50);
  const [bestPct, setBestPct] = useState(20);
  const [customPct, setCustomPct] = useState(75);
  const [cycleDays, setCycleDays] = useState(3);
  const [cycleDaysInput, setCycleDaysInput] = useState('3');
  const [calcData, setCalcData] = useState<any>(null);
  const [loadingCalc, setLoadingCalc] = useState(false);

  // Diagnostics Queue State
  const [diagnosticsData, setDiagnosticsData] = useState<any>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);
  const [selectedQueueReason, setSelectedQueueReason] = useState<string>('all');
  const [processingQueueAction, setProcessingQueueAction] = useState(false);
  const [dryRunModalData, setDryRunModalData] = useState<any>(null);

  // Subscribers Roster State
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [rosterPage, setRosterPage] = useState(1);
  const [rosterLimit, setRosterLimit] = useState(10);
  const [rosterPagination, setRosterPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [rosterSearch, setRosterSearch] = useState('');
  const [debouncedRosterSearch, setDebouncedRosterSearch] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [exemptFilter, setExemptFilter] = useState('all');
  const [subscriptionStatusFilter, setSubscriptionStatusFilter] = useState('active_subscribed');
  const [rosterMetrics, setRosterMetrics] = useState<any>(null);
  const [loadingSubscribers, setLoadingSubscribers] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [processingBatch, setProcessingBatch] = useState(false);

  // Cohort & Quota Feature Flag State
  const [cohortGroupingEnabled, setCohortGroupingEnabled] = useState(true);

  const saveFlagToDb = async (key: string, value: number) => {
    try {
      await fetch('/api/admin/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
    } catch (e) {
      console.error('[SaveFlagToDb Error]', e);
    }
  };

  const handleBrevoLimitInputChange = (valStr: string) => {
    setBrevoLimitInput(valStr);
    const num = valStr.trim() === '' ? 1 : Math.max(1, Number(valStr) || 1);
    setBrevoLimit(num);
    saveFlagToDb('email.brevo_daily_limit', num);
  };

  const handleBrevoLimitInputBlur = () => {
    if (brevoLimitInput.trim() === '' || isNaN(Number(brevoLimitInput))) {
      setBrevoLimitInput('1');
      setBrevoLimit(1);
      saveFlagToDb('email.brevo_daily_limit', 1);
    }
  };

  const handleSafetyBufferInputChange = (valStr: string) => {
    setSafetyBufferInput(valStr);
    const num = valStr.trim() === '' ? 1 : Math.max(0, Number(valStr) || 1);
    setSafetyBuffer(num);
    saveFlagToDb('email.transactional_safety_buffer', num);
  };

  const handleSafetyBufferInputBlur = () => {
    if (safetyBufferInput.trim() === '' || isNaN(Number(safetyBufferInput))) {
      setSafetyBufferInput('1');
      setSafetyBuffer(1);
      saveFlagToDb('email.transactional_safety_buffer', 1);
    }
  };

  const handleCycleDaysInputChange = (valStr: string) => {
    setCycleDaysInput(valStr);
    const num = valStr.trim() === '' ? 1 : Math.max(1, Math.min(14, Number(valStr) || 1));
    setCycleDays(num);
    saveFlagToDb('email.cohort_cycle_days', num);
  };

  const handleCycleDaysInputBlur = () => {
    if (cycleDaysInput.trim() === '' || isNaN(Number(cycleDaysInput))) {
      setCycleDaysInput('1');
      setCycleDays(1);
      saveFlagToDb('email.cohort_cycle_days', 1);
    }
  };

  const fetchAllFlags = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/flags');
      if (res.ok) {
        const json = await res.json();
        const flagsList = json.flags || [];
        
        const cohortFlag = flagsList.find((f: any) => f.key === 'email.cohort_grouping_enabled');
        if (cohortFlag) setCohortGroupingEnabled(cohortFlag.value === true || cohortFlag.value === 'true');

        const limitFlag = flagsList.find((f: any) => f.key === 'email.brevo_daily_limit');
        if (limitFlag && Number(limitFlag.value) > 0) {
          const lNum = Number(limitFlag.value);
          setBrevoLimit(lNum);
          setBrevoLimitInput(String(lNum));
        }

        const bufferFlag = flagsList.find((f: any) => f.key === 'email.transactional_safety_buffer');
        if (bufferFlag && Number(bufferFlag.value) >= 0) {
          const bNum = Number(bufferFlag.value);
          setSafetyBuffer(bNum);
          setSafetyBufferInput(String(bNum));
        }

        const cycleFlag = flagsList.find((f: any) => f.key === 'email.cohort_cycle_days');
        if (cycleFlag && Number(cycleFlag.value) > 0) {
          const cNum = Number(cycleFlag.value);
          setCycleDays(cNum);
          setCycleDaysInput(String(cNum));
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchAllFlags();
  }, [fetchAllFlags]);

  const handleToggleCohortGrouping = async () => {
    const newValue = !cohortGroupingEnabled;
    setCohortGroupingEnabled(newValue);
    try {
      const res = await fetch('/api/admin/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'email.cohort_grouping_enabled', value: newValue }),
      });
      if (!res.ok) throw new Error('Failed to toggle flag');
      toast.success(`Cohort Grouping Rule is now ${newValue ? 'ENABLED (ON)' : 'DISABLED (OFF)'}`);
    } catch (err: any) {
      setCohortGroupingEnabled(!newValue);
      toast.error(err.message || 'Failed to update cohort grouping flag');
    }
  };

  // Debounce subscriber search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedRosterSearch(rosterSearch);
      setRosterPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [rosterSearch]);

  // Load calculator data
  const fetchCalculatorData = async () => {
    setLoadingCalc(true);
    try {
      const query = new URLSearchParams({
        brevoDailyLimit: brevoLimit.toString(),
        safetyBuffer: safetyBuffer.toString(),
        worstCasePct: worstPct.toString(),
        avgCasePct: avgPct.toString(),
        bestCasePct: bestPct.toString(),
        customPct: customPct.toString(),
      });
      const res = await fetch(`/api/admin/subscribers/calculator?${query.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setCalcData(json);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingCalc(false);
    }
  };

  // Load diagnostics queue data
  const fetchDiagnosticsData = async () => {
    setLoadingDiagnostics(true);
    try {
      const query = new URLSearchParams({
        brevoLimit: brevoLimit.toString(),
        safetyBuffer: safetyBuffer.toString(),
        reason: selectedQueueReason,
      });
      const res = await fetch(`/api/admin/notifications/queue-diagnostics?${query.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setDiagnosticsData(json);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingDiagnostics(false);
    }
  };

  // Load subscriber roster
  const fetchSubscribers = async () => {
    setLoadingSubscribers(true);
    try {
      const query = new URLSearchParams({
        page: rosterPage.toString(),
        limit: rosterLimit.toString(),
        search: debouncedRosterSearch,
        frequency: frequencyFilter,
        group: groupFilter,
        exempt: exemptFilter,
        subscription: subscriptionStatusFilter,
      });
      const res = await fetch(`/api/admin/subscribers?${query.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setSubscribers(json.subscribers || []);
        setRosterPagination(json.pagination || { total: 0, page: 1, limit: 10, totalPages: 1 });
        setRosterMetrics(json.metrics || null);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingSubscribers(false);
    }
  };

  useEffect(() => {
    fetchCalculatorData();
  }, [brevoLimit, safetyBuffer, worstPct, avgPct, bestPct, customPct]);

  useEffect(() => {
    if (subTab === 'diagnostics') fetchDiagnosticsData();
  }, [subTab, selectedQueueReason, brevoLimit, safetyBuffer]);

  useEffect(() => {
    if (subTab === 'roster' || subTab === 'dispatcher') fetchSubscribers();
  }, [subTab, rosterPage, rosterLimit, debouncedRosterSearch, frequencyFilter, groupFilter, exemptFilter, subscriptionStatusFilter]);

  // Toggle user exemption
  const handleToggleExemption = async (userId: string, currentExempt: boolean, field: 'quotaExempt' | 'frequencyEnforcementExempt') => {
    try {
      const res = await fetch('/api/admin/subscribers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: [userId],
          [field]: !currentExempt,
        }),
      });
      if (res.ok) {
        toast.success(`Subscriber exemption updated!`);
        fetchSubscribers();
        fetchCalculatorData();
      } else {
        toast.error('Failed to update subscriber settings.');
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Update user cohort group
  const handleUpdateUserGroup = async (userId: string, newGroup: number) => {
    try {
      const res = await fetch('/api/admin/subscribers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: [userId],
          dispatchGroup: newGroup,
        }),
      });
      if (res.ok) {
        toast.success(`User assigned to Cohort Group ${newGroup}`);
        fetchSubscribers();
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Auto Rebalance Cohorts
  const handleAutoRebalance = async () => {
    if (!confirm(`Rebalance all active subscribers evenly into ${cycleDays} round-robin cohort groups?`)) return;
    setProcessingBatch(true);
    try {
      const res = await fetch('/api/admin/subscribers/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycleDays }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(json.message || `Rebalanced ${json.rebalancedCount} subscribers across ${cycleDays} cohort groups!`);
        fetchSubscribers();
        fetchCalculatorData();
      } else {
        toast.error(json.error || 'Failed to rebalance cohorts');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessingBatch(false);
    }
  };

  // Diagnostics Queue Action
  const handleQueueAction = async (action: 'force_flush' | 'dry_run_simulation' | 'clear_queue', queueIds?: string[]) => {
    setProcessingQueueAction(true);
    try {
      const res = await fetch('/api/admin/notifications/queue-diagnostics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, queueIds, brevoLimit, safetyBuffer }),
      });
      const json = await res.json();
      if (res.ok) {
        if (action === 'dry_run_simulation') {
          setDryRunModalData(json);
          toast.success('Dry run simulation complete!');
        } else if (action === 'force_flush') {
          toast.success(json.message || `Flushed ${json.sentCount || 0} queue items successfully!`);
          fetchDiagnosticsData();
          fetchCalculatorData();
        } else if (action === 'clear_queue') {
          toast.success(`Cleared ${json.clearedCount || 0} queue items.`);
          fetchDiagnosticsData();
        }
      } else {
        toast.error(json.error || 'Queue action failed');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessingQueueAction(false);
    }
  };

  const activeSubCount = calcData?.subscribers?.active || 0;
  const effectiveLimit = Math.max(1, brevoLimit - safetyBuffer);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Sub-Tab Navigation Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            onClick={() => setSubTab('simulator')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              subTab === 'simulator'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" /> Quota &amp; Scenario Simulator
          </button>
          <button
            onClick={() => setSubTab('diagnostics')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              subTab === 'diagnostics'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" /> Pending Queue Diagnostics
            {diagnosticsData?.totalPending > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-rose-500 text-white font-extrabold">
                {diagnosticsData.totalPending}
              </span>
            )}
          </button>
          <button
            onClick={() => setSubTab('roster')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              subTab === 'roster'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Subscriber Roster &amp; Exemptions
          </button>
          <button
            onClick={() => setSubTab('dispatcher')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              subTab === 'dispatcher'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Zap className="w-3.5 h-3.5" /> Round-Robin Cohort Dispatcher
          </button>
        </div>

        <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 text-xs font-semibold">
          <MailCheck className="w-4 h-4 text-blue-500" />
          <span>Today Sent: <strong>{calcData?.todaySentStats?.sentToday || 0}</strong> / {brevoLimit}</span>
        </div>
      </div>

      {/* SUB-TAB 1: SIMULATOR & CAPACITY CALCULATOR */}
      {subTab === 'simulator' && (
        <div className="space-y-6">
          {/* Editable Parameters Panel */}
          <div className="glass-panel p-6 rounded-3xl border-slate-200 dark:border-slate-800 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-blue-600" /> Brevo Quota &amp; Scenario Simulator
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Adjust Brevo daily limit, transactional safety buffer, and send percentages to simulate capacity.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* Cohort Grouping Toggle Feature Flag Button (Placed where Save Settings was) */}
                <button
                  type="button"
                  onClick={handleToggleCohortGrouping}
                  className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 border shadow-sm ${
                    cohortGroupingEnabled
                      ? 'bg-purple-600 text-white border-purple-600 shadow-purple-500/20 hover:bg-purple-700'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:bg-slate-300'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  Cohort Grouping Rule: {cohortGroupingEnabled ? 'ON (ENFORCED)' : 'OFF (BYPASSED)'}
                </button>

                <button
                  onClick={fetchCalculatorData}
                  className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
                  title="Recalculate Scenarios"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingCalc ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
              {/* Card 1: Daily Limit Input */}
              <div className="space-y-2 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Brevo Daily Limit</span>
                  <span className="text-blue-600 dark:text-blue-400 font-black">{brevoLimit} emails/day</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="100000"
                  step="50"
                  value={brevoLimitInput}
                  onChange={(e) => handleBrevoLimitInputChange(e.target.value)}
                  onBlur={handleBrevoLimitInputBlur}
                  placeholder="1"
                  className="w-full px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Free Tier default is 300/day. Starter plan is 5,000/day.</p>
              </div>

              {/* Card 2: Safety Reserve Buffer */}
              <div className="space-y-2 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Transactional Safety Reserve</span>
                  <span className="text-amber-600 dark:text-amber-400 font-black">{safetyBuffer} OTPs/day</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max={Math.max(0, brevoLimit - 1)}
                  step="10"
                  value={safetyBufferInput}
                  onChange={(e) => handleSafetyBufferInputChange(e.target.value)}
                  onBlur={handleSafetyBufferInputBlur}
                  placeholder="1"
                  className="w-full px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Reserves emails strictly for login OTPs &amp; password resets.</p>
              </div>

              {/* Card 3: Cycle Rotation Days */}
              <div className="space-y-2 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Round-Robin Cycle ($K$ Days)</span>
                  <span className="text-purple-600 dark:text-purple-400 font-black">{cycleDays} Days Rotation</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="14"
                  value={cycleDaysInput}
                  onChange={(e) => handleCycleDaysInputChange(e.target.value)}
                  onBlur={handleCycleDaysInputBlur}
                  placeholder="1"
                  className="w-full px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Splits non-exempt users into {cycleDays} staggered daily cohorts.
                </p>
              </div>
            </div>
          </div>

          {/* Scenario Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Card 1: Worst Case Scenario */}
            <div className="glass-panel p-5 rounded-3xl border-slate-200 dark:border-slate-800 space-y-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="text-xs font-black uppercase text-rose-500 tracking-wider">Worst Case Scenario</div>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                  {worstPct}% Send
                </span>
              </div>
              <div className="space-y-1">
                <div className="text-3xl font-black text-slate-900 dark:text-white">
                  {calcData?.scenarios?.worstCase?.dailyVolume || 0} <span className="text-xs text-slate-500 font-medium">emails/day</span>
                </div>
                <div className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  Requires <strong>{calcData?.scenarios?.worstCase?.daysRequired || 1} day(s)</strong> to notify all subscribers
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <span>Digest Quota Load</span>
                  <span>{calcData?.scenarios?.worstCase?.quotaLoadPct || 0}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      (calcData?.scenarios?.worstCase?.quotaLoadPct || 0) > 100
                        ? 'bg-rose-500'
                        : (calcData?.scenarios?.worstCase?.quotaLoadPct || 0) >= 80
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, calcData?.scenarios?.worstCase?.quotaLoadPct || 0)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Card 2: Average Case Scenario */}
            <div className="glass-panel p-5 rounded-3xl border-slate-200 dark:border-slate-800 space-y-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="text-xs font-black uppercase text-amber-500 tracking-wider">Average Case Scenario</div>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  {avgPct}% Send
                </span>
              </div>
              <div className="space-y-1">
                <div className="text-3xl font-black text-slate-900 dark:text-white">
                  {calcData?.scenarios?.avgCase?.dailyVolume || 0} <span className="text-xs text-slate-500 font-medium">emails/day</span>
                </div>
                <div className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  Requires <strong>{calcData?.scenarios?.avgCase?.daysRequired || 1} day(s)</strong> to notify active matches
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <span>Digest Quota Load</span>
                  <span>{calcData?.scenarios?.avgCase?.quotaLoadPct || 0}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      (calcData?.scenarios?.avgCase?.quotaLoadPct || 0) > 100
                        ? 'bg-rose-500'
                        : (calcData?.scenarios?.avgCase?.quotaLoadPct || 0) >= 80
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, calcData?.scenarios?.avgCase?.quotaLoadPct || 0)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Card 3: Best Case Scenario */}
            <div className="glass-panel p-5 rounded-3xl border-slate-200 dark:border-slate-800 space-y-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="text-xs font-black uppercase text-emerald-500 tracking-wider">Best Case Scenario</div>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {bestPct}% Send
                </span>
              </div>
              <div className="space-y-1">
                <div className="text-3xl font-black text-slate-900 dark:text-white">
                  {calcData?.scenarios?.bestCase?.dailyVolume || 0} <span className="text-xs text-slate-500 font-medium">emails/day</span>
                </div>
                <div className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  Requires <strong>{calcData?.scenarios?.bestCase?.daysRequired || 1} day(s)</strong> (High Capacity Margin)
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <span>Digest Quota Load</span>
                  <span>{calcData?.scenarios?.bestCase?.quotaLoadPct || 0}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.min(100, calcData?.scenarios?.bestCase?.quotaLoadPct || 0)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Card 4: Custom Slider Scenario */}
            <div className="glass-panel p-5 rounded-3xl border-blue-500/30 dark:border-blue-500/30 bg-blue-500/5 space-y-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="text-xs font-black uppercase text-blue-600 dark:text-blue-400 tracking-wider">Custom Scenario</div>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-600 text-white">
                  {customPct}% Send
                </span>
              </div>
              <div className="space-y-1">
                <div className="text-3xl font-black text-slate-900 dark:text-white">
                  {calcData?.scenarios?.customCase?.dailyVolume || 0} <span className="text-xs text-slate-500 font-medium">emails/day</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={customPct}
                  onChange={(e) => setCustomPct(Number(e.target.value))}
                  className="w-full cursor-pointer accent-blue-600"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <span>Digest Quota Load</span>
                  <span>{calcData?.scenarios?.customCase?.quotaLoadPct || 0}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{ width: `${Math.min(100, calcData?.scenarios?.customCase?.quotaLoadPct || 0)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Growth & Quota Exhaustion Forecasting Alert */}
          <div className="glass-panel p-6 rounded-3xl border-slate-200 dark:border-slate-800 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-transparent flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Subscriber Growth &amp; Brevo Tier Forecasting
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
                  {calcData?.recommendations?.daysUntilLimitExceeded ? (
                    <>
                      At your current weekly growth rate of <strong>+{calcData.recommendations.weeklyGrowthRate} subscribers/week</strong>, your daily active subscriber volume will reach your {brevoLimit} email quota limit in approximately <strong>{calcData.recommendations.daysUntilLimitExceeded} days</strong>.
                    </>
                  ) : (
                    <>
                      Your current active subscriber base of <strong>{activeSubCount} users</strong> fits comfortably within your <strong>{effectiveLimit} email/day</strong> effective digest capacity margin.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="px-4 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shrink-0 text-center space-y-1 shadow-sm">
              <div className="text-[10px] uppercase font-bold text-slate-400">Recommended Plan</div>
              <div className="text-xs font-black text-purple-600 dark:text-purple-400">
                {calcData?.recommendations?.recommendedPlan || 'Brevo Free (300/day)'}
              </div>
            </div>
          </div>

          {/* VIP Over-Allocation Warning Banner */}
          {Boolean(calcData?.quotaExemptUsers && calcData.quotaExemptUsers > 0) && (
            <div className="glass-panel p-5 rounded-3xl border-amber-500/30 bg-amber-500/5 flex items-start gap-4">
              <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  VIP / Quota Exempt Over-Allocation Warning ({calcData.quotaExemptUsers} VIP Subscribers)
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  You currently have <strong>{calcData.quotaExemptUsers} subscriber(s)</strong> flagged as <strong>VIP / Quota Exempt</strong>. VIP subscribers bypass the 300/day Brevo limit completely. If total VIP email volume alone exceeds your <strong>{brevoLimit} emails/day</strong> Brevo cap on a heavy job posting day, Brevo&apos;s REST API will reject the excess emails with HTTP 429 quota errors.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: PENDING QUEUE DIAGNOSTICS */}
      {subTab === 'diagnostics' && (
        <div className="space-y-6">
          {/* Reason Diagnostics Breakdown Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              onClick={() => setSelectedQueueReason('all')}
              className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-1 ${
                selectedQueueReason === 'all'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              <div className="text-xs font-bold">Total Pending Items</div>
              <div className="text-2xl font-black">{diagnosticsData?.totalPending || 0}</div>
            </div>

            <div
              onClick={() => setSelectedQueueReason('brevo_daily_quota_reached')}
              className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-1 ${
                selectedQueueReason === 'brevo_daily_quota_reached'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-md'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-rose-600 dark:text-rose-400'
              }`}
            >
              <div className="text-xs font-bold">Brevo Quota Reached</div>
              <div className="text-2xl font-black">{diagnosticsData?.reasonCounts?.brevo_daily_quota_reached || 0}</div>
            </div>

            <div
              onClick={() => setSelectedQueueReason('staggered_cohort_waiting')}
              className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-1 ${
                selectedQueueReason === 'staggered_cohort_waiting'
                  ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-purple-600 dark:text-purple-400'
              }`}
            >
              <div className="text-xs font-bold">Waiting Scheduled Cohort</div>
              <div className="text-2xl font-black">{diagnosticsData?.reasonCounts?.staggered_cohort_waiting || 0}</div>
            </div>

            <div
              onClick={() => setSelectedQueueReason('pending_admin_approval')}
              className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-1 ${
                selectedQueueReason === 'pending_admin_approval'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-md'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-amber-600 dark:text-amber-400'
              }`}
            >
              <div className="text-xs font-bold">Pending Admin Approval</div>
              <div className="text-2xl font-black">{diagnosticsData?.reasonCounts?.pending_admin_approval || 0}</div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 glass-panel p-4 rounded-2xl border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Queue Actions:
              </span>
              <button
                onClick={() => handleQueueAction('force_flush')}
                disabled={processingQueueAction || (diagnosticsData?.totalPending || 0) === 0}
                className="px-4 py-2 rounded-xl text-xs font-extrabold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" /> Force Flush Queue (Bypass Quota)
              </button>

              <button
                onClick={() => handleQueueAction('dry_run_simulation')}
                disabled={processingQueueAction || (diagnosticsData?.totalPending || 0) === 0}
                className="px-4 py-2 rounded-xl text-xs font-extrabold bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" /> Dry-Run Batch Simulation
              </button>
            </div>

            <button
              onClick={fetchDiagnosticsData}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingDiagnostics ? 'animate-spin' : ''}`} /> Refresh Queue State
            </button>
          </div>

          {/* Pending Queue Items Table */}
          <div className="glass-panel rounded-3xl border-slate-200 dark:border-slate-800 overflow-hidden">
            {loadingDiagnostics ? (
              <div className="p-12 text-center">
                <LoadingSpinner message="Diagnosing pending notification queue items..." />
              </div>
            ) : !diagnosticsData?.queueItems || diagnosticsData.queueItems.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                <h4 className="text-base font-bold text-slate-900 dark:text-white">Notification Queue Clean</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">No pending job notification items are waiting in the delivery queue.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-extrabold uppercase tracking-wider">
                    <tr>
                      <th className="p-4">Recipient</th>
                      <th className="p-4">Job / Company</th>
                      <th className="p-4">Queued At</th>
                      <th className="p-4">User Cohort</th>
                      <th className="p-4">Non-Send Diagnostic Reason</th>
                      <th className="p-4 text-right">Inspect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-medium">
                    {diagnosticsData.queueItems.map((item: any) => (
                      <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="p-4">
                          <div className="font-extrabold text-slate-900 dark:text-white">{item.userName || item.userEmail.split('@')[0]}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{item.userEmail}</div>
                        </td>
                        <td className="p-4 max-w-xs truncate">
                          <div className="font-bold text-slate-800 dark:text-slate-200 truncate">{item.jobTitle}</div>
                          <div className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold">{item.companyName}</div>
                        </td>
                        <td className="p-4 whitespace-nowrap text-slate-500">
                          {new Date(item.createdAt).toLocaleString()}
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          {item.quotaExempt ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                              VIP (Exempt)
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-600 border border-purple-500/20">
                              Group {item.dispatchGroup}
                            </span>
                          )}
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1.5 ${
                            item.reasonKey === 'brevo_daily_quota_reached'
                              ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                              : item.reasonKey === 'staggered_cohort_waiting'
                              ? 'bg-purple-500/10 text-purple-600 border border-purple-500/20'
                              : item.reasonKey === 'pending_admin_approval'
                              ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                              : 'bg-slate-500/10 text-slate-600 border border-slate-500/20'
                          }`}>
                            <Info className="w-3 h-3" />
                            {item.reasonLabel}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => onInspectSubscriptions(item.userEmail)}
                            className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-500/10 transition-colors cursor-pointer"
                            title="Inspect User Subscriptions"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: SUBSCRIBER ROSTER & EXEMPTION CONTROL */}
      {subTab === 'roster' && (
        <div className="space-y-6">
          {/* Roster Controls & Filters */}
          <div className="glass-panel p-5 rounded-3xl border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search subscriber name or email..."
                  value={rosterSearch}
                  onChange={(e) => setRosterSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl text-xs font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <select
                  value={frequencyFilter}
                  onChange={(e) => setFrequencyFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white cursor-pointer"
                >
                  <option value="all">All Frequencies</option>
                  <option value="instant">Instant</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>

                <select
                  value={subscriptionStatusFilter}
                  onChange={(e) => setSubscriptionStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white cursor-pointer"
                >
                  <option value="active_subscribed">Active Subscribers Only (Has Watched Lists)</option>
                  <option value="zero_watched">Zero Watched Lists (0 Subscriptions)</option>
                  <option value="all">All Accounts (Inc. 0 Watched Lists)</option>
                </select>

                <select
                  value={exemptFilter}
                  onChange={(e) => setExemptFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white cursor-pointer"
                >
                  <option value="all">All Exemption Types</option>
                  <option value="quota_exempt">VIP / Quota Exempt</option>
                  <option value="freq_exempt">Frequency Exempt</option>
                  <option value="regular">Regular Batching</option>
                </select>

                <button
                  onClick={handleAutoRebalance}
                  disabled={processingBatch}
                  className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  title="Distribute all active subscribers evenly into Group 1, Group 2, Group 3"
                >
                  <Zap className="w-3.5 h-3.5" /> Auto-Rebalance Cohorts ({cycleDays} Days)
                </button>
              </div>
            </div>
          </div>

          {/* Subscribers Table */}
          <div className="glass-panel rounded-3xl border-slate-200 dark:border-slate-800 overflow-hidden">
            {loadingSubscribers ? (
              <div className="p-12 text-center">
                <LoadingSpinner message="Fetching subscriber roster & exemption rules..." />
              </div>
            ) : subscribers.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <Users className="w-10 h-10 text-slate-400 mx-auto" />
                <h4 className="text-base font-bold text-slate-900 dark:text-white">No Subscribers Found</h4>
                <p className="text-xs text-slate-500">No active subscribers match the current filter criteria.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-extrabold uppercase tracking-wider">
                    <tr>
                      <th className="p-4">Subscriber</th>
                      <th className="p-4">Watched Items</th>
                      <th className="p-4">Frequency</th>
                      <th className="p-4">Cohort Group</th>
                      <th className="p-4">Quota Exemption Toggle</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-medium">
                    {subscribers.map((user: any) => (
                      <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="p-4">
                          <div className="font-extrabold text-slate-900 dark:text-white">{user.name || user.email.split('@')[0]}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{user.email}</div>
                        </td>
                        <td className="p-4">
                          <button
                            onClick={() => onInspectSubscriptions(user.email)}
                            className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border border-blue-500/20 transition-all cursor-pointer flex items-center gap-1.5"
                          >
                            <Layers className="w-3.5 h-3.5" />
                            {user.watchedListsCount || 0} Watched Lists
                          </button>
                        </td>
                        <td className="p-4 uppercase font-bold text-[11px] text-slate-700 dark:text-slate-300">
                          {user.notificationPreference}
                        </td>
                        <td className="p-4">
                          <select
                            value={user.dispatchGroup}
                            onChange={(e) => handleUpdateUserGroup(user.id, Number(e.target.value))}
                            className="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 cursor-pointer"
                          >
                            <option value={1}>Group 1</option>
                            <option value={2}>Group 2</option>
                            <option value={3}>Group 3</option>
                            <option value={4}>Group 4</option>
                            <option value={5}>Group 5</option>
                          </select>
                        </td>
                        <td className="p-4">
                          <button
                            onClick={() => handleToggleExemption(user.id, user.quotaExempt, 'quotaExempt')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                              user.quotaExempt
                                ? 'bg-emerald-500 text-white shadow-sm'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                            }`}
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            {user.quotaExempt ? 'VIP (Quota Exempt)' : 'Regular Batching'}
                          </button>
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => onInspectSubscriptions(user.email)}
                            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all cursor-pointer"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: ROUND-ROBIN DISPATCHER */}
      {subTab === 'dispatcher' && (
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-3xl border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-purple-600" /> Round-Robin Cohort Group Distribution
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Distributes subscribers evenly into {cycleDays} daily cohorts to stay within daily Brevo limits.
                </p>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {/* Cohort Grouping Feature Flag Toggle Button */}
                <button
                  type="button"
                  onClick={handleToggleCohortGrouping}
                  className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 border shadow-sm ${
                    cohortGroupingEnabled
                      ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30 hover:bg-purple-500/20'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  Cohort Grouping Rule: {cohortGroupingEnabled ? 'ON (ENFORCED)' : 'OFF (BYPASSED)'}
                </button>

                <button
                  onClick={handleAutoRebalance}
                  disabled={processingBatch}
                  className="px-5 py-2.5 rounded-xl text-xs font-extrabold bg-purple-600 hover:bg-purple-700 text-white shadow-md transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${processingBatch ? 'animate-spin' : ''}`} />
                  Auto-Rebalance Cohorts ({cycleDays} Days)
                </button>
              </div>
            </div>

            {/* Cohort Grouping Disabled Warning Banner */}
            {!cohortGroupingEnabled && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-semibold flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>Cohort Grouping Rule is currently <strong>TURNED OFF</strong>. Staggered rotation is bypassed and all subscribers receive emails directly without cohort delays.</span>
                </div>
                <button
                  type="button"
                  onClick={handleToggleCohortGrouping}
                  className="px-3 py-1 rounded-xl bg-amber-500 text-white font-bold text-[11px] shrink-0 cursor-pointer shadow-sm hover:bg-amber-600 transition-all"
                >
                  Turn ON Grouping
                </button>
              </div>
            )}

            {/* Cohorts Visual Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 pt-2">
              {Array.from({ length: cycleDays }).map((_, idx) => {
                const groupNum = idx + 1;
                const countInGroup = rosterMetrics?.cohortDistribution?.[groupNum] || 0;
                return (
                  <div key={groupNum} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-900 dark:text-white">Group {groupNum}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-500/10 text-purple-600 border border-purple-500/20">
                        Cohort {groupNum}
                      </span>
                    </div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">
                      {countInGroup} <span className="text-xs font-medium text-slate-500">subscribers</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Dry Run Simulation Modal */}
      {dryRunModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 max-w-2xl w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" /> Dry-Run Simulation Results
              </h3>
              <button
                onClick={() => setDryRunModalData(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Simulated Dispatches Today</div>
                <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{dryRunModalData.simulatedSendsCount} users</div>
              </div>
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 space-y-1">
                <div className="text-xs font-bold text-rose-700 dark:text-rose-400">Simulated Deferred Users</div>
                <div className="text-2xl font-black text-rose-700 dark:text-rose-400">{dryRunModalData.simulatedDeferredCount} users</div>
              </div>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              <h4 className="text-xs font-extrabold text-slate-700 dark:text-slate-300">Recipient Preview:</h4>
              {dryRunModalData.simulatedSends?.map((s: any) => (
                <div key={s.userId} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex justify-between text-xs">
                  <span>{s.userName || s.userEmail} ({s.jobCount} jobs)</span>
                  <span className="font-bold text-emerald-600">Will Send Today</span>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setDryRunModalData(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 text-white dark:bg-slate-800 font-bold text-xs cursor-pointer"
              >
                Close Simulation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
