'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { RequirePermission, SearchInput, nextSearch } from '@/components/admin/bits';
import { AccountStatus } from '@/components/admin/user-bits';
import { TimeAgo, UserAvatar } from '@/components/app/bits';
import { Select } from '@/components/ui/form';
import { Pagination, Tabs } from '@/components/ui/overlay';
import { Badge, EmptyState, ErrorState, PageHeader, SkeletonRows, Table, TableWrap, Td, Th, Tr } from '@/components/ui/primitives';
import { qs } from '@/lib/client/api';
import { formatDate, formatNumber } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';
import { ROLE_LABELS, ROLES, normalizeRole } from '@/lib/auth/rbac';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  plan: string;
  emailVerified: boolean;
  isBlocked: boolean;
  blockedReason: string | null;
  quotaExempt: boolean;
  lastActiveAt: string | null;
  createdAt: string;
  approval: string | null;
  lists: number;
  following: number;
  tracked: number;
}

const STATUSES = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'unverified', label: 'Not verified' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'staff', label: 'Staff' },
] as const;
type Status = (typeof STATUSES)[number]['value'];
const PAGE_SIZE = 25;

function UsersView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const statusParam = params.get('status') as Status | null;
  const status: Status = STATUSES.some(item => item.value === statusParam) ? statusParam! : 'all';
  const role = params.get('role') ?? '';
  const plan = params.get('plan') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState(params.get('q') ?? '');

  const update = (changes: Record<string, string | number | null>) => router.replace(`${pathname}${nextSearch(params, changes)}`, { scroll: false });

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.get('q') ?? '') !== search.trim()) update({ q: search.trim() || null });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const query = qs({ status, role, plan, sort, q: params.get('q') ?? '', page, pageSize: PAGE_SIZE });
  const { data, meta, error, isLoading, isRefreshing, mutate } = useApi<UserRow[]>(`/api/admin/users${query}`);

  return (
    <>
      <PageHeader title="Users" description="Every account. Open one to verify, suspend, change its plan or see its activity." />

      <Tabs label="Account status" value={status} onChange={value => update({ status: value === 'all' ? null : value })} options={STATUSES.map(item => ({ ...item }))} />

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name, email or ID" className="relative w-full lg:max-w-sm" />
        <div className="flex flex-wrap gap-2">
          <label>
            <span className="sr-only">Role</span>
            <Select value={role} onChange={event => update({ role: event.target.value || null })} className="w-36">
              <option value="">Any role</option>
              {ROLES.map(value => (
                <option key={value} value={value}>
                  {ROLE_LABELS[value]}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="sr-only">Plan</span>
            <Select value={plan} onChange={event => update({ plan: event.target.value || null })} className="w-32">
              <option value="">Any plan</option>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="team">Team</option>
            </Select>
          </label>
          <label>
            <span className="sr-only">Sort</span>
            <Select value={sort} onChange={event => update({ sort: event.target.value === 'newest' ? null : event.target.value })} className="w-44">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="active">Recently active</option>
              <option value="name">Name</option>
            </Select>
          </label>
        </div>
      </div>

      <div className={`mt-4 overflow-hidden rounded-lg border border-line bg-surface transition-opacity ${isRefreshing ? 'opacity-70' : ''}`}>
        {error ? (
          <ErrorState description="Users could not be loaded." onRetry={() => mutate()} />
        ) : isLoading ? (
          <SkeletonRows rows={8} />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={<Users />} title="No users match" description="Try a different search or filter." />
        ) : (
          <>
            <TableWrap>
              <Table className="min-w-[860px]">
                <thead>
                  <tr>
                    <Th>User</Th>
                    <Th>Status</Th>
                    <Th>Role</Th>
                    <Th>Plan</Th>
                    <Th className="text-right">Watchlists</Th>
                    <Th className="text-right">Tracked</Th>
                    <Th>Last active</Th>
                    <Th>Joined</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(user => (
                    <Tr key={user.id}>
                      <Td>
                        <Link href={`/admin/users/${user.id}`} className="flex items-center gap-2.5 hover:text-accent">
                          <UserAvatar name={user.name ?? user.email} src={user.avatarUrl} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{user.name ?? '—'}</span>
                            <span className="block truncate text-sm text-muted">{user.email}</span>
                          </span>
                        </Link>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          <AccountStatus user={user} />
                          {user.approval === 'pending' && user.emailVerified && <Badge tone="outline">Email pending</Badge>}
                        </div>
                      </Td>
                      <Td>{normalizeRole(user.role) === 'user' ? <span className="text-muted">User</span> : <Badge tone="accent">{ROLE_LABELS[normalizeRole(user.role)]}</Badge>}</Td>
                      <Td className="capitalize">
                        {user.plan}
                        {user.quotaExempt && <span className="ml-1 text-xs text-muted">(exempt)</span>}
                      </Td>
                      <Td className="tabular text-right">
                        {formatNumber(user.lists)}
                        {user.following > 0 && <span className="text-sm text-muted"> +{formatNumber(user.following)}</span>}
                      </Td>
                      <Td className="tabular text-right">{formatNumber(user.tracked)}</Td>
                      <Td className="whitespace-nowrap text-sm">
                        <TimeAgo value={user.lastActiveAt} />
                      </Td>
                      <Td className="whitespace-nowrap text-sm">{formatDate(user.createdAt)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            <Pagination page={page} totalPages={Number(meta?.totalPages ?? 1)} total={Number(meta?.total ?? 0)} pageSize={PAGE_SIZE} onChange={value => update({ page: value })} className="border-t border-line" />
          </>
        )}
      </div>
      <p className="mt-2 text-sm text-muted">“+N” after the watchlist count is the number of other people’s watchlists the user follows.</p>
    </>
  );
}

export default function AdminUsersPage() {
  return (
    <RequirePermission permission="users.read">
      <Suspense fallback={<SkeletonRows rows={8} />}>
        <UsersView />
      </Suspense>
    </RequirePermission>
  );
}
