import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { isStaff, permissionsFor } from './rbac';
import { getSession, type Session, type SessionUser } from './session';

/** Session for Server Components and layouts. */
export async function getServerSession(): Promise<Session | null> {
  const store = await cookies();
  return getSession({ cookies: store });
}

/** Redirects to sign-in when there is no valid session. */
export async function requireServerUser(): Promise<SessionUser> {
  const session = await getServerSession();
  if (!session) redirect('/login');
  return session.user;
}

/** Hides the admin area entirely (404) from anyone who is not staff. */
export async function requireServerStaff(): Promise<SessionUser> {
  const session = await getServerSession();
  if (!session) redirect('/login?next=/admin');
  if (!isStaff(session.user.role)) notFound();
  return session.user;
}

/** The shape handed to client components: never includes anything secret. */
export interface ClientUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  plan: string;
  timezone: string;
  hasPassword: boolean;
  hasGoogle: boolean;
  onboarded: boolean;
  permissions: string[];
  createdAt: string;
}

export function toClientUser(user: SessionUser): ClientUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    plan: user.plan,
    timezone: user.timezone,
    hasPassword: user.hasPassword,
    hasGoogle: user.hasGoogle,
    onboarded: Boolean(user.onboardingCompletedAt),
    permissions: permissionsFor(user.role),
    createdAt: user.createdAt.toISOString(),
  };
}
