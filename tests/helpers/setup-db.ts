/**
 * Wipes the test database and applies every migration from scratch, so the
 * integration suite always runs against exactly the schema production gets.
 */
import postgres from 'postgres';
import { runMigrations } from '../../lib/db/migrate';

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) throw new Error(`Refusing to reset "${name}": not a *_test database.`);

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await sql.end();

  const result = await runMigrations({ databaseUrl: url });
  console.log(`Test database ready (${result.applied.length} migrations applied).`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
