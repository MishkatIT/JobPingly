/**
 * Configuration check run by `npm start` before anything touches the
 * database. A deploy with a missing or placeholder secret fails here, so it
 * can never migrate the production database and then fail to start.
 *
 *   npx tsx scripts/preflight.ts      exit 0 = ready (warnings are printed), 1 = not ready
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function main() {
  const { assertRuntimeConfig } = await import('../lib/env');
  try {
    const warnings = assertRuntimeConfig();
    for (const warning of warnings) console.warn(`[config] ${warning}`);
    console.log('[config] Required configuration is present.');
  } catch (error) {
    console.error(`[config] ${(error as Error).message}`);
    process.exit(1);
  }
}

void main();
