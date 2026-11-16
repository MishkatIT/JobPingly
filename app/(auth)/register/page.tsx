import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/server';
import { getSetting } from '@/lib/settings/store';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Create your account' };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  if (await getServerSession()) redirect('/dashboard');
  const signupEnabled = await getSetting('auth.signup_enabled').catch(() => true);
  return <RegisterForm next={params.next ?? null} signupEnabled={signupEnabled} />;
}
