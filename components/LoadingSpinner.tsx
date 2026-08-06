'use client';

import React from 'react';

interface LoadingProps {
  message?: string;
  fullPage?: boolean;
}

export default function LoadingSpinner({
  message = 'Loading data...',
  fullPage = true,
}: LoadingProps) {
  const content = (
    <div className="flex items-center gap-3.5 glass-panel px-7 py-4 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
      <div className="relative flex items-center justify-center shrink-0">
        <div className="w-6 h-6 border-2 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin" />
        <div className="absolute inset-0 rounded-full blur-sm bg-blue-500/20 animate-pulse" />
      </div>
      <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 tracking-wide">
        {message}
      </span>
    </div>
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-50/60 dark:bg-[#080c14]/60 backdrop-blur-sm">
        {content}
      </div>
    );
  }

  return (
    <div className="w-full py-12 flex items-center justify-center">
      {content}
    </div>
  );
}
