import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '@/lib/env';

declare global {
  var __jpSql: postgres.Sql | undefined;
}

function createClient(): postgres.Sql {
  return postgres(env.databaseUrl, {
    max: env.dbPoolMax,
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
    // Required for Supabase's transaction pooler (PgBouncer, port 6543),
    // which cannot keep prepared statements across pooled connections.
    prepare: false,
    onnotice: () => {},
  });
}

// One pool per process. The global survives Next.js dev-server hot reloads,
// which would otherwise leak a new pool on every edit.
const client: postgres.Sql = globalThis.__jpSql ?? (globalThis.__jpSql = createClient());

export const db = drizzle(client, { schema });
export { client };
export type Database = typeof db;
/** The transaction handle passed to `db.transaction(async tx => ...)`. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DbOrTx = Database | Transaction;

/** Closes the pool. Called on graceful shutdown and at the end of scripts. */
export async function closeDb(timeoutSeconds = 5): Promise<void> {
  await client.end({ timeout: timeoutSeconds });
  globalThis.__jpSql = undefined;
}

/** Cheap connectivity probe for health checks. */
export async function pingDb(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const started = Date.now();
  try {
    await client`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - started, error: (error as Error).message };
  }
}
