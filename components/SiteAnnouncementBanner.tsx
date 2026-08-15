'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Info, AlertTriangle, ShieldAlert, CheckCircle2, X, ArrowRight } from 'lucide-react';

export interface BannerConfig {
  enabled: boolean;
  message: string;
  type: 'info' | 'warning' | 'danger' | 'success';
  linkUrl?: string;
  linkText?: string;
  bannerId: string;
}

export function SiteAnnouncementBanner() {
  const [banner, setBanner] = useState<BannerConfig | null>(null);
  const [dismissed, setDismissed] = useState(true); // Default hidden until verified
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function loadBannerConfig() {
      try {
        const res = await fetch('/api/banner', { cache: 'no-store' });
        if (res.ok) {
          const data: BannerConfig = await res.json();
          if (data && data.enabled && data.message && data.message.trim()) {
            const savedDismissedId = localStorage.getItem('dismissed_banner_id');
            if (savedDismissedId !== data.bannerId) {
              setBanner(data);
              setDismissed(false);
            }
          }
        }
      } catch (err) {
        console.error('[SiteAnnouncementBanner Error]', err);
      } finally {
        setLoaded(true);
      }
    }

    loadBannerConfig();
  }, []);

  const handleDismiss = () => {
    if (banner?.bannerId) {
      try {
        localStorage.setItem('dismissed_banner_id', banner.bannerId);
      } catch {}
    }
    setDismissed(true);
  };

  if (!loaded || dismissed || !banner || !banner.enabled || !banner.message) {
    return null;
  }

  // Theme styling configurations
  const themeStyles = {
    info: {
      bg: 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white shadow-md border-b border-blue-500/30',
      icon: <Info className="w-4 h-4 shrink-0 text-blue-200" />,
      badge: 'bg-white/15 text-white border-white/20',
      btn: 'bg-white text-blue-700 hover:bg-blue-50 shadow-sm',
    },
    warning: {
      bg: 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white shadow-md border-b border-amber-400/30',
      icon: <AlertTriangle className="w-4 h-4 shrink-0 text-amber-100 animate-pulse" />,
      badge: 'bg-black/15 text-white border-white/20',
      btn: 'bg-slate-900 text-amber-300 hover:bg-slate-800 shadow-sm',
    },
    danger: {
      bg: 'bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 text-white shadow-md border-b border-rose-500/30',
      icon: <ShieldAlert className="w-4 h-4 shrink-0 text-rose-100" />,
      badge: 'bg-white/15 text-white border-white/20',
      btn: 'bg-white text-rose-700 hover:bg-rose-50 shadow-sm',
    },
    success: {
      bg: 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-md border-b border-emerald-500/30',
      icon: <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-100" />,
      badge: 'bg-white/15 text-white border-white/20',
      btn: 'bg-white text-emerald-800 hover:bg-emerald-50 shadow-sm',
    },
  };

  const theme = themeStyles[banner.type] || themeStyles.info;

  return (
    <aside
      aria-label="Site announcement"
      className={`relative z-[90] w-full px-4 py-2.5 sm:px-6 transition-all duration-300 animate-in fade-in slide-in-from-top-2 ${theme.bg}`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs sm:text-sm font-medium">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {theme.icon}
          <div className="truncate text-white font-semibold">
            <span>{banner.message}</span>
          </div>

          {banner.linkUrl && (
            <Link
              href={banner.linkUrl}
              className={`hidden sm:inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ml-2 ${theme.btn}`}
            >
              {banner.linkText || 'Learn More'}
              <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {banner.linkUrl && (
            <Link
              href={banner.linkUrl}
              className={`sm:hidden inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold transition-all ${theme.btn}`}
            >
              {banner.linkText || 'More'}
            </Link>
          )}

          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss announcement banner"
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-all cursor-pointer"
            title="Dismiss announcement (won't re-appear on refresh)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
