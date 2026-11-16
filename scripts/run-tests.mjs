#!/usr/bin/env node
/**
 * Test runner.
 *
 *   npm test                     unit + integration
 *   npm run test:unit            unit tests only (no database needed)
 *   npm run test:integration     integration tests only
 *
 * Integration tests need a disposable PostgreSQL database whose name ends in
 * "_test". Point DATABASE_URL at it in `.env.test.local` (or the environment).
 * The database is wiped and migrated from scratch before the run. As a
 * safeguard the runner refuses any database not named *_test.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nextEnv from '@next/env';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.NODE_ENV = 'test';
nextEnv.loadEnvConfig(root, false);

const which = process.argv[2] ?? 'all';
const list = dir =>
  fs.existsSync(path.join(root, dir))
    ? fs
        .readdirSync(path.join(root, dir))
        .filter(name => name.endsWith('.test.ts'))
        .sort()
        .map(name => path.join(dir, name))
    : [];

function run(files, label) {
  if (files.length === 0) return 0;
  console.log(`\n=== ${label} (${files.length} files) ===`);
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--test', '--test-concurrency=1', '--test-reporter=spec', ...files],
    { cwd: root, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' } },
  );
  return result.status ?? 1;
}

let failed = 0;

if (which === 'all' || which === 'unit') {
  failed += run(list('tests/unit'), 'Unit tests');
}

if (which === 'all' || which === 'integration') {
  const url = process.env.DATABASE_URL;
  let databaseName = '';
  try {
    databaseName = url ? new URL(url).pathname.replace(/^\//, '') : '';
  } catch {
    databaseName = '';
  }
  if (!databaseName.endsWith('_test')) {
    console.log(
      `\nSkipping integration tests: DATABASE_URL must point at a database whose name ends in "_test" (got "${databaseName || 'none'}").` +
        '\nCreate one and set it in .env.test.local, e.g. DATABASE_URL="postgresql://postgres:postgres@localhost:5432/jobpingly_test".',
    );
    if (which === 'integration') failed += 1;
  } else {
    const setup = spawnSync(process.execPath, ['--import', 'tsx', 'tests/helpers/setup-db.ts'], { cwd: root, stdio: 'inherit', env: process.env });
    if (setup.status !== 0) {
      console.error('Could not prepare the test database.');
      failed += 1;
    } else {
      failed += run(list('tests/integration'), `Integration tests (${databaseName})`);
    }
  }
}

process.exit(failed > 0 ? 1 : 0);
