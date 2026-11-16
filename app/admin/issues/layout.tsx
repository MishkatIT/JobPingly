import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/** Sets the browser tab title for this section; the page itself is a client component. */
export const metadata: Metadata = { title: 'Reported issues' };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
