'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Activity, Database, Server, Mail, ShieldCheck, Cpu, Bot, RefreshCw,
  CheckCircle2, AlertTriangle, XCircle, Clock, Zap,
  ChevronDown, ChevronUp, Radio, HardDrive, ArrowUpRight, Gauge, Info, Layers, Sparkles,
  PieChart, Sliders, CheckSquare, Maximize2, Shield
} from 'lucide-react';
import { useToast } from '@/components/Toast';

export interface ServiceHealthResult {
  serviceId: string;
  name: string;
  category: 'database' | 'cache' | 'email' | 'worker' | 'auth' | 'ai';
  status: 'online' | 'degraded' | 'offline' | 'not_configured';
  latencyMs: number | null;
  details: Record<string, any>;
  error?: string | null;
  lastCheckedAt: string;
}

export interface SupabaseExtendedMetrics {
  schemasBreakdown: { schemaName: string; sizeFormatted: string; bytes: number }[];
  publicDistribution: {
    dataSizeFormatted: string;
    indexSizeFormatted: string;
    dataBytes: number;
    indexBytes: number;
  };
  diagnostics: {
    activeConnections: number;
    installedExtensions: { name: string; version: string }[];
  };
}

export interface ResourceQuotas {
  source: 'supabase_management_api' | 'postgres_internal_query';
  sourceDescription: string;
  databaseStorage: {
    usedMB: number;
    limitMB: number;
    remainingMB: number;
    usedPct: number;
    tier: string;
    source: string;
    topTables: { tableName: string; sizeFormatted: string; bytes: number }[];
  };
  databaseEgress: {
    usedMB: number;
    limitMB: number;
    remainingMB: number;
    usedPct: number;
    tier: string;
    source: string;
  };
  brevoEmails: {
    usedToday: number;
    limitDaily: number;
    remainingToday: number;
    usedPct: number;
    tier: string;
  };
  redisUsage: {
    activeKeys: number;
    limitDailyRequests: number;
    limitStorageMB: number;
    tier: string;
  };
  supabaseExtended?: SupabaseExtendedMetrics;
}

export interface SystemStatusData {
  overallStatus: 'operational' | 'degraded' | 'outage';
  summary: {
    totalServices: number;
    onlineCount: number;
    degradedCount: number;
    offlineCount: number;
    notConfiguredCount: number;
  };
  services: ServiceHealthResult[];
  quotas?: ResourceQuotas;
  timestamp: string;
}

