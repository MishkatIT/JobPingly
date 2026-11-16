import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/** Sets the browser tab title; the page itself is a client component. */
export const metadata: Metadata = { title: 'Confirm your email', robots: { index: false } };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
