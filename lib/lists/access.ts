import { and, eq, isNull } from 'drizzle-orm';
import { client, db } from '@/lib/db/client';
import { listCollaborators, listSubscriptions, lists, type List } from '@/lib/db/schema';

/**
 * Who may do what with a watchlist. Every list endpoint resolves access
 * through here; nothing is decided on the client.
 *
 *              view  companies  details  visibility  members  suggestions  delete
 *   owner       yes     yes        yes       yes        yes        yes        yes
 *   moderator   yes     yes        yes        -          -         yes         -
 *   editor      yes     yes         -         -          -          -          -
 *   viewer      public lists only (read)
 *
 * A private list the user cannot access resolves to `null`, which routes
 * turn into 404 so the list's existence is not revealed.
 */

export type ListRole = 'owner' | 'moderator' | 'editor' | 'viewer';

export interface ListAccess {
  list: List;
  role: ListRole;
  isFollowing: boolean;
  canEditCompanies: boolean;
  canEditDetails: boolean;
  canChangeVisibility: boolean;
  canManageMembers: boolean;
  canReviewSuggestions: boolean;
  canDelete: boolean;
}

export function permissionsForRole(role: ListRole) {
  return {
    canEditCompanies: role === 'owner' || role === 'moderator' || role === 'editor',
    canEditDetails: role === 'owner' || role === 'moderator',
    canChangeVisibility: role === 'owner',
    canManageMembers: role === 'owner',
    canReviewSuggestions: role === 'owner' || role === 'moderator',
    canDelete: role === 'owner',
  };
}

export async function loadListAccess(listId: string, userId: string | null): Promise<ListAccess | null> {
  if (!/^[0-9a-f-]{36}$/i.test(listId)) return null;
  const [list] = await db.select().from(lists).where(and(eq(lists.id, listId), isNull(lists.deletedAt)));
  if (!list) return null;
  return resolveAccess(list, userId);
}

export async function loadListAccessBySlug(slug: string, userId: string | null): Promise<ListAccess | null> {
  const [list] = await db.select().from(lists).where(and(eq(lists.slug, slug), isNull(lists.deletedAt)));
  if (!list) return null;
  return resolveAccess(list, userId);
}

async function resolveAccess(list: List, userId: string | null): Promise<ListAccess | null> {
  let role: ListRole | null = null;
  let isFollowing = false;

  if (userId) {
    if (list.userId === userId) {
      role = 'owner';
    } else {
      const [membership] = await db
        .select({ role: listCollaborators.role })
        .from(listCollaborators)
        .where(and(eq(listCollaborators.listId, list.id), eq(listCollaborators.userId, userId), eq(listCollaborators.status, 'accepted')));
      if (membership) role = membership.role === 'moderator' ? 'moderator' : 'editor';
    }
    const [subscription] = await db
      .select({ id: listSubscriptions.id })
      .from(listSubscriptions)
      .where(and(eq(listSubscriptions.listId, list.id), eq(listSubscriptions.userId, userId)));
    isFollowing = Boolean(subscription);
  }

  if (!role && list.visibility === 'public') role = 'viewer';
  if (!role) return null;

  return { list, role, isFollowing, ...permissionsForRole(role) };
}

/**
 * SQL fragment selecting the ids of every live list whose jobs a user sees:
 * lists they own, lists they collaborate on, and public lists they follow.
 */
export function visibleListIdsSql(userId: string) {
  return client`
    SELECT l.id FROM lists l
    WHERE l.deleted_at IS NULL AND (
      l.user_id = ${userId}
      OR EXISTS (
        SELECT 1 FROM list_collaborators c
        WHERE c.list_id = l.id AND c.user_id = ${userId} AND c.status = 'accepted'
      )
      OR (
        l.visibility = 'public'
        AND EXISTS (SELECT 1 FROM list_subscriptions s WHERE s.list_id = l.id AND s.user_id = ${userId})
      )
    )
  `;
}

/** SQL fragment selecting the ids of every active (unpaused) source on the user's visible lists. */
export function visibleSourceIdsSql(userId: string, listId?: string | null) {
  const listFilter = listId
    ? client`lcp.list_id = ${listId}::uuid AND lcp.list_id IN (${visibleListIdsSql(userId)})`
    : client`lcp.list_id IN (${visibleListIdsSql(userId)})`;
  return client`
    SELECT DISTINCT lcp.career_page_id FROM list_career_pages lcp
    WHERE ${listFilter} AND lcp.is_paused = false
  `;
}

/** Like loadListAccess, but a missing or hidden list becomes a 404. */
export async function requireListAccess(listId: string, userId: string | null): Promise<ListAccess> {
  const access = await loadListAccess(listId, userId);
  if (!access) {
    const { errors } = await import('@/lib/api/errors');
    throw errors.notFound('Watchlist');
  }
  return access;
}
