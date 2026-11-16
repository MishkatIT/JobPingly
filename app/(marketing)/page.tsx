import Link from 'next/link';
import { ArrowRight, BellRing, Check, Eye, FileSearch, ListChecks, Share2, ShieldCheck } from 'lucide-react';
import { CompanyAvatar, JobFacets } from '@/components/app/bits';
import { LinkButton } from '@/components/ui/button';
import { formatNumber, formatRelative } from '@/lib/client/format';
import { latestPublicJobs, platformStats } from '@/lib/public/directory';

// Rebuilt at most every 10 minutes: fast for visitors, never more than a few minutes stale.
export const revalidate = 600;

/** Figures are only shown once they are large enough to mean something. */
const STATS_THRESHOLD = 25;

const BOARDS = ['Greenhouse', 'Lever', 'Ashby', 'Workday', 'SmartRecruiters', 'Workable', 'Recruitee', 'BambooHR', 'Personio', 'Pinpoint'];

async function loadHomeData() {
  try {
    const [stats, jobs] = await Promise.all([platformStats(), latestPublicJobs(6)]);
    return { stats, jobs };
  } catch {
    // The page must render even if the database is unreachable during a build.
    return { stats: null, jobs: [] };
  }
}

export default async function HomePage() {
  const { stats, jobs } = await loadHomeData();

  return (
    <>
      {/* Hero */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-content gap-12 px-5 pb-16 pt-14 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:px-8 lg:pb-20 lg:pt-20">
          <div>
            <p className="text-sm font-medium text-accent">Job alerts, straight from the source</p>
            <h1 className="mt-3 text-4xl leading-[1.08] sm:text-5xl">Hear about jobs at the companies you want, the day they are posted.</h1>
            <p className="mt-5 max-w-prose text-md leading-7 text-muted">
              Add the careers pages of companies you would love to work for. JobPingly checks them every few hours and emails you when a role that matches your
              keywords appears. No job-board noise, no reposts, no recruiters.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <LinkButton href="/register" variant="primary" size="lg" iconRight={<ArrowRight className="h-4 w-4" />}>
                Start watching companies
              </LinkButton>
              <LinkButton href="/discover" size="lg">
                Browse public watchlists
              </LinkButton>
            </div>
            <p className="mt-5 text-sm text-subtle">Free to use. No credit card. Works with Greenhouse, Lever, Ashby, Workday and most company websites.</p>
          </div>

          <ProductPreview jobs={jobs} />
        </div>
      </section>

      {stats && stats.companies >= STATS_THRESHOLD && (
        <section aria-label="JobPingly in numbers" className="border-b border-line bg-surface">
          <dl className="mx-auto grid max-w-content grid-cols-2 gap-px px-5 lg:grid-cols-4 lg:px-8">
            {[
              { label: 'Companies monitored', value: stats.companies },
              { label: 'Open jobs tracked right now', value: stats.openJobs },
              { label: 'New jobs found in the last 30 days', value: stats.jobsLast30Days },
              { label: 'Public watchlists', value: stats.publicLists },
            ].map(item => (
              <div key={item.label} className="py-6">
                <dt className="text-sm text-muted">{item.label}</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink">{formatNumber(item.value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 border-b border-line">
        <div className="mx-auto max-w-content px-5 py-20 lg:px-8">
          <h2 className="max-w-xl text-3xl">How it works</h2>
          <p className="mt-3 max-w-prose text-md text-muted">Three steps, about two minutes. After that JobPingly does the checking.</p>
          <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
            {[
              {
                icon: ListChecks,
                title: 'Add the companies',
                body: 'Paste a careers page or job-board link. JobPingly recognises the job board behind it, shows you the jobs it can see, and adds it to a watchlist.',
              },
              {
                icon: FileSearch,
                title: 'Say what you are looking for',
                body: 'Keywords such as "frontend" or "data engineer", words to exclude, and preferences for remote work, seniority, contract type and location.',
              },
              {
                icon: BellRing,
                title: 'Get the right jobs, on your schedule',
                body: 'An instant alert or a daily or weekly digest at the time you choose, in your time zone. Every alert tells you why the job matched.',
              },
            ].map((step, index) => (
              <li key={step.title}>
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-sm font-semibold text-ink">{index + 1}</span>
                  <step.icon className="h-4 w-4 text-subtle" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-lg">{step.title}</h3>
                <p className="mt-2 text-base leading-6 text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Why */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto max-w-content px-5 py-20 lg:px-8">
          <h2 className="max-w-2xl text-3xl">Built for people who know where they want to work</h2>
          <div className="mt-12 grid gap-x-10 gap-y-12 md:grid-cols-2">
            <Feature icon={Eye} title="The posting itself, not a repost">
              JobPingly reads each company&apos;s own job board, so you see the original listing with the real application link, rather than a copy on an aggregator.
            </Feature>
            <Feature icon={Check} title="Alerts you can trust">
              Keywords match whole words, so &ldquo;Java&rdquo; does not match &ldquo;JavaScript&rdquo;. A job is never announced twice, even when a company moves its careers site, and
              each alert explains which of your keywords it matched.
            </Feature>
            <Feature icon={ListChecks} title="Track every application">
              Save interesting jobs, move them through applied, interviewing and offer, keep notes, set reminders, and export the lot to a spreadsheet. You will also hear if a
              job you saved changes or closes.
            </Feature>
            <Feature icon={Share2} title="Share what you are watching">
              Publish a watchlist (say, &ldquo;Remote-friendly fintech in Bangladesh&rdquo;) for others to follow, follow lists curated by others, and suggest companies they missed.
            </Feature>
          </div>
        </div>
      </section>

      {/* Supported */}
      <section id="supported" className="scroll-mt-20 border-b border-line">
        <div className="mx-auto grid max-w-content gap-10 px-5 py-20 lg:grid-cols-[1fr_1.2fr] lg:px-8">
          <div>
            <h2 className="text-3xl">Works with the job boards companies actually use</h2>
            <p className="mt-3 text-md leading-7 text-muted">
              Most companies publish jobs through an applicant tracking system. JobPingly reads these directly through their public job-board interfaces, which is fast and exact.
              For everything else it reads the company&apos;s careers page itself.
            </p>
          </div>
          <div>
            <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
              {BOARDS.map(board => (
                <li key={board} className="flex items-center gap-2 bg-surface px-4 py-3 text-base text-ink">
                  <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                  {board}
                </li>
              ))}
              <li className="col-span-2 bg-surface px-4 py-3 text-base text-muted sm:col-span-1">+ company careers pages</li>
            </ul>
            <p className="mt-4 text-sm leading-6 text-muted">
              A few careers pages build their job list entirely inside the browser and expose nothing else to read. JobPingly tells you when that happens, and the company&apos;s
              job-board link almost always works instead.
            </p>
          </div>
        </div>
      </section>

      {/* Respectful */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-content flex-col gap-6 px-5 py-14 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="flex max-w-2xl gap-4">
            <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
            <div>
              <h2 className="text-lg">A polite visitor</h2>
              <p className="mt-1 text-base leading-6 text-muted">
                JobPingly identifies itself, follows robots.txt, spaces out requests to each site and checks each company once, no matter how many people follow it.
              </p>
            </div>
          </div>
          <Link href="/bot" className="text-base font-medium text-accent hover:text-accent-hover">
            Information for website owners
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-content gap-10 px-5 py-20 lg:grid-cols-[1fr_1.6fr] lg:px-8">
          <h2 className="text-3xl">Questions</h2>
          <dl className="divide-y divide-line border-y border-line">
            {[
              ['How often are companies checked?', 'Every three hours by default. Companies that are having trouble are retried less often until they recover, and you can ask for a fresh check at any time.'],
              ['Is it free?', 'Yes. The free plan covers what most job seekers need. If you track a very large number of companies, contact us about higher limits.'],
              ['Will I get the same job twice?', 'No. Each job is identified by the job board’s own ID, its link, and its title and location, so it is recognised even when one of those changes.'],
              ['What if the company does not use a job board?', 'JobPingly reads structured job data and the careers page itself. If a page cannot be read, it says so on the company and suggests what to try instead.'],
              ['Can other people see my watchlists?', 'No. Watchlists are private unless you choose to publish one. Your alert keywords and your application tracker are always private.'],
              ['Does JobPingly apply to jobs for me?', 'No. It finds and tracks jobs; applying is up to you, on the company’s own site.'],
            ].map(([question, answer]) => (
              <div key={question} className="py-5">
                <dt className="text-md font-medium text-ink">{question}</dt>
                <dd className="mt-2 text-base leading-6 text-muted">{answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="mx-auto flex max-w-content flex-col items-start justify-between gap-6 px-5 py-16 md:flex-row md:items-center lg:px-8">
          <div>
            <h2 className="text-2xl">Pick five companies. Let JobPingly watch them.</h2>
            <p className="mt-2 text-md text-muted">It takes about two minutes to set up.</p>
          </div>
          <LinkButton href="/register" variant="primary" size="lg" iconRight={<ArrowRight className="h-4 w-4" />}>
            Create your free account
          </LinkButton>
        </div>
      </section>
    </>
  );
}

function Feature({ icon: Icon, title, children }: { icon: typeof Eye; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <Icon className="mt-1 h-5 w-5 shrink-0 text-ink" aria-hidden="true" />
      <div>
        <h3 className="text-lg">{title}</h3>
        <p className="mt-2 text-base leading-6 text-muted">{children}</p>
      </div>
    </div>
  );
}

interface PreviewJob {
  id: string;
  title: string;
  location: string | null;
  workplaceType: string | null;
  employmentType: string | null;
  firstSeenAt: Date;
  companyName: string;
  logoUrl: string | null;
}

/** A view of the job feed. Uses real, recently discovered jobs from public watchlists when there are any. */
/** Shown only until enough real public jobs exist; clearly captioned as an example. */
const ILLUSTRATIVE_ROWS: (Omit<PreviewJob, 'firstSeenAt'> & { seen: string })[] = [
  { id: '1', title: 'Senior Frontend Engineer', companyName: 'Example Pay', location: 'Remote, Asia', workplaceType: 'remote', employmentType: 'full_time', seen: '42 minutes ago', logoUrl: null },
  { id: '2', title: 'Data Engineer', companyName: 'Example Commerce', location: 'Dhaka', workplaceType: 'hybrid', employmentType: 'full_time', seen: '3 hours ago', logoUrl: null },
  { id: '3', title: 'Product Designer', companyName: 'Example Labs', location: 'Berlin', workplaceType: 'onsite', employmentType: 'full_time', seen: '9 hours ago', logoUrl: null },
  { id: '4', title: 'Backend Engineer, Payments', companyName: 'Example Pay', location: 'Remote', workplaceType: 'remote', employmentType: 'contract', seen: 'yesterday', logoUrl: null },
];

function ProductPreview({ jobs }: { jobs: PreviewJob[] }) {
  const live = jobs.length >= 3;
  const rows = live ? jobs.map(job => ({ ...job, seen: formatRelative(job.firstSeenAt) })) : ILLUSTRATIVE_ROWS;

  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-surface shadow-md">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex gap-4 text-sm">
          <span className="border-b-2 border-ink pb-2.5 font-medium text-ink">Matching</span>
          <span className="pb-2.5 text-muted">New this week</span>
          <span className="pb-2.5 text-muted">All open</span>
        </div>
      </div>
      <ul className="divide-y divide-line">
        {rows.slice(0, 5).map(job => (
          <li key={job.id} className="flex items-start gap-3 px-4 py-3.5">
            <CompanyAvatar name={job.companyName} logoUrl={job.logoUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-medium text-ink">{job.title}</p>
              <p className="mt-0.5 truncate text-sm text-muted">
                {job.companyName}
                {job.location ? ` · ${job.location}` : ''}
              </p>
              <JobFacets workplaceType={job.workplaceType} employmentType={job.employmentType} className="mt-2" />
            </div>
            <span className="shrink-0 text-xs text-subtle">{job.seen}</span>
          </li>
        ))}
      </ul>
      <figcaption className="border-t border-line bg-sunken/60 px-4 py-2.5 text-xs text-muted">
        {live ? 'Live: the latest jobs JobPingly found at companies on public watchlists.' : 'Example of the job feed. Company names are illustrative.'}
      </figcaption>
    </figure>
  );
}
