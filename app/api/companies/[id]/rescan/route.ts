import { idParams, route } from '@/lib/api/route';
import { requestRescan } from '@/lib/companies/service';

/** Queues a fresh scan of a company on a watchlist the user can edit. */
export const POST = route(
  { params: idParams, rateLimit: { name: 'companies:rescan', limit: 30, windowSeconds: 3600, by: 'user' } },
  async ({ user, params }) => requestRescan(user.id, params.id),
);
