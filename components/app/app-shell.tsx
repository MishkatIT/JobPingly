'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Bell,
  Briefcase,
  Building2,
  ChevronDown,
  Compass,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  LogOut,
  Menu,
  Plus,
  Settings,
  Shield,
  SquareKanban,
} from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { Button, IconButton } from '@/components/ui/button';
import { Dialog, Dropdown } from '@/components/ui/overlay';
import { ThemeSwitcher } from '@/components/ui/theme';
import { cn } from '@/lib/client/cn';
import { useApi } from '@/lib/client/use-api';
import { AnnouncementBar } from '@/components/marketing/announcement';
import { AddCompanyDialog } from './add-company-dialog';
import { UserAvatar } from './bits';
import { FeedbackDialog } from './feedback-dialog';
import { useSession } from './session';

interface NavItem {
  href: string;
  label: string;
  icon: typeof Bell;
  exact?: boolean;
  badge?: number;
}

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLinks({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {items.map(item => {
        const active = isActive(pathname, item);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-base transition-colors',
                active ? 'bg-sunken font-medium text-ink' : 'text-muted hover:bg-sunken/70 hover:text-ink',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge ? (
                <span className="tabular rounded bg-accent px-1.5 text-2xs font-semibold text-accent-fg" aria-label={`${item.badge} unread`}>
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const { meta: unreadMeta } = useApi<unknown[]>('/api/notifications?unread=1&pageSize=1', { refreshInterval: 60_000 });
  const unread = Number(unreadMeta?.unread ?? 0);
  const isStaff = user.permissions.includes('admin.access');

  useEffect(() => setDrawerOpen(false), [pathname]);

  const primary: NavItem[] = [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
    { href: '/dashboard/jobs', label: 'Jobs', icon: Briefcase },
    { href: '/dashboard/tracker', label: 'Tracker', icon: SquareKanban },
    { href: '/dashboard/watchlists', label: 'Watchlists', icon: ListChecks },
    { href: '/dashboard/companies', label: 'Companies', icon: Building2 },
    { href: '/dashboard/notifications', label: 'Notifications', icon: Bell, badge: unread },
  ];
  const secondary: NavItem[] = [
    { href: '/discover', label: 'Discover watchlists', icon: Compass },
    { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    ...(isStaff ? [{ href: '/admin', label: 'Admin', icon: Shield }] : []),
  ];

  const sidebar = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-3 pt-4">
        <Button variant="primary" className="w-full" icon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
          Add company
        </Button>
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-2">
        <NavLinks items={primary} pathname={pathname} onNavigate={onNavigate} />
        <div className="my-3 border-t border-line" />
        <NavLinks items={secondary} pathname={pathname} onNavigate={onNavigate} />
      </nav>
      <div className="border-t border-line p-2">
        <FeedbackDialog
          signedIn
          trigger={open => (
            <button type="button" onClick={open} className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-base text-muted hover:bg-sunken/70 hover:text-ink">
              <LifeBuoy className="h-4 w-4" aria-hidden="true" />
              Feedback & help
            </button>
          )}
        />
        <Dropdown
          label="Account menu"
          align="start"
          triggerClassName="mt-1 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-sunken/70"
          trigger={
            <>
              <UserAvatar name={user.name ?? user.email} src={user.avatarUrl} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{user.name ?? 'Your account'}</span>
                <span className="block truncate text-xs text-subtle">{user.email}</span>
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
          items={[
            { label: 'Settings', icon: <Settings />, href: '/dashboard/settings' },
            { label: 'Help center', icon: <LifeBuoy />, href: '/help' },
            { label: 'Sign out', icon: <LogOut />, onSelect: signOut, separator: true },
          ]}
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-14 items-center border-b border-line px-4">
          <Logo href="/dashboard" />
        </div>
        {sidebar()}
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <IconButton label="Open navigation" onClick={() => setDrawerOpen(true)}>
            <Menu className="h-5 w-5" />
          </IconButton>
          <Logo href="/dashboard" />
        </div>
        <div className="flex items-center gap-1">
          <Link href="/dashboard/notifications" className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-sunken hover:text-ink" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
            <Bell className="h-5 w-5" aria-hidden="true" />
            {unread > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" aria-hidden="true" />}
          </Link>
          <IconButton label="Add company" variant="primary" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
          </IconButton>
        </div>
      </header>

      <Dialog open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Navigation" size="sm">
        <div className="-mx-5 -my-4 h-[70dvh]">{sidebar(() => setDrawerOpen(false))}</div>
      </Dialog>

      <AnnouncementBar />
      <main id="main" className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>

      <AddCompanyDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
