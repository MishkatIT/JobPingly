/**
 * Applies pending SQL migrations.
 *
 *   npm run db:migrate            apply pending migrations
 *   npm run db:migrate -- --dry   list what would be applied
 *
 * Reads DATABASE_URL from the environment (the same .env files Next.js uses).
 * For Supabase, point this at the direct or session-mode connection (port
 * 5432), not the transaction pooler: migrations need a real session.
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function main() {
  const { runMigrations } = await import('../lib/db/migrate');
  const databaseUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry') || process.argv.includes('--dry-run');
  const target = new URL(databaseUrl);
  console.log(`[migrate] Target: ${target.hostname}:${target.port || '5432'}${target.pathname}${dryRun ? ' (dry run)' : ''}`);

  const result = await runMigrations({ databaseUrl, dryRun, log: message => console.log(`[migrate] ${message}`) });

  if (result.applied.length === 0) {
    console.log('[migrate] Database is up to date.');
  } else {
    console.log(`[migrate] ${dryRun ? 'Pending' : 'Applied'}: ${result.applied.join(', ')}`);
  }
}

main().catch(error => {
  console.error('[migrate] Failed:', error.message);
  if (error.position || error.where) console.error(error.where || `at position ${error.position}`);
  process.exit(1);
});
