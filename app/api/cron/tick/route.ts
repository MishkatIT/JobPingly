import { NextResponse, type NextRequest } from 'next/server';
import { safeEqual } from '@/lib/auth/tokens';
import { env } from '@/lib/env';
import { runCycle } from '@/lib/monitoring/scheduler';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Runs one bounded worker cycle. Lets an external scheduler (cron-job.org,
 * GitHub Actions, a platform cron) drive monitoring when the service has no
 * always-on worker, for example on a free instance that sleeps when idle;
 * the request also wakes the service.
 *
 *   curl -X POST https://<host>/api/cron/tick -H "Authorization: Bearer $CRON_SECRET"
 *
 * Disabled (404) unless CRON_SECRET is set.
 */
async function handle(req: NextRequest) {
  const secret = env.cronSecret;
  if (!secret) return new NextResponse(null, { status: 404 });

  const header = req.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!presented || !safeEqual(presented, secret)) {
    return NextResponse.json({ error: { code: 'unauthorized', message: 'Invalid cron secret.' } }, { status: 401 });
  }

  const report = await runCycle({ mode: 'cron', workerId: `${env.worker.id}-cron`, budgetMs: 45_000, maxTasks: 25 });
  return NextResponse.json({ data: report }, { status: report.error && report.claimed === 0 ? 409 : 200, headers: { 'Cache-Control': 'no-store' } });
}

export const POST = handle;
export const GET = handle;
