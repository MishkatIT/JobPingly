'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Check, CheckCheck, UserCheck, X } from 'lucide-react';
import { SearchInput } from '@/components/admin/bits';
import { UserLink, useUrlFilters } from '@/components/admin/ops-bits';
import { TimeAgo } from '@/components/app/bits';
import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { Pagination, Segmented, useConfirm } from '@/components/ui/overlay';
import { Badge, Callout, EmptyState, ErrorState, SkeletonRows, Table, TableWrap, Td, Th, Tr, type Tone } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage, qs } from '@/lib/client/api';
import { formatNumber, plural } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';
import type { EmailStats } from './types';

interface Approval {
  id: string;
  email: string;
  status: string;
  requestedAt: string | null;
  approvedAt: string | null;
  userId: string | null;
  name: string | null;
  lastActiveAt: string | null;
}

type Status = 'pending' | 'approved' | 'unapproved' | 'all';
const STATUS_LABELS: Record<string, string> = { pending: 'Waiting', approved: 'Approved', unapproved: 'Revoked' };
const STATUS_TONES: Record<string, Tone> = { pending: 'warning', approved: 'success', unapproved: 'neutral' };
const PAGE_SIZE = 50;

export function ApprovalsTab({ stats, onChanged }: { stats: EmailStats | undefined; onChanged: () => void }) {
  const toast = useToast();
  const { can } = useSession();
  const { confirm, element: confirmElement } = useConfirm();
  const { params, update } = useUrlFilters();
  const statusParam = params.get('status') as Status | null;
  const status: Status = statusParam && ['pending', 'approved', 'unapproved', 'all'].includes(statusParam) ? statusParam : 'pending';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const canManage = can('emails.manage');

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.get('q') ?? '') !== search.trim()) update({ q: search.trim() || null });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const key = `/api/admin/emails/approvals${qs({ status, q: params.get('q') ?? '', page, pageSize: PAGE_SIZE })}`;
  const { data, meta, error, isLoading, mutate } = useApi<Approval[]>(key);
  const counts = (meta?.counts ?? {}) as Record<string, number>;

  // A selection only makes sense for the rows on screen: reset it when the filters or page change.
  const [selectionFor, setSelectionFor] = useState(key);
  if (selectionFor !== key) {
    setSelectionFor(key);
    setSelected(new Set());
  }

  const act = async (emails: string[], action: 'approve' | 'revoke') => {
    if (emails.length === 0) return;
    if (action === 'approve') {
      const ok = await confirm({
        title: emails.length === 1 ? `Approve ${emails[0]}?` : `Approve ${plural(emails.length, 'address', 'addresses')}?`,
        description: 'Job alert emails start for approved addresses. Anyone approved for the first time also receives a welcome email.',
        confirmLabel: 'Approve',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const result = await api<{ updated: number }>('/api/admin/emails/approvals', { body: { action, emails } });
      toast.success(action === 'approve' ? `Approved ${plural(result.updated, 'address', 'addresses')}` : `Revoked ${plural(result.updated, 'address', 'addresses')}`);
      setSelected(new Set());
      await mutate();
      onChanged();
    } catch (err) {
      toast.error('Could not update approvals', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const approveAll = async () => {
    const pending = counts.pending ?? 0;
    const ok = await confirm({
      title: `Approve all ${formatNumber(Math.min(pending, 500))} waiting addresses?`,
      description: `${pending > 500 ? 'Up to 500 are approved at a time. ' : ''}Each newly approved person receives a welcome email, and their job alerts start.`,
      confirmLabel: 'Approve all',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await api<{ updated: number }>('/api/admin/emails/approvals', { body: { action: 'approve_all_pending' } });
      toast.success(`Approved ${plural(result.updated, 'address', 'addresses')}`);
      setSelected(new Set());
      await mutate();
      onChanged();
    } catch (err) {
      toast.error('Could not approve', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const allOnPage = (data ?? []).map(row => row.email);
  const allSelected = allOnPage.length > 0 && allOnPage.every(email => selected.has(email));
  const toggle = (email: string) =>
    setSelected(current => {
      const next = new Set(current);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });

  return (
    <>
      {stats && (
        <Callout tone="neutral" className="mb-4">
          {stats.policy.requireApproval ? (
            <>New addresses wait here until someone approves them; until then, matches only appear in the app. </>
          ) : (
            <>New addresses are approved automatically, so this list only changes when someone revokes an address. </>
          )}
          This is controlled by &ldquo;Approve new recipients automatically&rdquo; in{' '}
          <Link href="/admin/settings" className="font-medium text-accent hover:text-accent-hover">
            Settings
          </Link>
          .
        </Callout>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Segmented
            label="Approval status"
            value={status}
            onChange={value => update({ status: value === 'pending' ? null : value })}
            options={[
              { value: 'pending', label: `Waiting${meta ? ` (${formatNumber(counts.pending ?? 0)})` : ''}` },
              { value: 'approved', label: `Approved${meta ? ` (${formatNumber(counts.approved ?? 0)})` : ''}` },
              { value: 'unapproved', label: `Revoked${meta ? ` (${formatNumber(counts.unapproved ?? 0)})` : ''}` },
              { value: 'all', label: 'All' },
            ]}
          />
          <SearchInput value={search} onChange={setSearch} placeholder="Search email address" className="relative block w-full sm:w-60" />
        </div>
        {canManage && (counts.pending ?? 0) > 0 && (
          <Button icon={<CheckCheck className="h-4 w-4" />} disabled={busy} onClick={approveAll}>
            Approve all waiting
          </Button>
        )}
      </div>

      {canManage && selected.size > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-line bg-sunken/60 px-3 py-2 text-sm">
          <span className="mr-auto text-ink">{plural(selected.size, 'address', 'addresses')} selected</span>
          <Button size="sm" variant="primary" icon={<Check className="h-3.5 w-3.5" />} loading={busy} onClick={() => act(Array.from(selected), 'approve')}>
            Approve
          </Button>
          <Button size="sm" icon={<X className="h-3.5 w-3.5" />} disabled={busy} onClick={() => act(Array.from(selected), 'revoke')}>
            Revoke
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface">
        {error ? (
          <ErrorState description={errorMessage(error)} onRetry={() => mutate()} />
        ) : isLoading ? (
          <SkeletonRows rows={6} />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={<UserCheck />} title={params.get('q') ? 'No addresses match your search' : status === 'pending' ? 'Nobody is waiting for approval' : 'No addresses here'} />
        ) : (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    {canManage && (
                      <Th className="w-10">
                        <input
                          type="checkbox"
                          aria-label="Select every address on this page"
                          checked={allSelected}
                          onChange={() => setSelected(allSelected ? new Set() : new Set(allOnPage))}
                          className="h-4 w-4 accent-[rgb(var(--accent))]"
                        />
                      </Th>
                    )}
                    <Th>Address</Th>
                    <Th>Status</Th>
                    <Th>Requested</Th>
                    <Th>Last active</Th>
                    {canManage && (
                      <Th className="text-right">
                        <span className="sr-only">Actions</span>
                      </Th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.map(row => (
                    <Tr key={row.id}>
                      {canManage && (
                        <Td>
                          <input
                            type="checkbox"
                            aria-label={`Select ${row.email}`}
                            checked={selected.has(row.email)}
                            onChange={() => toggle(row.email)}
                            className="h-4 w-4 accent-[rgb(var(--accent))]"
                          />
                        </Td>
                      )}
                      <Td className="max-w-[18rem]">
                        <UserLink id={can('users.read') ? row.userId : null}>
                          <span className="block truncate">{row.email}</span>
                        </UserLink>
                        {row.name && <span className="block truncate text-xs text-muted">{row.name}</span>}
                        {!row.userId && <span className="block text-xs text-subtle">No account with this address</span>}
                      </Td>
                      <Td>
                        <Badge tone={STATUS_TONES[row.status] ?? 'neutral'}>{STATUS_LABELS[row.status] ?? row.status}</Badge>
                      </Td>
                      <Td className="whitespace-nowrap text-sm text-muted">
                        <TimeAgo value={row.requestedAt} />
                      </Td>
                      <Td className="whitespace-nowrap text-sm text-muted">
                        <TimeAgo value={row.lastActiveAt} />
                      </Td>
                      {canManage && (
                        <Td className="whitespace-nowrap text-right">
                          {row.status !== 'approved' && (
                            <Button size="xs" variant="ghost" disabled={busy} onClick={() => act([row.email], 'approve')}>
                              Approve
                            </Button>
                          )}
                          {row.status !== 'unapproved' && (
                            <Button size="xs" variant="ghost" disabled={busy} onClick={() => act([row.email], 'revoke')}>
                              Revoke
                            </Button>
                          )}
                        </Td>
                      )}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            <Pagination page={page} totalPages={Number(meta?.totalPages ?? 1)} total={Number(meta?.total ?? 0)} pageSize={PAGE_SIZE} onChange={next => update({ page: next })} className="border-t border-line" />
          </>
        )}
      </div>
      {confirmElement}
    </>
  );
}
