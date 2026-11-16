import { and, eq, gt, sql } from 'drizzle-orm';
import { errors } from '@/lib/api/errors';
import { db } from '@/lib/db/client';
import { listCollaborators, listContributions, lists, users } from '@/lib/db/schema';
import { addCompanyToList } from '@/lib/companies/service';
import { sendEmail } from '@/lib/email/send';
import { inviteEmail } from '@/lib/email/templates';
import { env } from '@/lib/env';
import { createNotifications } from '@/lib/notifications/inapp';
import { rateLimit } from '@/lib/security/rateLimit';
import { cleanText } from '@/lib/security/html';
import { checkUrlSyntax } from '@/lib/security/ssrf';
import { getSetting } from '@/lib/settings/store';
import { loadListAccess, type ListAccess } from './access';

/** Invitations stop working after this long. */
export const INVITE_TTL_DAYS = 14;

function inviteExpired(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() > INVITE_TTL_DAYS * 86_400_000;
}

/**
 * Invites a registered user to help maintain a list. The response is the
 * same whether or not the address belongs to an account, so the form cannot
 * be used to discover who uses JobPingly.
 */
export async function inviteMember(access: ListAccess, inviter: { id: string; name: string | null; email: string }, rawEmail: string, role: 'editor' | 'moderator') {
  if (!access.canManageMembers) throw errors.forbidden('Only the owner can invite people to this watchlist.');
  const limit = await rateLimit({ key: `invite:${inviter.id}`, limit: 20, windowSeconds: 86_400, distributed: true });
  if (!limit.allowed) throw errors.tooManyRequests(limit.retryAfterSeconds, 'You have sent a lot of invitations today. Try again tomorrow.');

  const email = rawEmail.trim().toLowerCase();
  if (email === inviter.email.toLowerCase()) throw errors.validation([{ field: 'email', message: 'You already own this watchlist.' }]);

  const [invitee] = await db.select({ id: users.id, isBlocked: users.isBlocked, emailVerified: users.emailVerified }).from(users).where(eq(users.email, email));
  if (!invitee || invitee.isBlocked || !invitee.emailVerified) return { sent: true };

  const [row] = await db
    .insert(listCollaborators)
    .values({ listId: access.list.id, userId: invitee.id, role, status: 'pending', invitedBy: inviter.id })
    .onConflictDoUpdate({
      target: [listCollaborators.userId, listCollaborators.listId],
      // Re-inviting someone who declined starts a fresh invitation; an existing member just changes role.
      set: {
        role,
        status: sql`CASE WHEN ${listCollaborators.status} = 'accepted' THEN 'accepted' ELSE 'pending' END`,
        inviteToken: sql`CASE WHEN ${listCollaborators.status} = 'accepted' THEN ${listCollaborators.inviteToken} ELSE gen_random_uuid() END`,
        createdAt: sql`CASE WHEN ${listCollaborators.status} = 'accepted' THEN ${listCollaborators.createdAt} ELSE now() END`,
        invitedBy: inviter.id,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (row.status === 'pending') {
    const acceptUrl = `${env.appUrl}/invite/${row.inviteToken}`;
    const rendered = inviteEmail({ inviterName: inviter.name || inviter.email.split('@')[0], listName: access.list.name, role, acceptUrl });
    await sendEmail({ to: email, subject: rendered.subject, html: rendered.html, text: rendered.text, template: 'invite', userId: invitee.id, senderId: inviter.id });
    await createNotifications([
      {
        userId: invitee.id,
        type: 'list_invite',
        title: `Invitation to "${access.list.name}"`,
        body: `${inviter.name || 'Someone'} invited you to help maintain this watchlist.`,
        link: `/invite/${row.inviteToken}`,
        dedupeKey: `invite:${row.id}:${row.inviteToken}`,
      },
    ]);
  }
  return { sent: true };
}

export async function removeMember(access: ListAccess | null, actorId: string, listId: string, collaboratorId: string) {
  const [row] = await db
    .select({ id: listCollaborators.id, userId: listCollaborators.userId })
    .from(listCollaborators)
    .where(and(eq(listCollaborators.id, collaboratorId), eq(listCollaborators.listId, listId)));
  if (!row) throw errors.notFound('Member');
  const leavingSelf = row.userId === actorId;
  if (!leavingSelf && !access?.canManageMembers) throw errors.forbidden('Only the owner can remove members.');
  await db.delete(listCollaborators).where(eq(listCollaborators.id, row.id));
  return { removed: true, leftList: leavingSelf };
}

export async function invitationsForUser(userId: string) {
  const rows = await db
    .select({
      id: listCollaborators.id,
      token: listCollaborators.inviteToken,
      role: listCollaborators.role,
      createdAt: listCollaborators.createdAt,
      listId: lists.id,
      listName: lists.name,
      inviterName: users.name,
    })
    .from(listCollaborators)
    .innerJoin(lists, and(eq(lists.id, listCollaborators.listId), sql`${lists.deletedAt} IS NULL`))
    .leftJoin(users, eq(users.id, listCollaborators.invitedBy))
    .where(and(eq(listCollaborators.userId, userId), eq(listCollaborators.status, 'pending'), gt(listCollaborators.createdAt, new Date(Date.now() - INVITE_TTL_DAYS * 86_400_000))));
  return rows;
}

/** Invitation details for the /invite/[token] page. Only the invited user may see it. */
export async function invitationByToken(token: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const [row] = await db
    .select({
      id: listCollaborators.id,
      userId: listCollaborators.userId,
      role: listCollaborators.role,
      status: listCollaborators.status,
      createdAt: listCollaborators.createdAt,
      listId: lists.id,
      listName: lists.name,
      listDescription: lists.description,
      deletedAt: lists.deletedAt,
      inviterName: users.name,
    })
    .from(listCollaborators)
    .innerJoin(lists, eq(lists.id, listCollaborators.listId))
    .leftJoin(users, eq(users.id, listCollaborators.invitedBy))
    .where(eq(listCollaborators.inviteToken, token));
  if (!row || row.userId !== userId || row.deletedAt) return null;
  return { ...row, expired: row.status === 'pending' && inviteExpired(row.createdAt) };
}

export async function respondToInvitation(userId: string, invitationId: string, accept: boolean) {
  const [row] = await db
    .select({ id: listCollaborators.id, userId: listCollaborators.userId, status: listCollaborators.status, createdAt: listCollaborators.createdAt, listId: listCollaborators.listId })
    .from(listCollaborators)
    .where(eq(listCollaborators.id, invitationId));
  if (!row || row.userId !== userId) throw errors.notFound('Invitation');
  if (row.status !== 'pending') return { status: row.status, listId: row.listId };
  if (inviteExpired(row.createdAt)) throw errors.gone('This invitation has expired. Ask the owner to send a new one.');

  const status = accept ? 'accepted' : 'declined';
  await db.update(listCollaborators).set({ status, updatedAt: new Date() }).where(eq(listCollaborators.id, row.id));
  return { status, listId: row.listId };
}

// ---------------------------------------------------------------------------
// Suggestions on public lists
// ---------------------------------------------------------------------------

export async function suggestCompany(userId: string, access: ListAccess, input: { url: string; companyName?: string | null }) {
  if (access.list.visibility !== 'public') throw errors.notFound('Watchlist');
  if (!(await getSetting('public_lists.allow_suggestions'))) throw errors.forbidden('Suggestions are switched off.');
  if (access.canEditCompanies) throw errors.conflict('You can add companies to this watchlist directly.');

  const limit = await rateLimit({ key: `suggest:${userId}`, limit: 15, windowSeconds: 86_400, distributed: true });
  if (!limit.allowed) throw errors.tooManyRequests(limit.retryAfterSeconds);

  const syntax = checkUrlSyntax(input.url);
  if (!syntax.safe) throw errors.validation([{ field: 'url', message: syntax.reason }], syntax.reason);

  const [duplicate] = await db
    .select({ id: listContributions.id })
    .from(listContributions)
    .where(and(eq(listContributions.listId, access.list.id), eq(listContributions.url, syntax.normalizedUrl!), eq(listContributions.status, 'pending')));
  if (duplicate) return { submitted: true };

  await db.insert(listContributions).values({
    listId: access.list.id,
    contributorUserId: userId,
    url: syntax.normalizedUrl!,
    companyName: cleanText(input.companyName, 120) || null,
  });
  await createNotifications([
    {
      userId: access.list.userId,
      type: 'contribution',
      title: `New suggestion for "${access.list.name}"`,
      body: cleanText(input.companyName, 120) || syntax.normalizedUrl!,
      link: `/dashboard/watchlists/${access.list.id}?tab=suggestions`,
      dedupeKey: `suggestion:${access.list.id}:${syntax.normalizedUrl}`,
    },
  ]);
  return { submitted: true };
}

export async function reviewSuggestion(access: ListAccess, reviewerId: string, suggestionId: string, approve: boolean) {
  if (!access.canReviewSuggestions) throw errors.forbidden();
  const [row] = await db
    .select()
    .from(listContributions)
    .where(and(eq(listContributions.id, suggestionId), eq(listContributions.listId, access.list.id)));
  if (!row) throw errors.notFound('Suggestion');
  if (row.status !== 'pending') throw errors.conflict('This suggestion has already been reviewed.');

  if (approve) {
    // Re-validated (including DNS) when added; a suggestion is just text until then.
    const reloaded = await loadListAccess(access.list.id, reviewerId);
    if (!reloaded) throw errors.notFound('Watchlist');
    try {
      await addCompanyToList(reloaded, reviewerId, { url: row.url, companyName: row.companyName });
    } catch (error) {
      if ((error as { code?: string }).code !== 'conflict') throw error;
    }
  }
  await db
    .update(listContributions)
    .set({ status: approve ? 'approved' : 'rejected', reviewedAt: new Date() })
    .where(eq(listContributions.id, row.id));
  if (approve) {
    await db.update(lists).set({ contributionCount: sql`${lists.contributionCount} + 1` }).where(eq(lists.id, access.list.id));
  }
  return { status: approve ? 'approved' : 'rejected' };
}

