import type { Metadata } from 'next';
import { Check } from 'lucide-react';
import { LinkButton } from '@/components/ui/button';
import { getFreeLimits, paidPlanLimits, type PlanLimits } from '@/lib/plans';

export const revalidate = 600;

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'JobPingly is free to use. Higher limits for people and teams who track many companies are available on request.',
};

const FALLBACK: PlanLimits = { lists: 10, companiesPerList: 25, keywordsPerAlert: 20 };

function describe(limit: number, unit: string) {
  return Number.isFinite(limit) ? `${limit.toLocaleString('en-US')} ${unit}` : `Unlimited ${unit}`;
}

export default async function PricingPage() {
  let free = FALLBACK;
  try {
    free = await getFreeLimits();
  } catch {
    free = FALLBACK;
  }
  const paid = paidPlanLimits();

  const plans = [
    {
      name: 'Free',
      price: 'Free',
      note: 'For individual job seekers',
      limits: free,
      cta: { href: '/register', label: 'Create your account', primary: true },
    },
    {
      name: 'Pro',
      price: 'On request',
      note: 'For people tracking many employers',
      limits: paid.pro,
      cta: { href: '/help#contact', label: 'Ask about Pro', primary: false },
    },
    {
      name: 'Team',
      price: 'On request',
      note: 'For recruiters, coaches and placement cells',
      limits: paid.team,
      cta: { href: '/help#contact', label: 'Talk to us', primary: false },
    },
  ];

  const shared = [
    'Every supported job board and careers page',
    'Instant alerts or scheduled digests, in your time zone',
    'Keyword, location, remote and seniority filters',
    'Application tracker with notes, reminders and CSV export',
    'Public and shared watchlists',
  ];

  return (
    <div className="mx-auto max-w-content px-5 py-16 lg:px-8 lg:py-20">
      <div className="max-w-2xl">
        <h1 className="text-4xl">Pricing</h1>
        <p className="mt-4 text-md leading-7 text-muted">
          JobPingly is free. The free plan has everything most job seekers need. If you need to track more companies than it allows, higher limits are available on request.
          There is no payment step on the site today.
        </p>
      </div>

      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        {plans.map(plan => (
          <section key={plan.name} className="flex flex-col rounded-xl border border-line bg-surface p-6" aria-labelledby={`plan-${plan.name}`}>
            <h2 id={`plan-${plan.name}`} className="text-lg">
              {plan.name}
            </h2>
            <p className="mt-1 text-sm text-muted">{plan.note}</p>
            <p className="mt-6 text-3xl font-semibold text-ink">{plan.price}</p>
            <ul className="mt-6 space-y-2.5 text-base text-ink">
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                {describe(plan.limits.lists, 'watchlists')}
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                {describe(plan.limits.companiesPerList, 'companies per watchlist')}
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                {describe(plan.limits.keywordsPerAlert, 'keywords per alert')}
              </li>
            </ul>
            <div className="mt-auto pt-8">
              <LinkButton href={plan.cta.href} variant={plan.cta.primary ? 'primary' : 'secondary'} className="w-full">
                {plan.cta.label}
              </LinkButton>
            </div>
          </section>
        ))}
      </div>

      <div className="mt-12 rounded-xl border border-line bg-surface p-6">
        <h2 className="text-lg">Included in every plan</h2>
        <ul className="mt-4 grid gap-2.5 text-base text-ink sm:grid-cols-2">
          {shared.map(item => (
            <li key={item} className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
