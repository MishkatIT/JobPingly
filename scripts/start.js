const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const nextBin = require.resolve('next/dist/bin/next', { paths: [root] });
const tsxBin = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const children = [
  spawn(process.execPath, [nextBin, 'start'], { cwd: root, stdio: 'inherit' }),
  spawn(process.execPath, [tsxBin, 'worker/bootstrap.ts'], { cwd: root, stdio: 'inherit' }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill();
  }
  process.exitCode = exitCode;
}

for (const child of children) {
  child.on('error', error => {
    console.error('[JobPingly] Failed to start web server or worker:', error);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`[JobPingly] A required process exited (code=${code}, signal=${signal}). Stopping both.`);
      stop(code || 1);
    }
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stop(0));
}
