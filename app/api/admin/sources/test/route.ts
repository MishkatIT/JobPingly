import { z } from 'zod';
import { route } from '@/lib/api/route';
import { testExtraction } from '@/lib/admin/sources';

const body = z.object({
  url: z.string().trim().min(1).max(2048),
  adapter: z.string().max(40).nullable().optional(),
});

/** Dry-runs extraction for a URL, optionally forcing an adapter. Nothing is stored. */
export const POST = route(
  { permission: 'sources.manage', body, rateLimit: { name: 'admin:test-source', limit: 30, windowSeconds: 600, by: 'user' } },
  async ({ body }) => testExtraction(body.url, body.adapter),
);
