import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route } from '@/lib/api/route';
import { toClientUser } from '@/lib/auth/server';
import { clearSessionCookies } from '@/lib/auth/session';
import { countUnread } from '@/lib/notifications/inapp';
import { deleteAccount, getProfile, updateProfile } from '@/lib/users/service';

/** The signed-in user, their plan and usage. */
export const GET = route({}, async ({ user }) => {
  const [profile, unread] = await Promise.all([getProfile(user.id), countUnread(user.id)]);
  return { user: toClientUser(user), profile, unreadNotifications: unread };
});

const patchBody = z.object({
  name: z.string().max(80).optional(),
  avatarUrl: z.string().max(400_000).nullable().optional(),
  socials: z.record(z.string(), z.string().max(300)).optional(),
  timezone: z.string().max(64).optional(),
});

export const PATCH = route({ body: patchBody, maxBodyBytes: 450 * 1024 }, async ({ user, body }) => updateProfile(user.id, body));

const deleteBody = z.object({
  password: z.string().max(200).optional(),
  email: z.string().max(254).optional(),
});

/** Permanently deletes the account. Requires the password (or the email address for Google-only accounts). */
export const DELETE = route(
  { body: deleteBody, rateLimit: { name: 'me:delete', limit: 5, windowSeconds: 3600, by: 'user' } },
  async ({ req, user, body }) => {
    await deleteAccount(user.id, body, req);
    const response = NextResponse.json({ data: { deleted: true } });
    clearSessionCookies(response);
    return response;
  },
);
