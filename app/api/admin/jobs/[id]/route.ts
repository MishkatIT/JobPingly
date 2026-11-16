import { errors } from '@/lib/api/errors';
import { idParams, route } from '@/lib/api/route';
import { jobDetailAdmin } from '@/lib/admin/jobs';

export const GET = route({ permission: 'jobs.read', params: idParams }, async ({ params }) => {
  const detail = await jobDetailAdmin(params.id);
  if (!detail) throw errors.notFound('Job');
  return detail;
});
