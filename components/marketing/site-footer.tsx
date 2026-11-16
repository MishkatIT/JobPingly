'use client';

import Link from 'next/link';
import { LogoMark } from '@/components/brand/logo';
import { FeedbackDialog } from '@/components/app/feedback-dialog';
import { ThemeSwitcher } from '@/components/ui/theme';

const COLUMNS = [
  {
    heading: 'Product',
    links: [
      { href: '/#how-it-works', label: 'How it works' },
      { href: '/#supported', label: 'Supported job boards' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/discover', label: 'Public watchlists' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { href: '/help', label: 'Help center' },
      { href: '/bot', label: 'For website owners' },
      { href: '/api/health', label: 'Service status' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-content gap-10 px-5 py-12 lg:grid-cols-[1.4fr_repeat(3,1fr)] lg:px-8">
        <div className="max-w-xs">
          <div className="flex items-center gap-2 text-ink">
            <LogoMark />
            <span className="text-md font-semibold">JobPingly</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted">Job alerts from the careers pages of the companies you actually want to work for.</p>
          <FeedbackDialog
            signedIn={false}
            trigger={open => (
              <button type="button" onClick={open} className="mt-4 text-sm font-medium text-accent hover:text-accent-hover">
                Send feedback
              </button>
            )}
          />
        </div>
        {COLUMNS.map(column => (
          <div key={column.heading}>
            <h2 className="text-sm font-semibold text-ink">{column.heading}</h2>
            <ul className="mt-3 space-y-2">
              {column.links.map(link => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-content flex-col items-start justify-between gap-3 px-5 py-5 text-sm text-subtle sm:flex-row sm:items-center lg:px-8">
          <span>© {new Date().getFullYear()} JobPingly. Built by Md Mishkatul Islam.</span>
          <ThemeSwitcher />
        </div>
      </div>
    </footer>
  );
}
