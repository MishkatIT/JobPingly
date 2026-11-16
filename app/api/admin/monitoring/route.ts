import { z } from 'zod';
import { route } from '@/lib/api/route';
import { actorOf } from '@/lib/audit';
import { applyMonitoringAction, monitoringOverview } from '@/lib/admin/operations';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = route({ permission: 'workers.read' }, async () => monitoringOverview());

const body = z.object({ action: z.enum(['run_cycle', 'pause', 'resume', 'cancel_queued', 'recover']) });

export const POST = route(
  { permission: 'workers.manage', body, rateLimit: { name: 'admin:monitoring', limit: 20, windowSeconds: 300, by: 'user' } },
  async ({ req, user, body }) => applyMonitoringAction(actorOf(user), body.action, req),
);
