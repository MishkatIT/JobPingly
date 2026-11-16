import Link from 'next/link';
import { cn } from '@/lib/client/cn';

/** The JobPingly mark: a target ring with a signal dot. Monochrome, inherits colour. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-6 w-6', className)} aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="6" className="fill-ink" />
      <circle cx="12" cy="12" r="5.25" fill="none" strokeWidth="1.75" className="stroke-canvas" />
      <circle cx="12" cy="12" r="1.9" className="fill-canvas" />
      <circle cx="17.6" cy="6.4" r="2.1" fill="rgb(var(--accent))" className="stroke-ink" strokeWidth="1.2" />
    </svg>
  );
}

export function Logo({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-2 rounded-md text-ink', className)} aria-label="JobPingly home">
      <LogoMark />
      <span className="text-md font-semibold tracking-tight">JobPingly</span>
    </Link>
  );
}
