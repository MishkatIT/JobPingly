/**
 * Production entry point (`npm start`).
 *
 * Runs pending database migrations, then starts the web server and, depending
 * on WORKER_MODE, the background worker:
 *
 *   separate (default)  web server and worker as two child processes
 *   inline              worker runs inside the web server (see instrumentation.ts);
 *                       saves roughly one Node.js process of memory
 *   off                 web server only (run the worker elsewhere, or drive it
 *                       with `npm run worker:once` / POST /api/cron/tick)
 *
 * SIGTERM/SIGINT are forwarded to the children, which shut down gracefully.
 * If either child exits unexpectedly the other is stopped too, so the
 * platform restarts the whole service instead of leaving it half-running.
 */
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const nextBin = require.resolve('next/dist/bin/next', { paths: [root] });
const tsxBin = require.resolve('tsx/cli', { paths: [root] });
const mode = (process.env.WORKER_MODE || 'separate').toLowerCase();

if (process.env.SKIP_MIGRATIONS !== 'true') {
  console.log('[start] Applying database migrations...');
  const migrate = spawnSync(process.execPath, [tsxBin, 'scripts/migrate.ts'], { cwd: root, stdio: 'inherit', env: process.env });
  if (migrate.status !== 0) {
    console.error('[start] Migrations failed. Refusing to start with an out-of-date schema.');
    process.exit(migrate.status || 1);
  }
}

const children = [];
function launch(name, args) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env: process.env });
  child.jobName = name;
  children.push(child);
  return child;
}

launch('web', [nextBin, 'start']);
if (mode === 'separate') launch('worker', [tsxBin, 'worker/main.ts']);
console.log(`[start] Web server started. Worker mode: ${mode}.`);

let stopping = false;
function stop(exitCode, signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill(signal);
  }
  // Give children time to finish in-flight work, then exit regardless.
  setTimeout(() => process.exit(exitCode), 28_000).unref();
  let remaining = children.filter(child => child.exitCode === null).length;
  if (remaining === 0) process.exit(exitCode);
  for (const child of children) {
    child.once('exit', () => {
      remaining -= 1;
      if (remaining <= 0) process.exit(exitCode);
    });
  }
}

for (const child of children) {
  child.on('error', error => {
    console.error(`[start] Could not start ${child.jobName}:`, error);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`[start] ${child.jobName} exited unexpectedly (code=${code}, signal=${signal}). Stopping the service.`);
      stop(code || 1);
    }
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stop(0, signal));
}
