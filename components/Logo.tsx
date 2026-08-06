import Link from 'next/link';

export function Logo({ href = '/', className = '' }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-2.5 group ${className}`}>
      {/* Solid Icon Badge - No gradient */}
      <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform shrink-0">
        <svg
          className="w-5 h-5 fill-current"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Radar ping target with briefcase handle */}
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v2h-2zm0 4h2v6h-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </div>

      {/* Solid Brand Text - No gradient */}
      <span className="font-bold text-xl tracking-tight text-slate-900 dark:text-white">
        JobPingly
      </span>
    </Link>
  );
}
