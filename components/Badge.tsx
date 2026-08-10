import React from 'react';
import { ShieldCheck, GitFork, Globe, Users, Building2, Briefcase, Award, CheckCircle2, Sparkles, ExternalLink } from 'lucide-react';

import { pluralize } from '@/lib/utils/pluralize';

export type BadgeVariant = 'canonical' | 'forked' | 'public' | 'company' | 'job' | 'follower' | 'curator' | 'role' | 'status' | 'outline';

interface BadgeProps {
  variant: BadgeVariant;
  children?: React.ReactNode;
  parentName?: string;
  count?: number;
  className?: string;
}

export function Badge({ variant, children, parentName, count, className = '' }: BadgeProps) {
  // Verified Canonical List
  if (variant === 'canonical') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-500/8 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20 text-[11px] font-medium tracking-tight shadow-[0_1px_3px_rgba(99,102,241,0.06)] ${className}`}>
        <ShieldCheck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
        <span>{children || 'Verified List'}</span>
      </span>
    );
  }

  // Public Curator Role
  if (variant === 'curator') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-blue-500/8 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[11px] font-medium tracking-tight ${className}`}>
        <Award className="w-3.5 h-3.5 text-blue-500 shrink-0" />
        <span>{children || 'Public Curator'}</span>
      </span>
    );
  }

  // Forked Lineage
  if (variant === 'forked') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-500/8 text-purple-600 dark:text-purple-300 border border-purple-500/20 text-[11px] font-medium tracking-tight ${className}`}>
        <GitFork className="w-3.5 h-3.5 text-purple-500 shrink-0" />
        <span>{children || `Forked from ${parentName || 'Parent'}`}</span>
      </span>
    );
  }

  // Public Directory Badge
  if (variant === 'public') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100/80 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80 text-[11px] font-medium tracking-tight ${className}`}>
        <Globe className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
        <span>{children || 'Public Directory'}</span>
      </span>
    );
  }

  // Companies Count Chip
  if (variant === 'company') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70 text-[11px] font-medium text-slate-600 dark:text-slate-300 ${className}`}>
        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>{count !== undefined ? pluralize(count, 'Company', 'Companies') : children}</span>
      </span>
    );
  }

  // Jobs Count Chip
  if (variant === 'job') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-blue-500/8 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[11px] font-medium ${className}`}>
        <Briefcase className="w-3.5 h-3.5 text-blue-500 shrink-0" />
        <span>{count !== undefined ? pluralize(count, 'Job', 'Jobs') : children}</span>
      </span>
    );
  }

  // Followers Count Chip
  if (variant === 'follower') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-500/8 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-medium ${className}`}>
        <Users className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        <span>{count !== undefined ? pluralize(count, 'Follower', 'Followers') : children}</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300 ${className}`}>
      {children}
    </span>
  );
}
