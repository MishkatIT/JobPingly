import { Badge } from '@/components/ui/primitives';

/** Account state as a badge: suspended, not verified, or active. */
export function AccountStatus({ user }: { user: { isBlocked: boolean; emailVerified: boolean } }) {
  if (user.isBlocked) return <Badge tone="danger">Suspended</Badge>;
  if (!user.emailVerified) return <Badge tone="warning">Not verified</Badge>;
  return <Badge tone="success">Active</Badge>;
}

export const APPROVAL_LABELS: Record<string, string> = {
  approved: 'Approved',
  pending: 'Waiting for approval',
  unapproved: 'Not approved',
};
