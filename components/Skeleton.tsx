'use client';

import React from 'react';

export function ListSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="glass-card p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between space-y-4"
        >
          <div className="space-y-3">
            {/* Header Badge Skeleton */}
            <div className="flex items-center justify-between gap-2">
              <div className="h-5 w-24 bg-slate-200 dark:bg-slate-800 rounded-md"></div>
              <div className="h-4 w-12 bg-slate-200 dark:bg-slate-800 rounded-md"></div>
            </div>

            {/* Title & Description Skeleton */}
            <div className="space-y-2 pt-1">
              <div className="h-6 w-3/4 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
              <div className="h-3.5 w-full bg-slate-200 dark:bg-slate-800 rounded"></div>
              <div className="h-3.5 w-2/3 bg-slate-200 dark:bg-slate-800 rounded"></div>
            </div>

            {/* Badges Skeleton */}
            <div className="flex items-center gap-2 pt-2">
              <div className="h-5 w-16 bg-slate-200 dark:bg-slate-800 rounded-md"></div>
              <div className="h-5 w-16 bg-slate-200 dark:bg-slate-800 rounded-md"></div>
            </div>
          </div>

          {/* Footer Skeleton */}
          <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800"></div>
              <div className="h-3.5 w-20 bg-slate-200 dark:bg-slate-800 rounded"></div>
            </div>
            <div className="h-7 w-16 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListSkeletonTiles({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="glass-card p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between space-y-3"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded"></div>
            </div>
            <div className="h-5 w-3/4 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
            <div className="h-3 w-full bg-slate-200 dark:bg-slate-800 rounded"></div>
          </div>
          <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
            <div className="h-3.5 w-16 bg-slate-200 dark:bg-slate-800 rounded"></div>
            <div className="h-6 w-14 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListSkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="glass-panel rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm animate-pulse">
      <div className="p-4 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-3 px-2 border-b border-slate-100 dark:border-slate-800/60 last:border-0">
            <div className="space-y-1.5 w-1/3">
              <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-800 rounded"></div>
              <div className="h-3 w-1/2 bg-slate-200 dark:bg-slate-800 rounded"></div>
            </div>
            <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded"></div>
            <div className="h-5 w-20 bg-slate-200 dark:bg-slate-800 rounded-md"></div>
            <div className="h-7 w-20 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListSkeletonPagination() {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-slate-200 dark:border-slate-800/80 animate-pulse">
      <div className="h-4 w-40 bg-slate-200 dark:bg-slate-800 rounded"></div>
      <div className="flex items-center gap-2">
        <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
        <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
      </div>
    </div>
  );
}
