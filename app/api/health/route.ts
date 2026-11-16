import { NextResponse } from 'next/server';
import { pingDb } from '@/lib/db/client';
import { getWorkerHealth } from '@/lib/monitoring/scheduler';

export const dynamic = 'force-dynamic';

/**
 * Liveness and readiness for uptime monitors and the hosting platform.
 *
 *   200 {"status":"ok"}        database reachable, a worker reported recently
 *   200 {"status":"degraded"}  database reachable, no recent worker heartbeat
 *   503 {"status":"down"}      database unreachable
 *
 * Deliberately reveals nothing about configuration or internal hosts.
 */
export async function GET() {
  const database = await pingDb();
  let worker: { ok: boolean; secondsSinceHeartbeat: number | null } = { ok: false, secondsSinceHeartbeat: null };

  if (database.ok) {
    try {
      const workers = await getWorkerHealth();
      const freshest = workers.sort((a, b) => (a.secondsSinceHeartbeat ?? Infinity) - (b.secondsSinceHeartbeat ?? Infinity))[0];
      worker = { ok: Boolean(freshest?.alive), secondsSinceHeartbeat: freshest?.secondsSinceHeartbeat ?? null };
    } catch {
      worker = { ok: false, secondsSinceHeartbeat: null };
    }
  }

  const status = !database.ok ? 'down' : worker.ok ? 'ok' : 'degraded';
  return NextResponse.json(
    {
      status,
      checks: {
        database: { ok: database.ok, latencyMs: database.latencyMs },
        worker,
      },
      time: new Date().toISOString(),
    },
    { status: status === 'down' ? 503 : 200, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function HEAD() {
  const database = await pingDb();
  return new NextResponse(null, { status: database.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
