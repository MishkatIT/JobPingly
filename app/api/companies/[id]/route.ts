import { errors } from '@/lib/api/errors';
import { idParams, route } from '@/lib/api/route';
import { companyDetailForUser } from '@/lib/companies/service';

export const GET = route({ auth: 'optional', params: idParams }, async ({ user, params }) => {
  const detail = await companyDetailForUser(user?.id ?? null, params.id);
  if (!detail) throw errors.notFound('Company');
  return detail;
});
