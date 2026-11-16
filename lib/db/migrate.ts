import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import postgres from 'postgres';

/**
 * Minimal, dependency-free SQL migration runner.
 *
 * - Applies every `drizzle/NNNN_*.sql` file in filename order.
 * - Records each applied file in `schema_migrations` with a checksum.
 * - Runs each file inside its own transaction, so a failing migration leaves
 *   the database exactly as it was.
 * - Takes a transaction-scoped advisory lock, so two deploys cannot apply the
 *   same migration at once. (Transaction-scoped rather than session-scoped so
 *   that it also behaves correctly behind a transaction-mode connection
 *   pooler such as Supabase's port 6543.)
 *
 * The files in drizzle/legacy are never executed. Databases created before
 * this runner existed were managed with `drizzle-kit push`, so the first
 * migration here (0003) is idempotent and reconciles whatever it finds.
 */

const ADVISORY_LOCK_KEY = 874_512_003;

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export interface MigrateOptions {
  databaseUrl: string;
  directory?: string;
  /** When true, report what would run without executing anything. */
  dryRun?: boolean;
  log?: (message: string) => void;
}

function checksum(content: string): string {
  return crypto.createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex');
}

export function listMigrationFiles(directory: string): string[] {
  return fs
    .readdirSync(directory)
    .filter(name => /^\d{4}_.+\.sql$/.test(name))
    .sort();
}

export async function runMigrations(options: MigrateOptions): Promise<MigrationResult> {
  const directory = options.directory ?? path.join(process.cwd(), 'drizzle');
  const log = options.log ?? (() => {});
  const files = listMigrationFiles(directory);
  const result: MigrationResult = { applied: [], skipped: [] };

  // A single dedicated connection: advisory locks and transactions are
  // session-scoped, so this must not go through a pool.
  const sql = postgres(options.databaseUrl, { max: 1, prepare: false, onnotice: () => {} });

  try {
    const [{ exists: trackingExists }] = await sql<{ exists: boolean }[]>`
      SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists
    `;

    if (!options.dryRun) {
      await sql`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          name text PRIMARY KEY,
          checksum text NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT now(),
          execution_ms integer
        )
      `;
    }

    const appliedRows = trackingExists || !options.dryRun
      ? await sql<{ name: string; checksum: string }[]>`SELECT name, checksum FROM schema_migrations`
      : [];
    const applied = new Map(appliedRows.map(row => [row.name, row.checksum]));

    for (const name of files) {
      const content = fs.readFileSync(path.join(directory, name), 'utf8');
      const sum = checksum(content);

      if (applied.has(name)) {
        if (applied.get(name) !== sum) {
          log(`WARNING: ${name} has changed since it was applied. Applied migrations must not be edited; add a new one.`);
        }
        result.skipped.push(name);
        continue;
      }

      if (options.dryRun) {
        log(`Would apply ${name}`);
        result.applied.push(name);
        continue;
      }

      const started = Date.now();
      log(`Applying ${name} ...`);
      let alreadyApplied = false;
      await sql.begin(async tx => {
        await tx`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})`;
        // Another process may have applied it while we waited for the lock.
        const existing = await tx`SELECT 1 FROM schema_migrations WHERE name = ${name}`;
        if (existing.length > 0) {
          alreadyApplied = true;
          return;
        }
        // No parameters, so this is sent with the simple query protocol and
        // may contain any number of statements.
        await tx.unsafe(content);
        await tx`
          INSERT INTO schema_migrations (name, checksum, execution_ms)
          VALUES (${name}, ${sum}, ${Date.now() - started})
        `;
      });
      if (alreadyApplied) {
        result.skipped.push(name);
        continue;
      }
      log(`Applied ${name} in ${Date.now() - started}ms`);
      result.applied.push(name);
    }

    return result;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
