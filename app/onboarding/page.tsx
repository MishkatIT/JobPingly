import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/brand/logo';
import { safeNextPath } from '@/lib/auth/respond';
import { requireServerUser } from '@/lib/auth/server';
import { OnboardingFlow } from './flow';

export const metadata: Metadata = { title: 'Get started', robots: { index: false } };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await requireServerUser();
  const params = await searchParams;
  const next = safeNextPath(params.next) ?? '/dashboard';
  if (user.onboardingCompletedAt) redirect(next);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-5 py-5 lg:px-8">
        <Logo href="/dashboard" />
      </header>
      <main id="main" className="flex flex-1 justify-center px-5 pb-16 pt-4 sm:pt-10">
        <div className="w-full max-w-xl">
          <OnboardingFlow firstName={user.name?.split(' ')[0] ?? null} next={next} />
        </div>
      </main>
    </div>
  );
}
