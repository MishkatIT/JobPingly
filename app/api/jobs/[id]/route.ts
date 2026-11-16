import { z } from 'zod';
import { errors } from '@/lib/api/errors';
import { idParams, route } from '@/lib/api/route';
import { USER_JOB_STATUSES } from '@/lib/constants';
import { jobDetailForUser } from '@/lib/jobs/queries';
import { setJobState } from '@/lib/jobs/tracker';

export const GET = route({ params: idParams }, async ({ user, params }) => {
  const detail = await jobDetailForUser(user.id, params.id);
  if (!detail) throw errors.notFound('Job');
  return detail;
});

const body = z.object({
  /** null removes the job from your tracker (and un-dismisses it). */
  status: z.enum(USER_JOB_STATUSES).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  appliedAt: z.string().max(40).nullable().optional(),
  reminderAt: z.string().max(40).nullable().optional(),
});

/** Saves, dismisses or tracks the job for the signed-in user. */
export const PUT = route({ params: idParams, body }, async ({ user, params, body }) => {
  const entry = await setJobState(user.id, params.id, body);
  return { tracking: entry ? { id: entry.id, status: entry.status, notes: entry.notes, appliedAt: entry.appliedAt, reminderAt: entry.reminderAt } : null };
});
