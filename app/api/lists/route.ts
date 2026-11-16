import { z } from 'zod';
import { created, route } from '@/lib/api/route';
import { createList, watchlistsForUser } from '@/lib/lists/service';

/** Every watchlist the user owns, helps maintain, or follows. */
export const GET = route({}, async ({ user }) => watchlistsForUser(user.id));

const body = z.object({
  name: z.string().trim().min(1, 'Give the watchlist a name.').max(80),
  description: z.string().max(300).nullable().optional(),
  visibility: z.enum(['private', 'public']).default('private'),
  tags: z.array(z.string().max(30)).max(8).optional(),
});

export const POST = route(
  { body, rateLimit: { name: 'lists:create', limit: 30, windowSeconds: 3600, by: 'user' } },
  async ({ user, body }) => {
    const list = await createList(user, body);
    return created({ id: list.id, slug: list.slug, name: list.name });
  },
);
