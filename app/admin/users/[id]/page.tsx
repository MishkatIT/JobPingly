'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Ban, BadgeCheck, ChevronDown, KeyRound, LogOut, MailCheck, MailX, RotateCcw, ShieldCheck, Trash2, WalletCards } from 'lucide-react';
import { Can, EmailStatusBadge, RequirePermission } from '@/components/admin/bits';
import { APPROVAL_LABELS, AccountStatus } from '@/components/admin/user-bits';
import { TimeAgo, UserAvatar } from '@/components/app/bits';
import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/form';
import { Dialog, Dropdown, useConfirm, type MenuItem } from '@/components/ui/overlay';
import { Badge, Callout, Card, CardBody, CardHeader, DetailRow, ErrorState, Skeleton, StatCell, StatGrid, Table, TableWrap, Td, Th, Tr } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/client/api';
import { formatDate, formatDateTime, formatNumber, toLocalInputValue } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, normalizeRole, roleRank, type Role } from '@/lib/auth/rbac';
import { formatFrequencyShortLabel } from '@/lib/utils/frequency';

interface UserDetail {
  user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    role: Role;
    plan: string;
    planExpiresAt: string | null;
    emailVerified: boolean;
    isBlocked: boolean;
    blockedReason: string | null;
    blockedAt: string | null;
    quotaExempt: boolean;
    frequencyEnforcementExempt: boolean;
    dispatchGroup: number | null;
    emailNotificationsEnabled: boolean;
    notificationPreference: string;
    digestHour: number;
    digestMinute: number;
    timezone: string;
    lastDigestSentAt: string | null;
    lastLoginAt: string | null;
    lastActiveAt: string | null;
    onboardingCompletedAt: string | null;
    hasPassword: boolean;
    hasGoogle: boolean;
    createdAt: string;
  };
  approval: { status: string; approvedAt: string | null } | null;
  lists: { id: string; name: string; visibility: string; relation: string; companies: number; deletedAt: string | null }[];
  activity: { sessions: number; tracked: number; applied: number; matches: number; pendingAlerts: number; unread: number };
  emails: { id: string; subject: string; templateType: string | null; status: string; deliveryStatus: string | null; createdAt: string; errorMessage: string | null }[];
  history: { id: string; action: string; actorEmail: string | null; metadata: Record<string, unknown> | null; createdAt: string }[];
  devices: { device: string | null; lastUsedAt: string | null; createdAt: string }[];
}

type Action =
  | { action: 'suspend'; reason: string }
  | { action: 'reactivate' }
  | { action: 'verify' }
  | { action: 'set_role'; role: Role }
  | { action: 'set_plan'; plan: string; expiresAt?: string | null }
  | { action: 'set_exemptions'; quotaExempt?: boolean; frequencyEnforcementExempt?: boolean }
  | { action: 'send_reset_link' }
  | { action: 'revoke_sessions' }
  | { action: 'approve_email' }
  | { action: 'revoke_email' };

const pad = (value: number) => String(value).padStart(2, '0');

