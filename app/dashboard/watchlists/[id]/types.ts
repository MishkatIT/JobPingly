import type { MatchRules } from '@/lib/matching/rules';

export interface ListDetail {
  list: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    visibility: 'private' | 'public';
    tags: string[];
    pinned: boolean;
    followers: number;
    featured: boolean;
    createdAt: string;
    updatedAt: string;
    owner: { id: string; name: string | null };
  };
  access: {
    role: 'owner' | 'moderator' | 'editor' | 'viewer';
    isFollowing: boolean;
    canEditCompanies: boolean;
    canEditDetails: boolean;
    canChangeVisibility: boolean;
    canManageMembers: boolean;
    canReviewSuggestions: boolean;
    canDelete: boolean;
  };
  subscription: { alertsEnabled: boolean; digestFrequency: string; rules: MatchRules; summary: string } | null;
  stats: { companies: number; openJobs: number; newThisWeek: number; issues: number; pendingSuggestions: number };
  limits: { companiesPerList: number | null };
}

export interface ListCompany {
  id: string;
  url: string;
  name: string;
  logoUrl: string | null;
  adapter: string | null;
  status: string;
  health: string;
  healthLabel: string;
  issue: { label: string; hint: string } | null;
  lastSuccessAt: string | null;
  lastScrapedAt: string | null;
  nextCheckAt: string | null;
  openJobs: number;
  newThisWeek: number;
  isPaused: boolean;
  category: string | null;
  notes: string | null;
}
