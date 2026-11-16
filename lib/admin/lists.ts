import { and, eq, isNull } from 'drizzle-orm';
import { errors } from '@/lib/api/errors';
import { recordAudit, type AuditActor } from '@/lib/audit';
import { client, db } from '@/lib/db/client';
import { listSubscriptions, lists, notificationQueue } from '@/lib/db/schema';
import { deleteMatchesForList, recomputeMatchesForSubscription } from '@/lib/monitoring/matching';

export const LIST_STATE_FILTERS = ['active', 'trash', 'featured', 'public'] as const;

export async function listListsAdmin(options: { q?: string; state: (typeof LIST_STATE_FILTERS)[number]; page: number; pageSize: number }) {
  const pattern = options.q ? `%${options.q.replace(/[\\%_]/g, char => `\\${char}`)}%` : null;
  const state = {
    active: client`AND l.deleted_at IS NULL`,
    trash: client`AND l.deleted_at IS NOT NULL`,
    featured: client`AND l.deleted_at IS NULL AND l.featured_at IS NOT NULL`,
    public: client`AND l.deleted_at IS NULL AND l.visibility = 'public'`,
  }[options.state];
  const rows = await client<
    {
      id: string;
      name: string;
      slug: string;
      visibility: string;
      featuredAt: Date | null;
      deletedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      ownerId: string;
      ownerEmail: string;
      ownerName: string | null;
      companies: number;
      followers: number;
      total: number;
    }[]
  >`
    SELECT l.id, l.name, l.slug, l.visibility, l.featured_at AS "featuredAt", l.deleted_at AS "deletedAt",
      l.created_at AS "createdAt", l.updated_at AS "updatedAt", u.id AS "ownerId", u.email AS "ownerEmail", u.name AS "ownerName",
      (SELECT count(*) FROM list_career_pages x WHERE x.list_id = l.id)::int AS companies,
      l.follower_count AS followers,
      count(*) OVER()::int AS total
    FROM lists l JOIN users u ON u.id = l.user_id
    WHERE true ${state}
      ${pattern ? client`AND (l.name ILIKE ${pattern} OR u.email ILIKE ${pattern} OR l.slug ILIKE ${pattern})` : client``}
    ORDER BY ${options.state === 'trash' ? client`l.deleted_at DESC` : client`l.updated_at DESC`}
    LIMIT ${options.pageSize} OFFSET ${(options.page - 1) * options.pageSize}
  `;
  return { total: rows[0]?.total ?? 0, items: rows.map(({ total: _total, ...row }) => row) };
}

export type ListAdminAction = 'feature' | 'unfeature' | 'make_private' | 'trash' | 'restore';

export async function applyListAction(actor: AuditActor, listId: string, action: ListAdminAction, req: { headers: Headers }) {
  const [list] = await db.select().from(lists).where(eq(lists.id, listId));
  if (!list) throw errors.notFound('Watchlist');

  const now = new Date();
  switch (action) {
    case 'feature':
      if (list.visibility !== 'public' || list.deletedAt) throw errors.conflict('Only public, live watchlists can be featured.');
      await db.update(lists).set({ featuredAt: now }).where(eq(lists.id, listId));
      break;
    case 'unfeature':
      await db.update(lists).set({ featuredAt: null }).where(eq(lists.id, listId));
      break;
    case 'make_private':
      await db.update(lists).set({ visibility: 'private', featuredAt: null, updatedAt: now }).where(eq(lists.id, listId));
      break;
    case 'trash':
      if (list.deletedAt) break;
      await db.update(lists).set({ deletedAt: now, featuredAt: null, updatedAt: now }).where(eq(lists.id, listId));
      await deleteMatchesForList(listId);
      // Same as an owner deleting it: alerts already queued for this list are not sent.
      await db
        .update(notificationQueue)
        .set({ sentAt: now, lastError: 'Watchlist removed by an administrator before delivery' })
        .where(and(eq(notificationQueue.listId, listId), isNull(notificationQueue.sentAt)));
      break;
    case 'restore': {
      if (!list.deletedAt) break;
      await db.update(lists).set({ deletedAt: null, updatedAt: now }).where(eq(lists.id, listId));
      // Trashing removed every follower's matches; rebuild them so "Matching" is complete again.
      const subscribers = await db.select({ userId: listSubscriptions.userId }).from(listSubscriptions).where(eq(listSubscriptions.listId, listId));
      for (const subscriber of subscribers) await recomputeMatchesForSubscription(subscriber.userId, listId);
      break;
    }
  }

  const auditAction = action === 'trash' ? 'list.trash' : action === 'restore' ? 'list.restore' : 'list.update';
  await recordAudit({ action: auditAction, actor, targetType: 'list', targetId: listId, metadata: { name: list.name, change: action }, req });
  return { id: listId, action };
}

/** Permanent deletion is only possible from the trash, so it always takes two deliberate steps. */
export async function purgeList(actor: AuditActor, listId: string, req: { headers: Headers }) {
  const [list] = await db.select({ id: lists.id, name: lists.name, deletedAt: lists.deletedAt, userId: lists.userId }).from(lists).where(eq(lists.id, listId));
  if (!list) throw errors.notFound('Watchlist');
  if (!list.deletedAt) throw errors.conflict('Move the watchlist to the trash before deleting it permanently.');
  await recordAudit({ action: 'list.delete', actor, targetType: 'list', targetId: listId, metadata: { name: list.name, ownerId: list.userId }, req });
  await db.delete(lists).where(eq(lists.id, listId));
}