function UserView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { user: me, can } = useSession();
  const { confirm, element: confirmElement } = useConfirm();
  const { data, error, isLoading, mutate } = useApi<UserDetail>(`/api/admin/users/${id}`);
  const [dialog, setDialog] = useState<'suspend' | 'role' | 'plan' | null>(null);
  const [busy, setBusy] = useState(false);

  if (error) return <ErrorState title="User not found" description="The account may have been deleted." />;
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 w-72" />
        <Skeleton className="h-24" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const { user, approval, activity } = data;
  const isSelf = user.id === me.id;
  // Mirrors the server rule: staff can only act on accounts ranked below them.
  const outranks = !isSelf && roleRank(me.role) > roleRank(user.role);

  const run = async (body: Action, success: string) => {
    setBusy(true);
    try {
      const next = await api<UserDetail>(`/api/admin/users/${user.id}`, { body });
      await mutate({ data: next }, { revalidate: false });
      toast.success(success);
      setDialog(null);
      return true;
    } catch (err) {
      toast.error('Action failed', errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${user.email}?`,
      description: 'Deletes the account, its watchlists (including public ones others follow), alerts, tracker and notifications. This cannot be undone. The action is recorded in the audit log.',
      confirmLabel: 'Delete account',
      tone: 'danger',
      typeToConfirm: user.email,
    });
    if (!ok) return;
    try {
      await api(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      toast.success('Account deleted');
      router.push('/admin/users');
    } catch (err) {
      toast.error('Could not delete', errorMessage(err));
    }
  };

  const confirmThen = async (title: string, description: string, body: Action, success: string, danger = false) => {
    if (await confirm({ title, description, confirmLabel: 'Continue', tone: danger ? 'danger' : 'default' })) await run(body, success);
  };

  const menu: MenuItem[] = [];
  if (can('users.manage')) {
    if (!user.emailVerified) menu.push({ label: 'Mark email as verified', icon: <BadgeCheck />, onSelect: () => confirmThen('Mark as verified?', 'Only do this if you have confirmed the person owns this address another way.', { action: 'verify' }, 'Marked as verified') });
    menu.push({ label: 'Send password reset link', icon: <KeyRound />, onSelect: () => confirmThen('Send a password reset link?', `An email with a reset link goes to ${user.email}. It also verifies the address when used.`, { action: 'send_reset_link' }, 'Reset link sent') });
    menu.push({ label: 'Sign out of all devices', icon: <LogOut />, disabled: !outranks, onSelect: () => confirmThen('Sign out everywhere?', 'Every session for this account ends immediately.', { action: 'revoke_sessions' }, 'Signed out everywhere') });
    menu.push(
      user.isBlocked
        ? { label: 'Reactivate account', icon: <RotateCcw />, disabled: !outranks, onSelect: () => confirmThen('Reactivate this account?', 'They will be able to sign in again.', { action: 'reactivate' }, 'Account reactivated') }
        : { label: 'Suspend account…', icon: <Ban />, tone: 'danger', disabled: !outranks, onSelect: () => setDialog('suspend') },
    );
  }
  if (can('emails.manage')) {
    menu.push(
      approval?.status === 'approved'
        ? { label: 'Revoke email approval', icon: <MailX />, separator: true, onSelect: () => confirmThen('Stop alert emails to this user?', 'Their matches still appear in the app.', { action: 'revoke_email' }, 'Email approval revoked') }
        : { label: 'Approve email alerts', icon: <MailCheck />, separator: true, onSelect: () => confirmThen('Approve alert emails?', 'They will start receiving alert emails, and a welcome email if they have not had one.', { action: 'approve_email' }, 'Email approved') },
    );
  }
  if (can('users.plans')) menu.push({ label: 'Change plan or limits…', icon: <WalletCards />, separator: !can('emails.manage'), disabled: !outranks && !isSelf, onSelect: () => setDialog('plan') });
  if (can('users.roles')) menu.push({ label: 'Change role…', icon: <ShieldCheck />, disabled: isSelf, onSelect: () => setDialog('role') });
  if (can('users.delete')) menu.push({ label: 'Delete account…', icon: <Trash2 />, tone: 'danger', separator: true, disabled: !outranks, onSelect: remove });

  const owned = data.lists.filter(list => list.relation === 'owner');
  const followed = data.lists.filter(list => list.relation !== 'owner');

  return (
    <>
      <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Users
      </Link>

      <header className="mt-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <UserAvatar name={user.name ?? user.email} src={user.avatarUrl} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl">{user.name ?? user.email}</h1>
            <p className="truncate text-base text-muted">{user.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <AccountStatus user={user} />
              {user.role !== 'user' && <Badge tone="accent">{ROLE_LABELS[user.role]}</Badge>}
              <Badge tone="outline" className="capitalize">
                {user.plan}
              </Badge>
              {isSelf && <Badge tone="neutral">You</Badge>}
            </div>
          </div>
        </div>
        {menu.length > 0 && (
          <Dropdown
            label="Account actions"
            triggerClassName="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3.5 text-base font-medium text-ink shadow-xs hover:bg-sunken"
            trigger={
              <>
                Actions <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </>
            }
            items={menu}
          />
        )}
      </header>

      {!outranks && !isSelf && (can('users.manage') || can('users.delete')) && (
        <p className="mt-3 text-sm text-muted">This account has the same or a higher role than yours, so most actions are unavailable.</p>
      )}

      {user.isBlocked && (
        <Callout tone="danger" title="Suspended" className="mt-6">
          {user.blockedReason ?? 'No reason recorded.'} {user.blockedAt && <span className="text-muted">· since {formatDateTime(user.blockedAt)}</span>}
        </Callout>
      )}

      <StatGrid className="mt-6">
        <StatCell label="Watchlists" value={formatNumber(owned.length)} hint={`Follows ${formatNumber(followed.length)} more`} />
        <StatCell label="Jobs tracked" value={formatNumber(activity.tracked)} hint={`${formatNumber(activity.applied)} applied or further`} />
        <StatCell label="Matches" value={formatNumber(activity.matches)} hint={`${formatNumber(activity.pendingAlerts)} alerts waiting to send`} />
        <StatCell label="Active sessions" value={formatNumber(activity.sessions)} hint={`${formatNumber(activity.unread)} unread notifications`} />
      </StatGrid>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Account" />
          <dl className="divide-y divide-line px-4 sm:px-5">
            <DetailRow label="User ID">
              <span className="font-mono text-sm">{user.id}</span>
            </DetailRow>
            <DetailRow label="Joined">{formatDateTime(user.createdAt)}</DetailRow>
            <DetailRow label="Last sign-in">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}</DetailRow>
            <DetailRow label="Last active">
              <TimeAgo value={user.lastActiveAt} />
            </DetailRow>
            <DetailRow label="Sign-in methods">{[user.hasPassword && 'Password', user.hasGoogle && 'Google'].filter(Boolean).join(', ') || 'None'}</DetailRow>
            <DetailRow label="Email verified">{user.emailVerified ? 'Yes' : 'No'}</DetailRow>
            <DetailRow label="Onboarding">{user.onboardingCompletedAt ? `Completed ${formatDate(user.onboardingCompletedAt)}` : 'Not completed'}</DetailRow>
            <DetailRow label="Role">
              {ROLE_LABELS[user.role]} <span className="text-sm text-muted">· {ROLE_DESCRIPTIONS[user.role]}</span>
            </DetailRow>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Email alerts and plan" />
          <dl className="divide-y divide-line px-4 sm:px-5">
            <DetailRow label="Approval">{approval ? (APPROVAL_LABELS[approval.status] ?? approval.status) : 'No record'}</DetailRow>
            <DetailRow label="Alert emails">{user.emailNotificationsEnabled ? 'On' : 'Turned off by the user'}</DetailRow>
            <DetailRow label="Schedule">
              {formatFrequencyShortLabel(user.notificationPreference)} at {pad(user.digestHour)}:{pad(user.digestMinute)} ({user.timezone})
              {user.frequencyEnforcementExempt && <span className="text-sm text-muted"> · exempt from the platform schedule</span>}
            </DetailRow>
            <DetailRow label="Last digest">{user.lastDigestSentAt ? formatDateTime(user.lastDigestSentAt) : 'Never'}</DetailRow>
            <DetailRow label="Delivery cohort">{user.dispatchGroup ?? '—'}</DetailRow>
            <DetailRow label="Plan">
              <span className="capitalize">{user.plan}</span>
              {user.planExpiresAt && <span className="text-sm text-muted"> · until {formatDate(user.planExpiresAt)}</span>}
            </DetailRow>
            <DetailRow label="Limits">{user.quotaExempt ? 'Exempt from plan limits' : 'Plan limits apply'}</DetailRow>
          </dl>
        </Card>
      </div>

      <Card className="mt-6 overflow-hidden">
        <CardHeader
          title="Watchlists"
          description="Lists this person owns or follows."
          action={
            owned.length > 0 ? (
              <Can permission="lists.read">
                <Link href={`/admin/watchlists?q=${encodeURIComponent(user.email)}`} className="text-sm font-medium text-accent hover:text-accent-hover">
                  Manage owned lists
                </Link>
              </Can>
            ) : undefined
          }
        />
        {data.lists.length === 0 ? (
          <CardBody>
            <p className="text-sm text-muted">None.</p>
          </CardBody>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Relation</Th>
                  <Th>Visibility</Th>
                  <Th className="text-right">Companies</Th>
                </tr>
              </thead>
              <tbody>
                {data.lists.map(list => (
                  <Tr key={list.id}>
                    <Td>
                      <span className="font-medium">{list.name}</span>
                      {list.deletedAt && (
                        <Badge tone="danger" className="ml-2">
                          In trash
                        </Badge>
                      )}
                    </Td>
                    <Td className="capitalize">{list.relation}</Td>
                    <Td className="capitalize">{list.visibility}</Td>
                    <Td className="tabular text-right">{formatNumber(list.companies)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <Can permission="emails.read">
          <Card className="overflow-hidden">
            <CardHeader title="Recent emails" action={<Link href={`/admin/emails?tab=logs&q=${encodeURIComponent(user.email)}`} className="text-sm font-medium text-accent hover:text-accent-hover">All</Link>} />
            {data.emails.length === 0 ? (
              <CardBody>
                <p className="text-sm text-muted">No emails sent to this address.</p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-line">
                {data.emails.map(email => (
                  <li key={email.id} className="px-4 py-2.5 sm:px-5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate text-base text-ink">{email.subject}</p>
                      <EmailStatusBadge status={email.deliveryStatus ?? email.status} />
                    </div>
                    <p className="text-sm text-muted">
                      {email.templateType ?? 'email'} · {formatDateTime(email.createdAt)}
                      {email.errorMessage && <span className="text-danger"> · {email.errorMessage}</span>}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Can>

        <Card>
          <CardHeader title="Signed-in devices" />
          {data.devices.length === 0 ? (
            <CardBody>
              <p className="text-sm text-muted">No active sessions.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-line">
              {data.devices.map((device, index) => (
                <li key={index} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                  <span className="min-w-0 truncate text-base text-ink">{device.device ?? 'Unknown device'}</span>
                  <TimeAgo value={device.lastUsedAt ?? device.createdAt} className="shrink-0 text-sm text-muted" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Staff actions on this account" description="From the audit log." />
        {data.history.length === 0 ? (
          <CardBody>
            <p className="text-sm text-muted">None recorded.</p>
          </CardBody>
        ) : (
          <ul className="divide-y divide-line">
            {data.history.map(entry => (
              <li key={entry.id} className="px-4 py-2.5 sm:px-5">
                <p className="text-base text-ink">
                  <span className="font-mono text-sm">{entry.action}</span>
                  <span className="text-muted"> by {entry.actorEmail ?? 'system'}</span>
                </p>
                <p className="text-sm text-muted">
                  {formatDateTime(entry.createdAt)}
                  {entry.metadata &&
                    Object.entries(entry.metadata)
                      .filter(([key]) => key !== 'email')
                      .map(([key, value]) => ` · ${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
                      .join('')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <SuspendDialog open={dialog === 'suspend'} busy={busy} onClose={() => setDialog(null)} onSubmit={reason => run({ action: 'suspend', reason }, 'Account suspended')} />
      <RoleDialog key={`role-${user.role}`} open={dialog === 'role'} busy={busy} current={user.role} onClose={() => setDialog(null)} onSubmit={role => run({ action: 'set_role', role }, `Role changed to ${ROLE_LABELS[role]}`)} />
      <PlanDialog
        key={`plan-${user.plan}-${user.planExpiresAt}-${user.quotaExempt}-${user.frequencyEnforcementExempt}`}
        open={dialog === 'plan'}
        busy={busy}
        user={user}
        onClose={() => setDialog(null)}
        onSubmit={async (plan, expiresAt, exemptions) => {
          const planChanged = plan !== user.plan || (expiresAt ?? null) !== (user.planExpiresAt ? toLocalInputValue(user.planExpiresAt).slice(0, 10) : null);
          if (planChanged && !(await run({ action: 'set_plan', plan, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null }, 'Plan updated'))) return;
          if (exemptions.quotaExempt !== user.quotaExempt || exemptions.frequencyEnforcementExempt !== user.frequencyEnforcementExempt) {
            await run({ action: 'set_exemptions', ...exemptions }, 'Exemptions updated');
          }
          setDialog(null);
        }}
      />
      {confirmElement}
    </>
  );
}

function SuspendDialog({ open, busy, onClose, onSubmit }: { open: boolean; busy: boolean; onClose: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      size="sm"
      title="Suspend this account?"
      description="They are signed out everywhere and cannot sign in. Alerts stop. Nothing is deleted."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={() => onSubmit(reason.trim())}>
            Suspend
          </Button>
        </>
      }
    >
      <Field label="Reason" hint="Recorded in the audit log. Not shown to the user.">
        {ids => <Textarea {...ids} rows={3} maxLength={300} value={reason} onChange={event => setReason(event.target.value)} />}
      </Field>
    </Dialog>
  );
}

function RoleDialog({ open, busy, current, onClose, onSubmit }: { open: boolean; busy: boolean; current: Role; onClose: () => void; onSubmit: (role: Role) => void }) {
  const [role, setRole] = useState<Role>(current);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      size="sm"
      title="Change role"
      description="Roles decide what someone can see and do in the admin panel."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={role === current} onClick={() => onSubmit(role)}>
            Change role
          </Button>
        </>
      }
    >
      <fieldset className="space-y-2">
        <legend className="sr-only">Role</legend>
        {ROLES.map(value => (
          <label key={value} className="flex cursor-pointer gap-3 rounded-md border border-line p-3 has-[:checked]:border-ink">
            <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} className="mt-1 accent-[rgb(var(--accent))]" />
            <span>
              <span className="block text-base font-medium text-ink">{ROLE_LABELS[value]}</span>
              <span className="block text-sm text-muted">{ROLE_DESCRIPTIONS[value]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {normalizeRole(role) === 'owner' && role !== current && (
        <Callout tone="warning" className="mt-3">
          Owners have full control, including changing your role.
        </Callout>
      )}
    </Dialog>
  );
}

function PlanDialog({
  open,
  busy,
  user,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  user: UserDetail['user'];
  onClose: () => void;
  onSubmit: (plan: string, expiresAt: string | null, exemptions: { quotaExempt: boolean; frequencyEnforcementExempt: boolean }) => void;
}) {
  const [plan, setPlan] = useState(user.plan);
  const [expiresAt, setExpiresAt] = useState(user.planExpiresAt ? toLocalInputValue(user.planExpiresAt).slice(0, 10) : '');
  const [quotaExempt, setQuotaExempt] = useState(user.quotaExempt);
  const [frequencyExempt, setFrequencyExempt] = useState(user.frequencyEnforcementExempt);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      title="Plan and limits"
      description="Plans change limits only. No payment is taken or refunded here."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => onSubmit(plan, expiresAt || null, { quotaExempt, frequencyEnforcementExempt: frequencyExempt })}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Plan">
          {ids => (
            <Select {...ids} value={plan} onChange={event => setPlan(event.target.value)}>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="team">Team</option>
            </Select>
          )}
        </Field>
        {plan !== 'free' && (
          <Field label="Ends on" optional hint="After this date the account falls back to the free plan's limits.">
            {ids => <Input {...ids} type="date" value={expiresAt} onChange={event => setExpiresAt(event.target.value)} className="w-48" />}
          </Field>
        )}
        <Switch checked={quotaExempt} onChange={setQuotaExempt} label="Exempt from plan limits" description="No limits on watchlists, companies or keywords." />
        <Switch checked={frequencyExempt} onChange={setFrequencyExempt} label="Exempt from the platform email schedule" description="Their own email frequency applies even when a platform-wide schedule is enforced." />
      </div>
    </Dialog>
  );
}

export default function AdminUserPage() {
  return (
    <RequirePermission permission="users.read">
      <UserView />
    </RequirePermission>
  );
}
