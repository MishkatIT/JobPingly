import { loadEnvConfig } from '@next/env';

// Load the same .env files as Next.js when the worker is run as a separate process.
loadEnvConfig(process.cwd());

import('./scheduler').then(({ startScheduler }) => startScheduler());
