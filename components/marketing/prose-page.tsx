import type { ReactNode } from 'react';

/** Layout for long-form pages: help, legal, policies. */
export function ProsePage({ title, intro, updated, children }: { title: string; intro?: ReactNode; updated?: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 lg:py-20">
      <h1 className="text-4xl">{title}</h1>
      {intro && <p className="mt-4 text-md leading-7 text-muted">{intro}</p>}
      {updated && <p className="mt-3 text-sm text-subtle">Last updated {updated}</p>}
      <div className="prose-jp mt-10">{children}</div>
    </div>
  );
}
