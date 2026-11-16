import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { THEME_BOOTSTRAP } from '@/components/ui/theme';
import { ToastProvider } from '@/components/ui/toast';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://jobpingly.onrender.com').replace(/\/+$/, '');

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: 'JobPingly · Job alerts from the careers pages you care about',
    template: '%s · JobPingly',
  },
  description:
    'JobPingly watches the careers pages of the companies you choose and emails you when a job that matches your keywords is posted. Works with Greenhouse, Lever, Ashby, Workday and ordinary company sites.',
  applicationName: 'JobPingly',
  icons: { icon: '/icon.svg' },
  openGraph: {
    type: 'website',
    siteName: 'JobPingly',
    title: 'JobPingly · Job alerts from the careers pages you care about',
    description: 'Pick the companies you want to work for. Get an email when they post a job that fits.',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafb' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0b0e' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint; static, contains no user data. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <a href="#main" className="sr-only-focusable fixed left-3 top-3 z-[70] rounded-md bg-ink px-3 py-2 text-sm font-medium text-canvas">
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
