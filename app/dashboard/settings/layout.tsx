import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/ui/primitives';
import { SettingsNav } from './settings-nav';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
        <SettingsNav />
        <div className="min-w-0 max-w-2xl space-y-6">{children}</div>
      </div>
    </>
  );
}
