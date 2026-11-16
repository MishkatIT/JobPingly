import { z } from 'zod';
import { errors } from '@/lib/api/errors';
import { idParams, route } from '@/lib/api/route';
import { actorOf } from '@/lib/audit';
import { adapterOptions, deleteSources, setSourcePaused, sourceDetail, updateSource } from '@/lib/admin/sources';

export const GET = route({ permission: 'sources.read', params: idParams }, async ({ params }) => {
  const detail = await sourceDetail(params.id);
  if (!detail) throw errors.notFound('Source');
  return { ...detail, adapters: adapterOptions() };
});

const body = z.object({
  companyName: z.string().max(120).nullable().optional(),
  url: z.string().max(2048).optional(),
  websiteUrl: z.string().max(2048).nullable().optional(),
  logoUrl: z.string().max(2048).nullable().optional(),
  industry: z.string().max(80).nullable().optional(),
  hqLocation: z.string().max(120).nullable().optional(),
  checkIntervalMinutes: z.number().int().min(15).max(10080).optional(),
  priority: z.number().int().min(-10).max(100).optional(),
  adapterOverride: z.string().max(40).nullable().optional(),
  paused: z.boolean().optional(),
  pausedReason: z.string().max(200).optional(),
});

export const PATCH = route({ permission: 'sources.manage', params: idParams, body }, async ({ req, user, params, body }) => {
  const actor = actorOf(user);
  const { paused, pausedReason, ...patch } = body;
  if (paused !== undefined) await setSourcePaused(actor, [params.id], paused, pausedReason ?? null, req);
  return updateSource(actor, params.id, patch, req);
});

export const DELETE = route({ permission: 'sources.delete', params: idParams }, async ({ req, user, params }) => {
  const deleted = await deleteSources(actorOf(user), [params.id], req);
  if (deleted === 0) throw errors.notFound('Source');
  return { deleted: true };
});