export default function SystemStatusView() {
  const toast = useToast();
  const [data, setData] = useState<SystemStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recheckingService, setRecheckingService] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [showTableDetails, setShowTableDetails] = useState(false);
  const [showExtendedSupabaseView, setShowExtendedSupabaseView] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStatus = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const res = await fetch('/api/admin/system-status');
      if (!res.ok) {
        throw new Error(`Failed to fetch status (HTTP ${res.status})`);
      }
      const json: SystemStatusData = await res.json();
      setData(json);
      setLastUpdated(new Date());
    } catch (err: any) {
      toast.error(`System Health Check Error: ${err.message || 'Unable to retrieve status'}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  // Initial async trigger after page mount (non-blocking)
  useEffect(() => {
    fetchStatus(true);
  }, [fetchStatus]);

  // Auto Refresh timer (30s)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchStatus(false);
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStatus]);

  // Re-check single service
  const recheckSingleService = async (serviceId: string) => {
    setRecheckingService(serviceId);
    try {
      const res = await fetch(`/api/admin/system-status?service=${serviceId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const singleJson = await res.json();
      const updatedService: ServiceHealthResult = singleJson.services?.[0];

      if (updatedService && data) {
        const newServices = data.services.map(s => s.serviceId === serviceId ? updatedService : s);
        const onlineCount = newServices.filter(r => r.status === 'online').length;
        const degradedCount = newServices.filter(r => r.status === 'degraded').length;
        const offlineCount = newServices.filter(r => r.status === 'offline').length;
        const notConfiguredCount = newServices.filter(r => r.status === 'not_configured').length;

        let overallStatus: 'operational' | 'degraded' | 'outage' = 'operational';
        if (offlineCount > 0) overallStatus = 'outage';
        else if (degradedCount > 0) overallStatus = 'degraded';

        setData({
          ...data,
          overallStatus,
          summary: {
            totalServices: newServices.length,
            onlineCount,
            degradedCount,
            offlineCount,
            notConfiguredCount,
          },
          services: newServices,
          timestamp: new Date().toISOString(),
        });
        setLastUpdated(new Date());
        toast.success(`${updatedService.name} check completed.`);
      }
    } catch (err: any) {
      toast.error(`Service Check Failed: ${err.message}`);
    } finally {
      setRecheckingService(null);
    }
  };

  const toggleExpand = (serviceId: string) => {
    setExpandedCards(prev => ({ ...prev, [serviceId]: !prev[serviceId] }));
  };

  const getServiceIcon = (category: ServiceHealthResult['category'], serviceId: string) => {
    switch (category) {
      case 'database':
        return <Database className="w-5 h-5 text-blue-500" />;
      case 'cache':
        return <Server className="w-5 h-5 text-red-500" />;
      case 'email':
        return <Mail className="w-5 h-5 text-teal-500" />;
      case 'worker':
        return <Cpu className="w-5 h-5 text-amber-500" />;
      case 'auth':
        return <ShieldCheck className="w-5 h-5 text-emerald-500" />;
      case 'ai':
        return <Bot className="w-5 h-5 text-indigo-500" />;
      default:
        return <Activity className="w-5 h-5 text-slate-500" />;
    }
  };

  const getStatusBadge = (status: ServiceHealthResult['status']) => {
    switch (status) {
      case 'online':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            ONLINE
          </span>
        );
      case 'degraded':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            DEGRADED
          </span>
        );
      case 'offline':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            OFFLINE
          </span>
        );
      case 'not_configured':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            NOT SET
          </span>
        );
    }
  };

  const renderProgressBar = (pct: number) => {
    const barColor = pct > 85 ? 'bg-rose-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500';
    return (
      <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all duration-500 rounded-full`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    );
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="p-6 rounded-2xl bg-white dark:bg-[#121827] border border-slate-200 dark:border-slate-800 shadow-sm animate-pulse flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-6 w-48 bg-slate-200 dark:bg-slate-800 rounded-md" />
            <div className="h-4 w-72 bg-slate-100 dark:bg-slate-850 rounded-md" />
          </div>
          <div className="h-10 w-32 bg-slate-200 dark:bg-slate-800 rounded-xl" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="p-5 rounded-2xl bg-white dark:bg-[#121827] border border-slate-200 dark:border-slate-800 shadow-sm animate-pulse space-y-4">
              <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded-md" />
              <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded-md" />
              <div className="h-2 w-full bg-slate-100 dark:bg-slate-850 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const overall = data?.overallStatus || 'operational';
  const q = data?.quotas;
  const ext = q?.supabaseExtended;

  return (
    <div className="space-y-6">
      {/* Top Banner: Overall System Status Header */}
      <div className={`p-6 rounded-2xl border shadow-sm transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
        overall === 'operational'
          ? 'bg-emerald-500/5 dark:bg-emerald-950/20 border-emerald-500/20'
          : overall === 'degraded'
          ? 'bg-amber-500/5 dark:bg-amber-950/20 border-amber-500/20'
          : 'bg-rose-500/5 dark:bg-rose-950/20 border-rose-500/20'
      }`}>
        <div className="flex items-center gap-4">
          <div className={`p-3.5 rounded-2xl ${
            overall === 'operational'
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : overall === 'degraded'
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
          }`}>
            {overall === 'operational' ? (
              <CheckCircle2 className="w-8 h-8" />
            ) : overall === 'degraded' ? (
              <AlertTriangle className="w-8 h-8" />
            ) : (
              <XCircle className="w-8 h-8" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {overall === 'operational' ? 'All Systems Operational' : overall === 'degraded' ? 'Partial Degradation Detected' : 'Service Outage Detected'}
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-slate-900/10 dark:bg-white/10 text-slate-700 dark:text-slate-300">
                {data?.summary.onlineCount} / {data?.summary.totalServices} Services Up
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              Last diagnostic run: {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Just now'}
              {autoRefresh && <span className="text-emerald-500 font-semibold">• Auto-refresh active (30s)</span>}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 border ${
              autoRefresh
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-pulse text-emerald-500' : ''}`} />
            Auto-Refresh
          </button>

          <button
            onClick={() => fetchStatus(false)}
            disabled={refreshing}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Probing Services...' : 'Run Full Check'}
          </button>
        </div>
      </div>

      {/* SECTION 2: FREE TIER RESOURCE USAGE & REMAINING QUOTAS */}
      {q && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Gauge className="w-5 h-5 text-indigo-500" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Free Tier Resource Quotas &amp; Remaining Capacity</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowExtendedSupabaseView(!showExtendedSupabaseView)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-all flex items-center gap-1.5 shadow-sm"
              >
                <PieChart className="w-3.5 h-3.5" />
                {showExtendedSupabaseView ? 'Hide Expanded View' : 'Expanded Supabase View'}
              </button>

              <span className={`text-[11px] px-2.5 py-1 rounded-full font-extrabold border ${
                q.source === 'supabase_management_api'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
              }`}>
                {q.source === 'supabase_management_api' ? '⚡ Supabase Management API' : '📊 PostgreSQL DB Query'}
              </span>
              <button
                onClick={() => setShowExplanation(!showExplanation)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                title="Why do DB/Egress numbers differ from Supabase Dashboard?"
              >
                <Info className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Explanation Banner */}
          {showExplanation && (
            <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-slate-700 dark:text-slate-300 text-xs space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 font-bold text-blue-600 dark:text-blue-400">
                <Sparkles className="w-4 h-4" /> Understanding Supabase Dashboard vs Internal DB Queries
              </div>
              <p>
                • <strong>DB Storage (pg_database_size)</strong>: Postgres internal SQL measures exact bytes of your relational tables &amp; indexes (e.g. 10.6 MB). Supabase Cloud Dashboard includes WAL (Write-Ahead Logs), system schemas (<code>auth</code>, <code>storage</code>, <code>realtime</code>), and minimum allocated disk chunks.
              </p>
              <p>
                • <strong>Egress / Bandwidth</strong>: PostgreSQL inside the database does not maintain a cumulative billing cycle network counter. Egress is measured at Supabase’s network proxy/PgBouncer layer over the 30-day cycle.
              </p>
              <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                💡 Tip: Add <code>SUPABASE_ACCESS_TOKEN</code> and <code>SUPABASE_PROJECT_REF</code> in <code>.env</code> to enable 100% direct 1-to-1 sync with your live Supabase Platform Dashboard API!
              </p>
            </div>
          )}

          {/* EXPANDED SUPABASE METRICS DRAWER */}
          {showExtendedSupabaseView && ext && (
            <div className="p-6 rounded-2xl bg-slate-900 text-white shadow-2xl border border-slate-800 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                    <Database className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white flex items-center gap-2">
                      Expanded Supabase System &amp; Schema Metrics
                    </h4>
                    <p className="text-xs text-slate-400">Deep-dive PostgreSQL database storage allocation, schema distribution &amp; connections</p>
                  </div>
                </div>

                <button
                  onClick={() => setShowExtendedSupabaseView(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Close Expanded View
                </button>
              </div>

              {/* 3 Grid Columns in Expanded View */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Column 1: Schema Sizes Breakdown */}
                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-750 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                    <span className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-400" /> Schemas Storage Breakdown
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">All PostgreSQL Schemas</span>
                  </div>

                  <div className="space-y-2 font-mono text-xs">
                    {ext.schemasBreakdown.map(s => (
                      <div key={s.schemaName} className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          <span className="font-bold text-slate-200">{s.schemaName}</span>
                        </div>
                        <span className="font-black text-blue-400">{s.sizeFormatted}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Column 2: Public Schema Data vs Index Distribution */}
                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-750 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                    <span className="flex items-center gap-2">
                      <PieChart className="w-4 h-4 text-purple-400" /> Public Data vs Index Distribution
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">Public Schema</span>
                  </div>

                  <div className="space-y-3 font-mono text-xs">
                    <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Table Row Data:</span>
                        <span className="text-purple-300 font-bold">{ext.publicDistribution.dataSizeFormatted}</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full" style={{ width: '40%' }} />
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Database Indexes:</span>
                        <span className="text-indigo-300 font-bold">{ext.publicDistribution.indexSizeFormatted}</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: '60%' }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Column 3: Active Connections & Installed Extensions */}
                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-750 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                    <span className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-emerald-400" /> Connections &amp; Extensions
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">Runtime Stats</span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400">Active Connections:</span>
                      <span className="text-emerald-400 font-bold text-sm">{ext.diagnostics.activeConnections} active</span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-800 pt-2 font-mono">
                      <span>PgBouncer Pooler:</span>
                      <span className="text-slate-200">Port 6543 (Enabled)</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5 font-mono text-[11px]">
                    <span className="text-slate-400 block font-bold">Installed Extensions:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {ext.diagnostics.installedExtensions.map(e => (
                        <span key={e.name} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                          {e.name} v{e.version}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STANDARD QUOTAS GRID CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Supabase Database Storage */}
            <div className="p-5 rounded-2xl bg-white dark:bg-[#121827] border border-slate-200 dark:border-slate-800/80 shadow-sm space-y-3">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Supabase DB Size</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  {q.databaseStorage.usedPct}% Used
                </span>
              </div>

              <div>
                <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                  {q.databaseStorage.usedMB} <span className="text-xs font-normal text-slate-400">/ {q.databaseStorage.limitMB} MB</span>
                </div>
                <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {q.databaseStorage.remainingMB} MB Remaining
                </div>
              </div>

              {renderProgressBar(q.databaseStorage.usedPct)}

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-[11px]">
                <span className="text-slate-400">{q.databaseStorage.tier}</span>
                <button
                  onClick={() => setShowTableDetails(!showTableDetails)}
                  className="text-blue-500 hover:underline flex items-center gap-1 font-medium"
                >
                  Tables <ChevronDown className={`w-3 h-3 transition-transform ${showTableDetails ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {/* Card 2: Supabase DB Egress */}
            <div className="p-5 rounded-2xl bg-white dark:bg-[#121827] border border-slate-200 dark:border-slate-800/80 shadow-sm space-y-3">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <ArrowUpRight className="w-4 h-4 text-purple-500" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Database Egress</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  {q.databaseEgress.usedPct}% Used
                </span>
              </div>

              <div>
                <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                  {q.databaseEgress.usedMB} <span className="text-xs font-normal text-slate-400">/ {(q.databaseEgress.limitMB / 1024).toFixed(0)} GB</span>
                </div>
                <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {(q.databaseEgress.remainingMB / 1024).toFixed(2)} GB Remaining
                </div>
              </div>

              {renderProgressBar(q.databaseEgress.usedPct)}

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
                {q.databaseEgress.tier}
              </div>
            </div>

            {/* Card 3: Brevo Daily Emails */}
            <div className="p-5 rounded-2xl bg-white dark:bg-[#121827] border border-slate-200 dark:border-slate-800/80 shadow-sm space-y-3">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-teal-500" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Brevo Daily Emails</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  {q.brevoEmails.usedPct}% Sent
                </span>
              </div>

              <div>
                <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                  {q.brevoEmails.usedToday} <span className="text-xs font-normal text-slate-400">/ {q.brevoEmails.limitDaily} today</span>
                </div>
                <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {q.brevoEmails.remainingToday} Emails Remaining Today
                </div>
              </div>

              {renderProgressBar(q.brevoEmails.usedPct)}

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
                {q.brevoEmails.tier}
              </div>
            </div>

            {/* Card 4: Upstash Redis Cap */}
            <div className="p-5 rounded-2xl bg-white dark:bg-[#121827] border border-slate-200 dark:border-slate-800/80 shadow-sm space-y-3">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Upstash Redis Cap</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  Active
                </span>
              </div>

              <div>
                <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                  {q.redisUsage.activeKeys} <span className="text-xs font-normal text-slate-400">active keys</span>
                </div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                  Cap: {q.redisUsage.limitDailyRequests.toLocaleString()} req/day • {q.redisUsage.limitStorageMB} MB
                </div>
              </div>

              {renderProgressBar(1)}

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
                {q.redisUsage.tier}
              </div>
            </div>
          </div>

          {/* Expandable Table Breakdown */}
          {showTableDetails && q.databaseStorage.topTables && q.databaseStorage.topTables.length > 0 && (
            <div className="p-5 rounded-2xl bg-slate-900 text-white shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <Layers className="w-4 h-4 text-blue-400" /> Top PostgreSQL Database Table Sizes
                </div>
                <button onClick={() => setShowTableDetails(false)} className="text-xs text-slate-400 hover:text-white">
                  Close
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs font-mono">
                {q.databaseStorage.topTables.map((t, idx) => (
                  <div key={t.tableName} className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-slate-300 truncate">#{idx + 1} {t.tableName}</span>
                    <span className="text-base font-black text-blue-400 mt-1">{t.sizeFormatted}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: SERVICES DIAGNOSTIC CARDS GRID */}
      <div className="space-y-3 pt-2">
        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-500" /> Individual Service Probes &amp; Integration Diagnostics
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {data?.services.map(svc => {
            const isExpanded = Boolean(expandedCards[svc.serviceId]);
            const isRechecking = recheckingService === svc.serviceId;

            return (
              <div
                key={svc.serviceId}
                className="p-5 rounded-2xl bg-white dark:bg-[#121827] border border-slate-200 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/50 dark:border-slate-700/50">
                        {getServiceIcon(svc.category, svc.serviceId)}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{svc.name}</h3>
                        <p className="text-[11px] text-slate-400 capitalize">{svc.category} integration</p>
                      </div>
                    </div>
                    {getStatusBadge(svc.status)}
                  </div>

                  {/* Main Metric / Latency */}
                  <div className="my-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      Response Latency
                    </span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {svc.latencyMs !== null ? `${svc.latencyMs} ms` : 'N/A'}
                    </span>
                  </div>

                  {/* Warning / Note for Degraded status */}
                  {svc.status === 'degraded' && svc.details?.note && (
                    <div className="mb-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="font-mono text-[11px]">{svc.details.note}</span>
                    </div>
                  )}

                  {/* Error message if any */}
                  {svc.error && (
                    <div className="mb-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="break-all font-mono text-[11px]">{svc.error}</span>
                    </div>
                  )}

                  {/* Expandable Details Drawer */}
                  {isExpanded && svc.details && Object.keys(svc.details).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/60 text-xs space-y-2 font-mono">
                      {Object.entries(svc.details).map(([key, val]) => (
                        <div key={key} className="flex justify-between gap-2 text-[11px]">
                          <span className="text-slate-400 capitalize">{key.replace(/([A-Z])/g, ' $1')}:</span>
                          <span className="text-slate-700 dark:text-slate-300 font-semibold truncate max-w-[180px]">
                            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bottom Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                  <button
                    onClick={() => toggleExpand(svc.serviceId)}
                    className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium flex items-center gap-1 transition-colors"
                  >
                    {isExpanded ? (
                      <>Less info <ChevronUp className="w-3.5 h-3.5" /></>
                    ) : (
                      <>View diagnostics <ChevronDown className="w-3.5 h-3.5" /></>
                    )}
                  </button>

                  <button
                    onClick={() => recheckSingleService(svc.serviceId)}
                    disabled={isRechecking}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all disabled:opacity-40"
                    title="Re-check this service"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRechecking ? 'animate-spin text-blue-500' : ''}`} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
