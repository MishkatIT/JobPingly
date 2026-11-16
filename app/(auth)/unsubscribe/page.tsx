import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { maskEmail, readUnsubscribeToken } from '@/lib/email/unsubscribe';
import { UnsubscribeForm } from './form';

export const metadata: Metadata = { title: 'Unsubscribe', robots: { index: false } };

/**
 * Opening the link never changes anything (link scanners prefetch email
 * URLs); the visitor confirms with a button, which POSTs the signed token.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  const userId = readUnsubscribeToken(token);
  const [user] = userId ? await db.select({ email: users.email, emailEnabled: users.emailNotificationsEnabled }).from(users).where(eq(users.id, userId)) : [];

  if (!user) {
    return (
      <div>
        <h1 className="text-2xl">This link is not valid</h1>
        <p className="mt-2 text-base text-muted">It may be incomplete or the account may have been deleted. If you are signed in, you can change email settings directly.</p>
        <Link href="/dashboard/settings/notifications" className="mt-6 inline-block font-medium text-accent hover:text-accent-hover">
          Notification settings
        </Link>
      </div>
    );
  }

  return <UnsubscribeForm token={token} maskedEmail={maskEmail(user.email)} alreadyUnsubscribed={!user.emailEnabled} />;
}
