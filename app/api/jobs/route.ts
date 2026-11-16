import { z } from 'zod';
import { pageQuery, paginated, route, searchString } from '@/lib/api/route';
import { EMPLOYMENT_TYPES, SENIORITY_LEVELS, WORKPLACE_TYPES } from '@/lib/constants';
import { FEED_SORTS, FEED_VIEWS, feedCounts, feedForUser } from '@/lib/jobs/queries';

/** Comma-separated multi-select values from the query string, restricted to known options. */
function multi<T extends readonly string[]>(options: T) {
  return z
    .string()
    .optional()
    .transform(value =>
      (value ?? '')
        .split(',')
        .map(item => item.trim())
        .filter((item): item is T[number] => (options as readonly string[]).includes(item)),
    );
}

const query = pageQuery.extend({
  view: z.enum(FEED_VIEWS).default('matching'),
  q: searchString,
  list: z.uuid().optional(),
  company: z.uuid().optional(),
  workplace: multi(WORKPLACE_TYPES),
  employment: multi(EMPLOYMENT_TYPES),
  seniority: multi(SENIORITY_LEVELS),
  posted: z.coerce.number().int().min(1).max(365).optional(),
  sort: z.enum(FEED_SORTS).default('newest'),
  counts: z.enum(['0', '1']).optional(),
});

/** The job feed: jobs at every company on the user's watchlists, filtered and paginated. */
export const GET = route({ query }, async ({ user, query }) => {
  const [result, counts] = await Promise.all([
    feedForUser(user.id, {
      view: query.view,
      q: query.q,
      listId: query.list,
      companyId: query.company,
      workplace: query.workplace,
      employment: query.employment,
      seniority: query.seniority,
      postedWithinDays: query.posted,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
    }),
    query.counts === '1' ? feedCounts(user.id, query.list) : Promise.resolve(undefined),
  ]);
  return paginated(result.items, { page: query.page, pageSize: query.pageSize, total: result.total }, counts ? { counts } : undefined);
});
