import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app/app-shell';
import { SessionProvider } from '@/components/app/session';
import { requireServerUser, toClientUser } from '@/lib/auth/server';

export const metadata: Metadata = { title: { default: 'Dashboard', template: '%s · JobPingly' }, robots: { index: false } };

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireServerUser();
  return (
    <SessionProvider initialUser={toClientUser(user)}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
