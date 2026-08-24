import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users, scrapeLogs, sentEmailLogs } from '@/lib/db/schema';
import { isFeatureEnabled } from '@/lib/flags/check';
import { redisGet, redisSet, redisDel, getRedisClient } from '@/lib/redis/client';
import { count, desc, sql } from 'drizzle-orm';

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

// Timeout wrapper helper
function withTimeout<T>(promise: Promise<T>, ms: number = 5000, fallbackMsg: string = 'Operation timed out'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(fallbackMsg)), ms)),
  ]);
}

// Extract Supabase Project Ref from DATABASE_URL if available
function extractProjectRef(dbUrl?: string): string | null {
  if (!dbUrl) return null;
  const match = dbUrl.match(/postgres\.([a-z0-9]+)@/i) || dbUrl.match(/([a-z0-9]{20,})\.supabase/i);
  return match ? match[1] : null;
}

// 1. Database Check (Supabase / Postgres)
async function checkDatabase(): Promise<ServiceHealthResult> {
  const start = performance.now();
  const dbUrl = process.env.DATABASE_URL || '';
  const hostMatch = dbUrl.match(/@([^:\/]+)/);
  const host = hostMatch ? hostMatch[1] : 'configured database';

  try {
    const res = await withTimeout(
      db.select({ count: count() }).from(users),
      4000,
      'Database query timed out (4s)'
    );
    const latency = Math.round(performance.now() - start);

    return {
      serviceId: 'database',
      name: 'Supabase PostgreSQL Database',
      category: 'database',
      status: 'online',
      latencyMs: latency,
      details: {
        host: host.includes('supabase') ? 'Supabase Pooler / Direct' : host,
        userCount: Number(res[0]?.count || 0),
        ssl: dbUrl.includes('sslmode=require') || dbUrl.includes('supabase'),
        poolMax: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : 5,
      },
      lastCheckedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      serviceId: 'database',
      name: 'Supabase PostgreSQL Database',
      category: 'database',
      status: 'offline',
      latencyMs: Math.round(performance.now() - start),
      details: { host },
      error: err.message || 'Database connection failed',
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

// 2. Redis Check (Upstash Redis)
async function checkRedis(): Promise<ServiceHealthResult> {
  const start = performance.now();
  const restUrl = process.env.UPSTASH_REDIS_REST_URL;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!restUrl || !restToken) {
    return {
      serviceId: 'redis',
      name: 'Upstash Redis Cache',
      category: 'cache',
      status: 'not_configured',
      latencyMs: null,
      details: { message: 'UPSTASH_REDIS_REST_URL or TOKEN missing in environment variables' },
      lastCheckedAt: new Date().toISOString(),
    };
  }

  try {
    const testKey = `health:probe:${Date.now()}`;
    const setOk = await withTimeout(redisSet(testKey, { ok: true }, 10), 3000, 'Redis SET timed out');
    const val = await withTimeout(redisGet<{ ok: boolean }>(testKey), 3000, 'Redis GET timed out');
    await redisDel(testKey).catch(() => {});

    const latency = Math.round(performance.now() - start);

    if (setOk && val?.ok) {
      return {
        serviceId: 'redis',
        name: 'Upstash Redis Cache',
        category: 'cache',
        status: 'online',
        latencyMs: latency,
        details: {
          endpoint: restUrl.replace(/https?:\/\//, '').split('.')[0] + '...upstash.io',
          mode: 'REST (Serverless)',
          ttlTest: 'Passed',
        },
        lastCheckedAt: new Date().toISOString(),
      };
    } else {
      return {
        serviceId: 'redis',
        name: 'Upstash Redis Cache',
        category: 'cache',
        status: 'degraded',
        latencyMs: latency,
        details: { endpoint: restUrl, setOk, valReceived: Boolean(val) },
        error: 'Redis read/write verification incomplete',
        lastCheckedAt: new Date().toISOString(),
      };
    }
  } catch (err: any) {
    return {
      serviceId: 'redis',
      name: 'Upstash Redis Cache',
      category: 'cache',
      status: 'offline',
      latencyMs: Math.round(performance.now() - start),
      details: { endpoint: restUrl },
      error: err.message || 'Redis connection failed',
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

// 3. Brevo Email Check
async function checkBrevo(): Promise<ServiceHealthResult> {
  const start = performance.now();
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.SENDER_EMAIL || process.env.EMAIL_FROM;

  if (!apiKey || apiKey.trim() === '') {
    return {
      serviceId: 'brevo',
      name: 'Brevo Email Service',
      category: 'email',
      status: 'not_configured',
      latencyMs: null,
      details: { senderEmail: senderEmail || 'not set', message: 'BREVO_API_KEY not configured' },
      lastCheckedAt: new Date().toISOString(),
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    const res = await fetch('https://api.brevo.com/v3/account', {
      headers: {
        'api-key': apiKey,
        'accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timer);
    const latency = Math.round(performance.now() - start);

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const email = data.email || senderEmail || 'Configured';
      const planType = data.plan?.[0]?.type || 'Standard';
      const credits = data.plan?.[0]?.credits ?? 'Active';

      return {
        serviceId: 'brevo',
        name: 'Brevo Email Service',
        category: 'email',
        status: 'online',
        latencyMs: latency,
        details: {
          accountEmail: email,
          senderEmail: senderEmail || email,
          planType,
          creditsRemaining: credits,
        },
        lastCheckedAt: new Date().toISOString(),
      };
    } else {
      const errText = await res.text().catch(() => '');
      return {
        serviceId: 'brevo',
        name: 'Brevo Email Service',
        category: 'email',
        status: 'degraded',
        latencyMs: latency,
        details: { httpStatus: res.status, senderEmail },
        error: `Brevo API returned status ${res.status}: ${errText.slice(0, 100)}`,
        lastCheckedAt: new Date().toISOString(),
      };
    }
  } catch (err: any) {
    return {
      serviceId: 'brevo',
      name: 'Brevo Email Service',
      category: 'email',
      status: 'offline',
      latencyMs: Math.round(performance.now() - start),
      details: { senderEmail },
      error: err.name === 'AbortError' ? 'Brevo API ping timed out (4s)' : err.message,
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

// 4. Background Scraper Worker Check
async function checkWorker(): Promise<ServiceHealthResult> {
  const start = performance.now();
  try {
    const isEnabled = await isFeatureEnabled('scraper.enabled', true);
    const latestLog = await db.select().from(scrapeLogs).orderBy(desc(scrapeLogs.scrapedAt)).limit(1);

    const pollInterval = process.env.WORKER_POLL_INTERVAL_MS ? `${parseInt(process.env.WORKER_POLL_INTERVAL_MS, 10) / 1000}s` : '60s';
    const lastRunAt = latestLog[0]?.scrapedAt ? new Date(latestLog[0].scrapedAt).toISOString() : null;
    const latency = Math.round(performance.now() - start);

    let status: 'online' | 'degraded' | 'offline' = 'online';
    let note = 'Worker active and operational';

    if (!isEnabled) {
      status = 'degraded';
      note = 'Disabled via Feature Flag (scraper.enabled = false)';
    } else if (lastRunAt) {
      const timeDiffMinutes = (Date.now() - new Date(lastRunAt).getTime()) / (1000 * 60);
      // Standard career page check intervals are 180 minutes (3 hours). Mark degraded only if no run in > 24 hours.
      if (timeDiffMinutes > 1440) {
        status = 'degraded';
        note = `No scraping activity recorded in last ${Math.round(timeDiffMinutes / 60)} hours`;
      } else {
        note = `Last scrape ${Math.round(timeDiffMinutes)}m ago (scheduled interval active)`;
      }
    }

    return {
      serviceId: 'worker',
      name: 'Scraper Scheduler & Worker',
      category: 'worker',
      status,
      latencyMs: latency,
      details: {
        featureFlagEnabled: isEnabled,
        pollInterval,
        lastRunAt: lastRunAt || 'No execution logs recorded yet',
        lastRunStatus: latestLog[0] ? (latestLog[0].success ? 'Success' : 'Failed') : 'N/A',
        note,
      },
      lastCheckedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      serviceId: 'worker',
      name: 'Scraper Scheduler & Worker',
      category: 'worker',
      status: 'offline',
      latencyMs: Math.round(performance.now() - start),
      details: {},
      error: err.message,
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

// 5. Google OAuth Check
async function checkGoogleOAuth(): Promise<ServiceHealthResult> {
  const start = performance.now();
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      serviceId: 'google_oauth',
      name: 'Google OAuth Integration',
      category: 'auth',
      status: 'not_configured',
      latencyMs: null,
      details: { message: 'GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing' },
      lastCheckedAt: new Date().toISOString(),
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);

    const res = await fetch('https://accounts.google.com/.well-known/openid-configuration', {
      signal: controller.signal,
    });

    clearTimeout(timer);
    const latency = Math.round(performance.now() - start);

    if (res.ok) {
      return {
        serviceId: 'google_oauth',
        name: 'Google OAuth Integration',
        category: 'auth',
        status: 'online',
        latencyMs: latency,
        details: {
          clientIdPrefix: clientId.slice(0, 15) + '...',
          discoveryEndpoint: 'https://accounts.google.com/.well-known/openid-configuration',
          status: 'Reachability verified',
        },
        lastCheckedAt: new Date().toISOString(),
      };
    } else {
      return {
        serviceId: 'google_oauth',
        name: 'Google OAuth Integration',
        category: 'auth',
        status: 'degraded',
        latencyMs: latency,
        details: { clientIdPrefix: clientId.slice(0, 15) + '...' },
        error: `Google OpenID discovery endpoint returned ${res.status}`,
        lastCheckedAt: new Date().toISOString(),
      };
    }
  } catch (err: any) {
    return {
      serviceId: 'google_oauth',
      name: 'Google OAuth Integration',
      category: 'auth',
      status: 'degraded',
      latencyMs: Math.round(performance.now() - start),
      details: { clientIdPrefix: clientId.slice(0, 15) + '...' },
      error: err.name === 'AbortError' ? 'Google discovery ping timed out (3s)' : err.message,
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

// 6. Ollama LLM API Check
async function checkOllama(): Promise<ServiceHealthResult> {
  const start = performance.now();
  const baseUrl = process.env.OLLAMA_BASE_URL;
  const apiKey = process.env.OLLAMA_API_KEY;
  const model = process.env.OLLAMA_MODEL || 'gemma4:31b';

  if (!baseUrl) {
    return {
      serviceId: 'ollama',
      name: 'Ollama LLM API',
      category: 'ai',
      status: 'not_configured',
      latencyMs: null,
      details: { message: 'OLLAMA_BASE_URL missing in environment variables' },
      lastCheckedAt: new Date().toISOString(),
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    const headers: Record<string, string> = { 'accept': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
      headers,
      signal: controller.signal,
    });

    clearTimeout(timer);
    const latency = Math.round(performance.now() - start);

    if (res.ok) {
      const data = await res.json().catch(() => ({ models: [] }));
      const modelList = Array.isArray(data.models) ? data.models.map((m: any) => m.name) : [];

      return {
        serviceId: 'ollama',
        name: 'Ollama LLM API',
        category: 'ai',
        status: 'online',
        latencyMs: latency,
        details: {
          baseUrl,
          configuredModel: model,
          availableModelsCount: modelList.length,
          modelList: modelList.slice(0, 5),
        },
        lastCheckedAt: new Date().toISOString(),
      };
    } else {
      return {
        serviceId: 'ollama',
        name: 'Ollama LLM API',
        category: 'ai',
        status: 'degraded',
        latencyMs: latency,
        details: { baseUrl, targetModel: model, httpStatus: res.status },
        error: `Ollama server returned status ${res.status}`,
        lastCheckedAt: new Date().toISOString(),
      };
    }
  } catch (err: any) {
    return {
      serviceId: 'ollama',
      name: 'Ollama LLM API',
      category: 'ai',
      status: 'offline',
      latencyMs: Math.round(performance.now() - start),
      details: { baseUrl, targetModel: model },
      error: err.name === 'AbortError' ? 'Ollama API ping timed out (3.5s)' : err.message,
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

// 7. Resource Quotas & Extended Supabase Metrics
async function fetchResourceQuotas(): Promise<ResourceQuotas> {
  let dbSizeMB = 0;
  let topTables: { tableName: string; sizeFormatted: string; bytes: number }[] = [];
  let isSupabaseManagementApiUsed = false;
  let egressMB = 0;

  // Check if Supabase Management API credentials exist
  const supabaseProjectRef = process.env.SUPABASE_PROJECT_REF || extractProjectRef(process.env.DATABASE_URL);
  const supabaseToken = process.env.SUPABASE_ACCESS_TOKEN;

  if (supabaseProjectRef && supabaseToken) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`https://api.supabase.com/v1/projects/${supabaseProjectRef}/usage`, {
        headers: {
          'Authorization': `Bearer ${supabaseToken}`,
          'accept': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const mgmtData = await res.json();
        if (mgmtData.db_size?.usage !== undefined) {
          dbSizeMB = Number((mgmtData.db_size.usage / (1024 * 1024)).toFixed(2));
        }
        if (mgmtData.db_egress?.usage !== undefined) {
          egressMB = Number((mgmtData.db_egress.usage / (1024 * 1024)).toFixed(2));
        }
        isSupabaseManagementApiUsed = true;
      }
    } catch (e: any) {
      console.warn('[Supabase Mgmt API Probe Warning]', e.message);
    }
  }

  // Fallback / Standard Postgres Internal Queries for Schema Size & Top Tables
  let schemasBreakdown: { schemaName: string; sizeFormatted: string; bytes: number }[] = [];
  let publicDistribution = { dataSizeFormatted: '0 B', indexSizeFormatted: '0 B', dataBytes: 0, indexBytes: 0 };
  let activeConnections = 0;
  let installedExtensions: { name: string; version: string }[] = [];

  try {
    const sizeRes = await db.execute(sql`SELECT pg_database_size(current_database()) as size_bytes;`);
    const bytes = Number(sizeRes[0]?.size_bytes || 0);
    if (!isSupabaseManagementApiUsed) {
      dbSizeMB = Number((bytes / (1024 * 1024)).toFixed(2));
    }

    const tableRes = await db.execute(sql`
      SELECT 
        relname as table_name,
        pg_size_pretty(pg_total_relation_size(relid)) as size_formatted,
        pg_total_relation_size(relid) as size_bytes
      FROM pg_catalog.pg_statio_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 5;
    `);
    topTables = tableRes.map((r: any) => ({
      tableName: r.table_name,
      sizeFormatted: r.size_formatted,
      bytes: Number(r.size_bytes || 0),
    }));

    // Extended Supabase & Postgres Metrics
    const schemaRes = await db.execute(sql`
      SELECT 
        schemaname as schema_name,
        pg_size_pretty(sum(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)))) as size_formatted,
        sum(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)))::bigint as size_bytes
      FROM pg_tables
      GROUP BY schemaname
      ORDER BY sum(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) DESC;
    `);
    schemasBreakdown = schemaRes.map((r: any) => ({
      schemaName: r.schema_name,
      sizeFormatted: r.size_formatted,
      bytes: Number(r.size_bytes || 0),
    }));

    const distRes = await db.execute(sql`
      SELECT 
        pg_size_pretty(sum(pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)))) as data_size,
        pg_size_pretty(sum(pg_indexes_size(quote_ident(schemaname) || '.' || quote_ident(tablename)))) as index_size,
        sum(pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)))::bigint as data_bytes,
        sum(pg_indexes_size(quote_ident(schemaname) || '.' || quote_ident(tablename)))::bigint as index_bytes
      FROM pg_tables
      WHERE schemaname = 'public';
    `);
    if (distRes[0]) {
      publicDistribution = {
        dataSizeFormatted: String(distRes[0].data_size || '0 B'),
        indexSizeFormatted: String(distRes[0].index_size || '0 B'),
        dataBytes: Number(distRes[0].data_bytes || 0),
        indexBytes: Number(distRes[0].index_bytes || 0),
      };
    }

    const connRes = await db.execute(sql`SELECT count(*)::int as active_connections FROM pg_stat_activity;`);
    activeConnections = Number(connRes[0]?.active_connections || 0);

    const extRes = await db.execute(sql`SELECT extname, extversion FROM pg_extension ORDER BY extname ASC;`);
    installedExtensions = extRes.map((r: any) => ({ name: r.extname, version: r.extversion }));
  } catch (e: any) {
    console.error('[Quota Probe Extended Metrics Error]', e.message);
  }

  let todaySentEmails = 0;
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [emailRes] = await db
      .select({ count: count() })
      .from(sentEmailLogs)
      .where(sql`${sentEmailLogs.createdAt} >= ${startOfDay.toISOString()}`);
    todaySentEmails = Number(emailRes?.count || 0);
  } catch (e) {}

  let redisKeyCount = 0;
  try {
    const redis = getRedisClient();
    if (redis) {
      const keys = await redis.keys('*');
      redisKeyCount = keys ? keys.length : 0;
    }
  } catch (e) {}

  if (!isSupabaseManagementApiUsed) {
    egressMB = Number((dbSizeMB * 1.45 + (todaySentEmails * 0.05)).toFixed(2));
  }

  const dbStorageLimitMB = 500;
  const dbEgressLimitMB = 5120; // 5 GB
  const brevoLimitDaily = 300;
  const redisCapDaily = 10000;

  return {
    source: isSupabaseManagementApiUsed ? 'supabase_management_api' : 'postgres_internal_query',
    sourceDescription: isSupabaseManagementApiUsed
      ? 'Live metrics synced directly from Supabase Cloud Management API'
      : 'Measured from Postgres relational schema (Postgres internal query). Supabase Dashboard metrics include system WAL logs & billing monthly cumulative bandwidth.',
    databaseStorage: {
      usedMB: dbSizeMB,
      limitMB: dbStorageLimitMB,
      remainingMB: Number(Math.max(0, dbStorageLimitMB - dbSizeMB).toFixed(2)),
      usedPct: Number(((dbSizeMB / dbStorageLimitMB) * 100).toFixed(1)),
      tier: 'Supabase Free Plan (500 MB)',
      source: isSupabaseManagementApiUsed ? 'Supabase Platform API' : 'PostgreSQL Schema Query',
      topTables,
    },
    databaseEgress: {
      usedMB: egressMB,
      limitMB: dbEgressLimitMB,
      remainingMB: Number(Math.max(0, dbEgressLimitMB - egressMB).toFixed(2)),
      usedPct: Number(((egressMB / dbEgressLimitMB) * 100).toFixed(1)),
      tier: 'Supabase Free Plan (5 GB / mo)',
      source: isSupabaseManagementApiUsed ? 'Supabase Platform API' : 'Estimated DB Traffic',
    },
    brevoEmails: {
      usedToday: todaySentEmails,
      limitDaily: brevoLimitDaily,
      remainingToday: Math.max(0, brevoLimitDaily - todaySentEmails),
      usedPct: Number(((todaySentEmails / brevoLimitDaily) * 100).toFixed(1)),
      tier: 'Brevo Free Plan (300 / day)',
    },
    redisUsage: {
      activeKeys: redisKeyCount,
      limitDailyRequests: redisCapDaily,
      limitStorageMB: 256,
      tier: 'Upstash Free Plan (10K ops/day, 256 MB)',
    },
    supabaseExtended: {
      schemasBreakdown,
      publicDistribution,
      diagnostics: {
        activeConnections,
        installedExtensions,
      },
    },
  };
}

export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const service = searchParams.get('service') || 'all';

  try {
    let results: ServiceHealthResult[] = [];
    const quotas = await fetchResourceQuotas();

    if (service === 'database') {
      results = [await checkDatabase()];
    } else if (service === 'redis') {
      results = [await checkRedis()];
    } else if (service === 'brevo') {
      results = [await checkBrevo()];
    } else if (service === 'worker') {
      results = [await checkWorker()];
    } else if (service === 'google') {
      results = [await checkGoogleOAuth()];
    } else if (service === 'ollama') {
      results = [await checkOllama()];
    } else {
      // Run active live services in parallel for maximum performance
      const settled = await Promise.allSettled([
        checkDatabase(),
        checkRedis(),
        checkBrevo(),
        checkWorker(),
        checkGoogleOAuth(),
        checkOllama(),
      ]);

      results = settled.map((item, idx) => {
        if (item.status === 'fulfilled') {
          return item.value;
        } else {
          const names = ['Database', 'Redis', 'Brevo', 'Worker', 'Google OAuth', 'Ollama'];
          const categories: any[] = ['database', 'cache', 'email', 'worker', 'auth', 'ai'];
          return {
            serviceId: names[idx].toLowerCase().replace(/\s+/g, '_'),
            name: names[idx],
            category: categories[idx],
            status: 'offline',
            latencyMs: null,
            details: {},
            error: item.reason?.message || 'Check failed abruptly',
            lastCheckedAt: new Date().toISOString(),
          };
        }
      });
    }

    // Overall system status calculation
    const onlineCount = results.filter(r => r.status === 'online').length;
    const degradedCount = results.filter(r => r.status === 'degraded').length;
    const offlineCount = results.filter(r => r.status === 'offline').length;
    const notConfiguredCount = results.filter(r => r.status === 'not_configured').length;

    let overallStatus: 'operational' | 'degraded' | 'outage' = 'operational';
    if (offlineCount > 0) {
      overallStatus = 'outage';
    } else if (degradedCount > 0) {
      overallStatus = 'degraded';
    }

    return NextResponse.json({
      overallStatus,
      summary: {
        totalServices: results.length,
        onlineCount,
        degradedCount,
        offlineCount,
        notConfiguredCount,
      },
      services: results,
      quotas,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Admin System Status Error]', err.message);
    return NextResponse.json({ error: err.message || 'System health evaluation failed' }, { status: 500 });
  }
}
