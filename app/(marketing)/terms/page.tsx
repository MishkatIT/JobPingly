import type { Metadata } from 'next';
import Link from 'next/link';
import { ProsePage } from '@/components/marketing/prose-page';

export const metadata: Metadata = { title: 'Terms', description: 'The terms for using JobPingly.' };

export default function TermsPage() {
  return (
    <ProsePage title="Terms of use" intro="The short version: use JobPingly to find jobs, be decent to other people and to the websites we read, and understand that job data comes from third parties." updated="16 November 2026">
      <h2>The service</h2>
      <p>
        JobPingly checks public careers pages and job boards that you choose and tells you about jobs that match your preferences. Job information belongs to the companies that
        publish it; we show it as found and link to the original posting. We cannot guarantee that every posting is found, that details are complete, or that a job is still open.
        Always apply on the company&apos;s own site.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Keep your sign-in details to yourself. You are responsible for activity on your account.</li>
        <li>Give an email address you control; alerts and security messages are sent there.</li>
        <li>You can delete your account at any time from settings.</li>
      </ul>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not use JobPingly to monitor pages you are not allowed to access, or to try to reach private networks or systems.</li>
        <li>Do not use automated means to create accounts, or to load the service beyond normal use.</li>
        <li>Public watchlists and suggestions must not contain spam, abuse, or misleading content. We may remove content or suspend accounts that break these rules.</li>
      </ul>

      <h2>Public watchlists</h2>
      <p>When you publish a watchlist, its name, description, companies and your display name become visible to anyone. You can make it private again at any time.</p>

      <h2>Availability and changes</h2>
      <p>
        We work to keep JobPingly running reliably but cannot promise it will always be available or error-free. Features and limits may change; we will mention significant changes on
        the site. Paid plans, if offered in future, will have their own terms shown before you pay.
      </p>

      <h2>Liability</h2>
      <p>JobPingly is provided as is. To the extent the law allows, we are not liable for missed opportunities, inaccurate third-party job data, or decisions you make based on it.</p>

      <h2>Contact</h2>
      <p>
        Questions about these terms? Use the <Link href="/help#contact">contact form</Link>.
      </p>
    </ProsePage>
  );
}
