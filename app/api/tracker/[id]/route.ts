import { z } from 'zod';
import { idParams, route } from '@/lib/api/route';
import { USER_JOB_STATUSES } from '@/lib/constants';
import { updateTrackerEntry } from '@/lib/jobs/tracker';

const body = z.object({
  status: z.enum(USER_JOB_STATUSES).optional(),
  notes: z.string().max(5000).nullable().optional(),
  appliedAt: z.string().max(40).nullable().optional(),
  reminderAt: z.string().max(40).nullable().optional(),
  title: z.string().max(200).optional(),
  companyName: z.string().max(120).optional(),
  url: z.string().max(2000).nullable().optional(),
});

export const PATCH = route({ params: idParams, body }, async ({ user, params, body }) => updateTrackerEntry(user.id, params.id, body));

export const DELETE = route({ params: idParams }, async ({ user, params }) => {
  await updateTrackerEntry(user.id, params.id, { status: null });
  return { deleted: true };
});
