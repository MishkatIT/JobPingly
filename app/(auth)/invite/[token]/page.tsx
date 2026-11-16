import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/server';
import { invitationByToken } from '@/lib/lists/members';
import { InvitationActions } from './actions';

export const metadata: Metadata = { title: 'Invitation', robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await getServerSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);

  const invitation = await invitationByToken(token, session.user.id);

  if (!invitation) {
    return (
      <div>
        <h1 className="text-2xl">Invitation not found</h1>
        <p className="mt-2 text-base text-muted">
          This invitation does not exist, was withdrawn, or was sent to a different account. You are signed in as <span className="font-medium text-ink">{session.user.email}</span>.
        </p>
        <Link href="/dashboard" className="mt-6 inline-block font-medium text-accent hover:text-accent-hover">
          Go to your dashboard
        </Link>
      </div>
    );
  }

  if (invitation.status === 'accepted') redirect(`/dashboard/watchlists/${invitation.listId}`);

  const role = invitation.role === 'moderator' ? 'moderator' : 'editor';
  return (
    <div>
      <p className="text-sm text-muted">Watchlist invitation</p>
      <h1 className="mt-1 text-2xl">{invitation.listName}</h1>
      {invitation.listDescription && <p className="mt-2 text-base text-muted">{invitation.listDescription}</p>}

      {invitation.expired ? (
        <p className="mt-4 text-base text-ink">This invitation has expired. Ask {invitation.inviterName ?? 'the owner'} to send a new one.</p>
      ) : invitation.status === 'declined' ? (
        <p className="mt-4 text-base text-ink">You declined this invitation.</p>
      ) : (
        <>
          <p className="mt-4 text-base text-ink">
            {invitation.inviterName ?? 'The owner'} invited you to help maintain this watchlist as {role === 'moderator' ? 'a moderator' : 'an editor'}.{' '}
            {role === 'moderator' ? 'Moderators can add and remove companies, edit the details and review suggestions.' : 'Editors can add and remove companies.'}
          </p>
          <InvitationActions invitationId={invitation.id} listId={invitation.listId} />
        </>
      )}
    </div>
  );
}
