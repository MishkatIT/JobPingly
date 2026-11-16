/**
 * Runs once when the Next.js server starts. Node.js-only work lives in
 * instrumentation-node.ts so it is never compiled for the Edge runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
