import { z } from 'zod';
import { route, searchString } from '@/lib/api/route';
import { companiesForUser } from '@/lib/companies/service';

const query = z.object({
  q: searchString,
  health: z.enum(['all', 'issues', 'active', 'degraded', 'broken', 'paused', 'pending']).default('all'),
  list: z.uuid().optional(),
});

/** Every company on the user's watchlists, with monitoring health. */
export const GET = route({ query }, async ({ user, query }) => companiesForUser(user.id, { q: query.q, health: query.health, listId: query.list }));
