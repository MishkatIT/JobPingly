import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/admin-shell';
import { SessionProvider } from '@/components/app/session';
import { requireServerStaff, toClientUser } from '@/lib/auth/server';

export const metadata: Metadata = { title: { default: 'Admin', template: '%s · Admin · JobPingly' }, robots: { index: false } };

/** Staff only. Every admin API checks permissions again on the server. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireServerStaff();
  return (
    <SessionProvider initialUser={toClientUser(user)}>
      <AdminShell>{children}</AdminShell>
    </SessionProvider>
  );
}
