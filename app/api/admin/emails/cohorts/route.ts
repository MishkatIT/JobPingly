import { z } from 'zod';
import { route } from '@/lib/api/route';
import { actorOf } from '@/lib/audit';
import { rebalanceCohorts } from '@/lib/admin/emails';

const body = z.object({ cycleDays: z.number().int().min(1).max(30) });

/** Spreads recipients evenly across the digest staggering groups. */
export const POST = route({ permission: 'emails.manage', body }, async ({ req, user, body }) => rebalanceCohorts(actorOf(user), body.cycleDays, req));
