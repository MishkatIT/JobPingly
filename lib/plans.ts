import { isStaff } from '@/lib/auth/rbac';
import { getSettings } from '@/lib/settings/store';

/**
 * Plans and usage limits.
 *
 * Billing is not connected: an administrator assigns a plan from the admin
 * panel. The structure is in place so a payment provider can later set
 * `users.plan` / `users.plan_expires_at` from a webhook without any other
 * part of the product changing.
 *
 * Free-plan limits are platform settings (Admin > Settings > Free plan limits);
 * paid-plan limits are fixed here.
 */

export const PLAN_IDS = ['free', 'pro', 'team'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface PlanLimits {
  lists: number;
  companiesPerList: number;
  keywordsPerAlert: number;
}

export const PLAN_INFO: Record<PlanId, { label: string; summary: string }> = {
  free: { label: 'Free', summary: 'For individual job seekers.' },
  pro: { label: 'Pro', summary: 'Higher limits for people tracking many employers.' },
  team: { label: 'Team', summary: 'For recruiters and career coaches who track many lists.' },
};

const PAID_LIMITS: Record<Exclude<PlanId, 'free'>, PlanLimits> = {
  pro: { lists: 50, companiesPerList: 250, keywordsPerAlert: 100 },
  team: { lists: 200, companiesPerList: 1000, keywordsPerAlert: 200 },
};

const UNLIMITED: PlanLimits = { lists: Infinity, companiesPerList: Infinity, keywordsPerAlert: 500 };

export function normalizePlan(plan: string | null | undefined): PlanId {
  return (PLAN_IDS as readonly string[]).includes(plan ?? '') ? (plan as PlanId) : 'free';
}

/** The plan in force: a paid plan whose end date has passed counts as free. */
export function effectivePlan(plan: string | null | undefined, expiresAt?: Date | string | null): PlanId {
  const id = normalizePlan(plan);
  if (id !== 'free' && expiresAt && new Date(expiresAt).getTime() <= Date.now()) return 'free';
  return id;
}

export async function getFreeLimits(): Promise<PlanLimits> {
  const settings = await getSettings(['limits.max_lists_per_user', 'limits.max_urls_per_list', 'limits.max_keywords_per_sub']);
  const toLimit = (value: number) => (value < 0 ? Infinity : value);
  return {
    lists: toLimit(settings['limits.max_lists_per_user']),
    companiesPerList: toLimit(settings['limits.max_urls_per_list']),
    keywordsPerAlert: Math.max(1, settings['limits.max_keywords_per_sub']),
  };
}

/** Effective limits for a user. Staff and quota-exempt accounts are not limited. */
export async function getLimits(user: { plan: string; role?: string; quotaExempt?: boolean; planExpiresAt?: Date | string | null }): Promise<PlanLimits> {
  if (user.quotaExempt || isStaff(user.role)) return UNLIMITED;
  const plan = effectivePlan(user.plan, user.planExpiresAt);
  return plan === 'free' ? getFreeLimits() : PAID_LIMITS[plan];
}

/** JSON-safe form (Infinity becomes null). */
export function serializeLimits(limits: PlanLimits) {
  const value = (n: number) => (Number.isFinite(n) ? n : null);
  return { lists: value(limits.lists), companiesPerList: value(limits.companiesPerList), keywordsPerAlert: value(limits.keywordsPerAlert) };
}

export function paidPlanLimits(): Record<Exclude<PlanId, 'free'>, PlanLimits> {
  return PAID_LIMITS;
}
