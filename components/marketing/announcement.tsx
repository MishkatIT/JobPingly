'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import { cn } from '@/lib/client/cn';
import { useApi } from '@/lib/client/use-api';
import { useStoredString, writeStoredString } from '@/lib/client/use-storage';

interface Banner {
  enabled: boolean;
  id?: string;
  tone?: 'info' | 'success' | 'warning';
  message?: string;
  linkUrl?: string | null;
  linkText?: string | null;
}

const STORAGE_KEY = 'jp-dismissed-banner';

/** The site-wide announcement set in Admin > Settings. Dismissal is remembered per announcement. */
export function AnnouncementBar() {
  const { data } = useApi<Banner>('/api/banner');
  const dismissed = useStoredString('local', STORAGE_KEY);

  // `undefined` until hydrated: render nothing rather than flash a dismissed banner.
  if (!data?.enabled || !data.message || dismissed === undefined) return null;
  // Older banners were saved without an id; fall back to their content so
  // dismissing one does not hide every later announcement.
  const key = data.id || `${data.message}|${data.linkUrl ?? ''}`;
  if (dismissed === key) return null;

  const dismiss = () => writeStoredString('local', STORAGE_KEY, key);

  return (
    <div
      role="region"
      aria-label="Announcement"
      className={cn(
        'border-b text-sm',
        data.tone === 'warning' ? 'border-warning/25 bg-warning-soft' : data.tone === 'success' ? 'border-success/20 bg-success-soft' : 'border-accent/15 bg-accent-soft',
      )}
    >
      <div className="mx-auto flex max-w-content items-center gap-3 px-5 py-2 lg:px-8">
        <p className="min-w-0 flex-1 text-ink">
          {data.message}
          {data.linkUrl && (
            <>
              {' '}
              <Link href={data.linkUrl} className="font-medium text-accent underline-offset-2 hover:underline">
                {data.linkText || 'Learn more'}
              </Link>
            </>
          )}
        </p>
        <button type="button" onClick={dismiss} aria-label="Dismiss announcement" className="rounded p-1 text-muted hover:bg-black/5 hover:text-ink">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
