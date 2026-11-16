/**
 * Central, validated access to environment configuration.
 *
 * Values are read lazily so that `next build` (which imports route modules
 * without a full runtime environment) does not fail, while a misconfigured
 * production process fails loudly on first use instead of silently running
 * with insecure defaults.
 */

const INSECURE_PLACEHOLDERS = new Set([
  'super-secret-jwt-access-token-key-change-in-production-min32chars',
  'super-secret-jwt-refresh-token-key-change-in-production-min32chars',
  'change-me',
  'changeme',
]);

const DEV_FALLBACK_SECRET = 'dev-only-insecure-secret-do-not-use-in-production-0001';

function read(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readInt(name: string, fallback: number, min?: number, max?: number): number {
  const raw = read(name);
  const parsed = raw === undefined ? NaN : Number(raw);
  let value = Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
  if (min !== undefined) value = Math.max(min, value);
  if (max !== undefined) value = Math.min(max, value);
  return value;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

let warnedDevSecret = false;

export const env = {
  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  },
  get isTest(): boolean {
    return process.env.NODE_ENV === 'test';
  },

  get databaseUrl(): string {
    const url = read('DATABASE_URL');
    if (url) return url;
    // `next build` may run without database access; pages that prerender data
    // fall back to empty states and are regenerated at runtime.
    if (env.isProduction && process.env.NEXT_PHASE !== 'phase-production-build') throw new ConfigError('DATABASE_URL is required in production.');
    return 'postgresql://postgres:postgres@localhost:5432/jobpingly';
  },

  /**
   * Secret used to sign short-lived tokens (unsubscribe links, CSRF-safe
   * action links). Sessions themselves are opaque random tokens stored hashed
   * in the database and do not depend on this value.
   */
  get appSecret(): string {
    const secret = read('APP_SECRET') ?? read('JWT_ACCESS_SECRET');
    if (secret && secret.length >= 32 && !INSECURE_PLACEHOLDERS.has(secret)) return secret;
    if (env.isProduction) {
      throw new ConfigError(
        'APP_SECRET (or JWT_ACCESS_SECRET) must be set to a random value of at least 32 characters in production.',
      );
    }
    if (!warnedDevSecret && !env.isTest) {
      warnedDevSecret = true;
      console.warn('[config] APP_SECRET is missing or a placeholder. Using an insecure development secret.');
    }
    return secret && secret.length >= 32 ? secret : DEV_FALLBACK_SECRET;
  },

  /** Canonical public origin, without a trailing slash. */
  get appUrl(): string {
    const url = read('NEXT_PUBLIC_APP_URL') ?? read('APP_URL');
    if (url) return url.replace(/\/+$/, '');
    if (read('RENDER_EXTERNAL_URL')) return read('RENDER_EXTERNAL_URL')!.replace(/\/+$/, '');
    return `http://localhost:${read('PORT') ?? '3000'}`;
  },

  get adminBootstrapEmail(): string | undefined {
    return read('ADMIN_BOOTSTRAP_EMAIL')?.toLowerCase();
  },

  /** Shared secret for /api/cron/* endpoints. Cron endpoints are disabled when unset. */
  get cronSecret(): string | undefined {
    const secret = read('CRON_SECRET');
    return secret && secret.length >= 16 ? secret : undefined;
  },

  get google() {
    return {
      clientId: read('GOOGLE_CLIENT_ID') ?? read('NEXT_PUBLIC_GOOGLE_CLIENT_ID'),
    };
  },

  get email() {
    const apiKey = read('BREVO_API_KEY');
    const explicit = read('EMAIL_PROVIDER');
    return {
      /** 'brevo' sends real mail; 'console' logs and records the message without sending. */
      provider: (explicit === 'console' || explicit === 'brevo' ? explicit : apiKey ? 'brevo' : 'console') as
        | 'brevo'
        | 'console',
      brevoApiKey: apiKey,
      senderEmail: read('SENDER_EMAIL') ?? read('EMAIL_FROM') ?? 'notifications@jobpingly.com',
      senderName: read('SENDER_NAME') ?? 'JobPingly',
      /** Shared secret that Brevo must present on delivery webhooks. */
      webhookSecret: read('BREVO_WEBHOOK_SECRET'),
      dailyLimit: readInt('BREVO_DAILY_LIMIT', 300, 1),
      safetyBuffer: readInt('BREVO_SAFETY_BUFFER', 50, 0),
    };
  },

  get ai() {
    return {
      ollamaApiKey: read('OLLAMA_API_KEY'),
      ollamaModel: read('OLLAMA_MODEL') ?? 'gemma4:31b',
      ollamaBaseUrl: (read('OLLAMA_BASE_URL') ?? 'https://api.ollama.com').replace(/\/+$/, ''),
      groqApiKey: read('GROQ_API_KEY'),
      groqModel: read('GROQ_MODEL') ?? 'llama-3.3-70b-versatile',
      openaiApiKey: read('OPENAI_API_KEY'),
      openaiModel: read('OPENAI_MODEL') ?? 'gpt-4o-mini',
      get configured(): boolean {
        return Boolean(read('OLLAMA_API_KEY') || read('GROQ_API_KEY') || read('OPENAI_API_KEY'));
      },
    };
  },

  get redis() {
    return {
      url: read('UPSTASH_REDIS_REST_URL'),
      token: read('UPSTASH_REDIS_REST_TOKEN'),
    };
  },

  get worker() {
    return {
      id: read('WORKER_ID') ?? 'default',
      /** 'separate' (own process), 'inline' (inside the web server), 'off' */
      mode: (read('WORKER_MODE') ?? 'separate') as 'separate' | 'inline' | 'off',
      pollIntervalMs: readInt('WORKER_POLL_INTERVAL_MS', 60_000, 5_000, 3_600_000),
      concurrency: readInt('WORKER_CONCURRENCY', 4, 1, 16),
      batchSize: readInt('WORKER_BATCH_SIZE', 20, 1, 200),
    };
  },

  get network() {
    return {
      /**
       * Header that carries the real client IP. Render sits behind Cloudflare,
       * which sets CF-Connecting-IP and overwrites any client-supplied value.
       */
      clientIpHeader: read('CLIENT_IP_HEADER')?.toLowerCase(),
      /** Number of trusted proxies appending to X-Forwarded-For. */
      trustedProxyHops: readInt('TRUSTED_PROXY_HOPS', 1, 0, 5),
    };
  },

  get dbPoolMax(): number {
    return readInt('DB_POOL_MAX', env.isProduction ? 10 : 5, 1, 50);
  },
};

/**
 * Called once at server start. Throws when production configuration is unsafe
 * and returns human-readable warnings for anything optional that is missing.
 */
export function assertRuntimeConfig(): string[] {
  const warnings: string[] = [];
  // Touching these getters throws ConfigError in production when invalid.
  void env.databaseUrl;
  void env.appSecret;

  if (env.isProduction) {
    if (!read('NEXT_PUBLIC_APP_URL') && !read('APP_URL')) {
      warnings.push('NEXT_PUBLIC_APP_URL is not set; links in emails fall back to the platform URL.');
    }
    if (env.email.provider === 'console') {
      warnings.push('BREVO_API_KEY is not set; emails are logged but not delivered.');
    }
    if (!env.cronSecret) {
      warnings.push('CRON_SECRET is not set; /api/cron/* endpoints are disabled.');
    }
    if (!env.adminBootstrapEmail) {
      warnings.push('ADMIN_BOOTSTRAP_EMAIL is not set; no account is automatically granted the owner role.');
    }
  }
  return warnings;
}
