import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/server';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  if (await getServerSession()) redirect(params.next && params.next.startsWith('/') && !params.next.startsWith('//') ? params.next : '/dashboard');
  return <LoginForm next={params.next ?? null} reason={params.reason ?? null} />;
}
