'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Briefcase,
  ChevronDown,
  Cpu,
  Gauge,
  Globe,
  ListChecks,
  LogOut,
  Mail,
  Menu,
  MessageSquareWarning,
  ScrollText,
  Server,
  Settings,
  Users,
} from 'lucide-react';
import { UserAvatar } from '@/components/app/bits';
import { useSession } from '@/components/app/session';
import { LogoMark } from '@/components/brand/logo';
import { IconButton } from '@/components/ui/button';
import { Dialog, Dropdown } from '@/components/ui/overlay';
import { Badge } from '@/components/ui/primitives';
import { ThemeSwitcher } from '@/components/ui/theme';
import { cn } from '@/lib/client/cn';
import { ROLE_LABELS, normalizeRole, type Permission } from '@/lib/auth/rbac';

interface NavItem {
  href: string;
  label: string;
  icon: typeof Users;
  permission: Permission;
  exact?: boolean;
}

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Platform',
    items: [
      { href: '/admin', label: 'Overview', icon: Gauge, permission: 'overview.read', exact: true },
      { href: '/admin/users', label: 'Users', icon: Users, permission: 'users.read' },
      { href: '/admin/watchlists', label: 'Watchlists', icon: ListChecks, permission: 'lists.read' },
      { href: '/admin/issues', label: 'Reported issues', icon: MessageSquareWarning, permission: 'issues.read' },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { href: '/admin/sources', label: 'Sources', icon: Globe, permission: 'sources.read' },
      { href: '/admin/jobs', label: 'Jobs', icon: Briefcase, permission: 'jobs.read' },
      { href: '/admin/monitoring', label: 'Workers & queue', icon: Cpu, permission: 'workers.read' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/admin/emails', label: 'Email', icon: Mail, permission: 'emails.read' },
      { href: '/admin/settings', label: 'Settings', icon: Settings, permission: 'settings.read' },
      { href: '/admin/audit', label: 'Audit log', icon: ScrollText, permission: 'audit.read' },
      { href: '/admin/system', label: 'System', icon: Server, permission: 'overview.read' },
    ],
  },
];

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, can, signOut } = useSession();
  // The drawer remembers the page it was opened on, so navigating closes it.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawerOpen = drawerPath === pathname;
  const setDrawerOpen = (open: boolean) => setDrawerPath(open ? pathname : null);
  const role = normalizeRole(user.role);

  const sidebar = (
    <div className="flex h-full flex-col">
      <nav aria-label="Admin" className="flex-1 space-y-5 overflow-y-auto px-2 py-4">
        {GROUPS.map(group => {
          const items = group.items.filter(item => can(item.permission));
          if (items.length === 0) return null;
          return (
            <div key={group.label}>
              <p className="px-2.5 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-subtle">{group.label}</p>
              <ul className="space-y-0.5">
                {items.map(item => {
                  const active = isActive(pathname, item);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-base transition-colors',
                          active ? 'bg-sunken font-medium text-ink' : 'text-muted hover:bg-sunken/70 hover:text-ink',
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-line p-2">
        <Link href="/dashboard" className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-base text-muted hover:bg-sunken/70 hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to JobPingly
        </Link>
        <Dropdown
          label="Account menu"
          align="start"
          triggerClassName="mt-1 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-sunken/70"
          trigger={
            <>
              <UserAvatar name={user.name ?? user.email} src={user.avatarUrl} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{user.name ?? user.email}</span>
                <span className="block truncate text-xs text-subtle">{ROLE_LABELS[role]}</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-subtle" aria-hidden="true" />
            </>
          }
          header={
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted">Theme</span>
              <ThemeSwitcher />
            </div>
          }
          items={[{ label: 'Sign out', icon: <LogOut />, onSelect: signOut }]}
        />
      </div>
    </div>
  );

  const brand = (
    <Link href="/admin" className="inline-flex items-center gap-2 text-ink" aria-label="Admin overview">
      <LogoMark />
      <span className="text-md font-semibold tracking-tight">JobPingly</span>
      <Badge tone="outline">Admin</Badge>
    </Link>
  );

  return (
    <div className="min-h-dvh lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-14 items-center border-b border-line px-4">{brand}</div>
        {sidebar}
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-canvas/90 px-4 backdrop-blur lg:hidden">
        <IconButton label="Open navigation" onClick={() => setDrawerOpen(true)}>
          <Menu className="h-5 w-5" />
        </IconButton>
        {brand}
      </header>

      <Dialog open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Admin navigation" size="sm">
        <div className="-mx-5 -my-4 h-[70dvh]">{sidebar}</div>
      </Dialog>

      <main id="main" className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
