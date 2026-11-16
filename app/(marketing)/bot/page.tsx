import type { Metadata } from 'next';
import Link from 'next/link';
import { ProsePage } from '@/components/marketing/prose-page';

export const metadata: Metadata = {
  title: 'JobPinglyBot: information for website owners',
  description: 'What JobPinglyBot fetches, how often, and how to control it with robots.txt.',
};

export default function BotPage() {
  return (
    <ProsePage title="JobPinglyBot" intro="Information for website owners about the crawler that reads careers pages for JobPingly users.">
      <h2>What it is</h2>
      <p>
        JobPingly lets people follow the job openings of companies they are interested in. JobPinglyBot reads those companies&apos; public careers pages and job boards so that people are
        told when a new job is posted. It identifies itself with this user agent:
      </p>
      <p>
        <code>JobPinglyBot/2.0 (+https://jobpingly.onrender.com/bot; job-alert monitor)</code>
      </p>

      <h2>What it fetches</h2>
      <ul>
        <li>The careers page address a user added, and the public job-board interface behind it when there is one (for example the Greenhouse or Lever job-board API).</li>
        <li>Your <code>robots.txt</code>, at most twice a day.</li>
        <li>Nothing behind a login, nothing private, and no personal data.</li>
      </ul>

      <h2>How often</h2>
      <p>
        Each careers page is checked once every few hours, however many people follow it. Requests to the same site are spaced out and limited to a small number at a time. If your
        site returns errors or asks the crawler to slow down (HTTP 429 with <code>Retry-After</code>), checks back off automatically.
      </p>

      <h2>Controlling access</h2>
      <p>JobPinglyBot follows the Robots Exclusion Protocol. To stop it reading your careers pages:</p>
      <pre className="not-prose overflow-x-auto rounded-md border border-line bg-sunken p-4 text-sm text-ink">{`User-agent: JobPinglyBot
Disallow: /careers`}</pre>
      <p>
        A page that robots.txt disallows is paused and its followers are told it can no longer be checked. Official job-board APIs from applicant tracking systems are designed to be
        read by third parties and are not subject to the company website&apos;s robots.txt.
      </p>

      <h2>Contact</h2>
      <p>
        If JobPinglyBot causes any problem for your site, please tell us through the <Link href="/help#contact">contact form</Link> and we will respond quickly.
      </p>
    </ProsePage>
  );
}
