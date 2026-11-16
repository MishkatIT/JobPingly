import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/client';
import { notifications } from '@/lib/db/schema';
import type { NotificationType } from '@/lib/constants';

/**
 * In-app notification centre.
 *
 * `dedupeKey` makes creation idempotent: the same event (for example "source X
 * started failing today") can be reported by several code paths or retried
 * without the user seeing it twice.
 */

export interface NewNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  data?: Record<string, unknown> | null;
  dedupeKey?: string | null;
}

export async function createNotifications(items: NewNotification[], executor: DbOrTx = db): Promise<number> {
  if (items.length === 0) return 0;
  let created = 0;
  for (let index = 0; index < items.length; index += 500) {
    const rows = await executor
      .insert(notifications)
      .values(
        items.slice(index, index + 500).map(item => ({
          userId: item.userId,
          type: item.type,
          title: item.title.slice(0, 200),
          body: item.body?.slice(0, 500) ?? null,
          link: item.link ?? null,
          data: item.data ?? null,
          dedupeKey: item.dedupeKey ?? null,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    created += rows.length;
  }
  return created;
}

export async function listNotifications(userId: string, options: { limit: number; offset: number; unreadOnly?: boolean }) {
  const where = and(eq(notifications.userId, userId), options.unreadOnly ? isNull(notifications.readAt) : undefined);
  const [items, [counts]] = await Promise.all([
    db
      .select({
        id: notifications.id,
        type: notifications.type,
        title: notifications.title,
        body: notifications.body,
        link: notifications.link,
        data: notifications.data,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(options.limit)
      .offset(options.offset),
    db
      .select({
        total: sql<number>`count(*)::int`,
        unread: sql<number>`count(*) FILTER (WHERE ${notifications.readAt} IS NULL)::int`,
      })
      .from(notifications)
      .where(eq(notifications.userId, userId)),
  ]);
  return { items, total: counts?.total ?? 0, unread: counts?.unread ?? 0 };
}

export async function countUnread(userId: string): Promise<number> {
  const [row] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.unread ?? 0;
}

export async function markRead(userId: string, ids: string[] | 'all'): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        ids === 'all' ? undefined : inArray(notifications.id, ids),
      ),
    )
    .returning({ id: notifications.id });
  return rows.length;
}

export async function deleteNotification(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.id, id)))
    .returning({ id: notifications.id });
  return rows.length > 0;
}

/** Housekeeping: read notifications older than the retention window are removed. */
export async function pruneNotifications(olderThanDays = 60): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const rows = await db.delete(notifications).where(lt(notifications.createdAt, cutoff)).returning({ id: notifications.id });
  return rows.length;
}
