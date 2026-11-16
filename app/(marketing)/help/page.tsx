import type { Metadata } from 'next';
import Link from 'next/link';
import { ProsePage } from '@/components/marketing/prose-page';
import { HelpContact } from './contact';

export const metadata: Metadata = {
  title: 'Help center',
  description: 'How to add companies, set up job alerts, track applications and share watchlists on JobPingly.',
};

const SECTIONS = [
  { id: 'getting-started', label: 'Getting started' },
  { id: 'adding-companies', label: 'Adding companies' },
  { id: 'alerts', label: 'Alerts and keywords' },
  { id: 'emails', label: 'Emails and schedules' },
  { id: 'tracker', label: 'Tracking applications' },
  { id: 'sharing', label: 'Sharing watchlists' },
  { id: 'troubleshooting', label: 'When a company is not working' },
  { id: 'account', label: 'Your account and data' },
  { id: 'contact', label: 'Contact' },
];

export default function HelpPage() {
  return (
    <ProsePage title="Help center" intro="Everything you need to get useful job alerts out of JobPingly.">
      <nav aria-label="On this page" className="not-prose mb-10 rounded-lg border border-line bg-surface p-4">
        <p className="mb-2 text-sm font-semibold text-ink">On this page</p>
        <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
          {SECTIONS.map(section => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="text-accent no-underline hover:underline">
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <h2 id="getting-started">Getting started</h2>
      <ol>
        <li>Create an account with your email or Google. We send a 6-digit code to confirm your email address.</li>
        <li>Create a watchlist, for example &ldquo;Dream companies&rdquo; or &ldquo;Remote fintech&rdquo;.</li>
        <li>Add the companies you want to work for (see below).</li>
        <li>Set your alert keywords and how often you want emails.</li>
      </ol>
      <p>
        From then on JobPingly checks each company every few hours. New jobs that match your keywords appear under <strong>Jobs &rsaquo; Matching</strong> and in your emails.
      </p>

      <h2 id="adding-companies">Adding companies</h2>
      <p>Paste the address of the company&apos;s careers page or job board. The best link is the job board itself, because it can be read exactly. Examples:</p>
      <ul>
        <li>
          <code>boards.greenhouse.io/companyname</code> or <code>job-boards.greenhouse.io/companyname</code>
        </li>
        <li>
          <code>jobs.lever.co/companyname</code>
        </li>
        <li>
          <code>jobs.ashbyhq.com/companyname</code>
        </li>
        <li>
          <code>companyname.wd5.myworkdayjobs.com/SiteName</code>
        </li>
        <li>SmartRecruiters, Workable, Recruitee, BambooHR, Personio and Pinpoint job boards</li>
        <li>Any company careers page, such as <code>company.com/careers</code></li>
      </ul>
      <p>
        Before you add a link, JobPingly shows which job board it detected and how many open jobs it can see, so you know it works. To add many companies at once, use{' '}
        <strong>Import</strong> on a watchlist and paste one link per line, or a CSV exported from another watchlist.
      </p>
      <p>
        When a company you add is already tracked by someone else, JobPingly reuses the existing record, so its jobs appear immediately. When it is new, the first check runs within a
        few minutes. Jobs that were already open at that first check are not announced as &ldquo;new&rdquo;; you can still see them all in the job feed.
      </p>

      <h2 id="alerts">Alerts and keywords</h2>
      <p>Each watchlist has its own alert settings. Open a watchlist and choose <strong>Alerts</strong>.</p>
      <ul>
        <li>
          <strong>Keywords</strong> match whole words in the job title, department and location: &ldquo;java&rdquo; matches &ldquo;Java Developer&rdquo; but not &ldquo;JavaScript&rdquo;. Spelling variants
          such as &ldquo;frontend&rdquo; and &ldquo;front-end&rdquo;, or &ldquo;Node.js&rdquo; and &ldquo;NodeJS&rdquo;, are treated as the same.
        </li>
        <li>
          <strong>Groups</strong>: a job must match at least one keyword from every group. &ldquo;react, vue&rdquo; plus a second group &ldquo;senior, lead&rdquo; means (react or vue) and
          (senior or lead).
        </li>
        <li>
          <strong>Exclude</strong> words that should never appear in a job title, such as &ldquo;intern&rdquo;.
        </li>
        <li>
          <strong>Filters</strong> for remote, hybrid or on-site; contract type; seniority; and locations. Many postings do not state these, so by default a job with an unknown value
          is still included.
        </li>
        <li>Leave everything empty to be alerted about every new job at the watchlist&apos;s companies.</li>
      </ul>
      <p>While editing, the panel shows how many of the watchlist&apos;s open jobs your rules match, with examples, so you can tune them before saving.</p>

      <h2 id="emails">Emails and schedules</h2>
      <p>
        In <Link href="/dashboard/settings/notifications">Settings &rsaquo; Notifications</Link> choose how often you want alert emails: instantly, every few hours, daily, a few times a
        week, weekly or monthly, at the time you pick, in your own time zone. A watchlist can override this, for example instant alerts for your top companies and a weekly digest for
        the rest.
      </p>
      <p>
        On some JobPingly installations a new email address must be approved by an administrator before alerts are sent. Your alerts are kept and delivered once it is approved. Every
        alert email has a one-click unsubscribe link.
      </p>

      <h2 id="tracker">Tracking applications</h2>
      <p>
        Save any job to your <Link href="/dashboard/tracker">Tracker</Link> and move it through Saved, Applied, Interviewing, Offer, Rejected or Withdrawn. Add notes and a reminder
        date; you will get a reminder notification (and an email, if you have alerts on). You can also add jobs you found elsewhere. You are told if a job you saved changes or is
        closed by the company. Export everything to CSV at any time.
      </p>

      <h2 id="sharing">Sharing watchlists</h2>
      <p>
        Make a watchlist public to give it a shareable page and list it in the <Link href="/discover">directory</Link>. Other people can follow it to get alerts with their own keywords,
        copy it as a starting point, or suggest companies for you to approve. You can also invite people to help maintain a watchlist as editors.
      </p>

      <h2 id="troubleshooting">When a company is not working</h2>
      <p>The Companies page shows the health of every company you watch:</p>
      <ul>
        <li>
          <strong>Healthy</strong>: checked successfully.
        </li>
        <li>
          <strong>Having trouble</strong>: recent checks failed; JobPingly keeps retrying, less often each time.
        </li>
        <li>
          <strong>Failing</strong> or <strong>Paused</strong>: the page could not be read repeatedly. The reason is shown, for example that the page moved or that the site blocks automated
          visitors.
        </li>
      </ul>
      <p>
        The most common fix is to replace the link with the company&apos;s job-board link: open the company, choose <strong>Change link</strong>, and paste it. A few careers pages
        build their job list entirely inside the browser; those cannot be read directly, but they almost always use one of the supported job boards underneath.
      </p>

      <h2 id="account">Your account and data</h2>
      <p>
        In <Link href="/dashboard/settings">Settings</Link> you can change your name and password, see and sign out the devices you are signed in on, download all of your data as a
        file, and delete your account permanently. See the <Link href="/privacy">privacy notice</Link> for what is stored.
      </p>

      <h2 id="contact">Contact</h2>
      <p>Found a problem, missing a feature, or need higher limits? Send us a message and we will get back to you by email.</p>
      <HelpContact />
    </ProsePage>
  );
}
