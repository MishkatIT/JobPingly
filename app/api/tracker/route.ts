import { z } from 'zod';
import { created, route } from '@/lib/api/route';
import { TRACKER_STATUSES } from '@/lib/constants';
import { addExternalJob, trackerForUser } from '@/lib/jobs/tracker';

export const GET = route({}, async ({ user }) => trackerForUser(user.id));

const body = z.object({
  title: z.string().trim().min(1, 'Enter the job title.').max(200),
  companyName: z.string().trim().min(1, 'Enter the company.').max(120),
  url: z.string().max(2000).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  status: z.enum(TRACKER_STATUSES).optional(),
  notes: z.string().max(5000).nullable().optional(),
});

/** Adds a job you found elsewhere to your tracker. */
export const POST = route({ body, rateLimit: { name: 'tracker:add', limit: 120, windowSeconds: 3600, by: 'user' } }, async ({ user, body }) =>
  created(await addExternalJob(user.id, body)),
);
