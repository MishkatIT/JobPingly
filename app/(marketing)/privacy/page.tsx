import type { Metadata } from 'next';
import Link from 'next/link';
import { ProsePage } from '@/components/marketing/prose-page';

export const metadata: Metadata = { title: 'Privacy', description: 'What JobPingly stores about you, why, and how to delete it.' };

export default function PrivacyPage() {
  return (
    <ProsePage title="Privacy" intro="A plain-language description of what JobPingly stores, why, and the choices you have." updated="16 November 2026">
      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Your account</strong>: email address, name, optional profile picture and profile links, time zone, and a one-way hash of your password (or your Google account ID
          if you sign in with Google). We never store your password itself.
        </li>
        <li>
          <strong>What you set up</strong>: your watchlists, the companies on them, your alert keywords and filters, and your notification preferences.
        </li>
        <li>
          <strong>Your tracker</strong>: jobs you save, their status, your notes and reminders.
        </li>
        <li>
          <strong>Sessions</strong>: for each device you sign in on, a description such as &ldquo;Chrome on Windows&rdquo;, the IP address, and when it was last used, so you can review and
          sign out devices.
        </li>
        <li>
          <strong>Email delivery records</strong>: which emails were sent to you, when, and whether they were delivered. The contents of security emails (verification codes, password
          reset links, invitations) are never stored.
        </li>
        <li>
          <strong>Security records</strong>: actions taken by administrators, such as suspending an account, are kept in an audit log.
        </li>
      </ul>

      <h2>What we do not do</h2>
      <ul>
        <li>We do not sell or rent your data, and we do not show advertising.</li>
        <li>There are no third-party analytics or tracking scripts on the site.</li>
        <li>Your watchlists are private unless you publish them. Alert keywords and your tracker are always private.</li>
      </ul>

      <h2>Cookies and local storage</h2>
      <p>
        JobPingly sets one cookie: your sign-in session. It cannot be read by scripts on the page. Your colour theme and dismissed announcements are remembered in your browser&apos;s
        local storage and never sent to us.
      </p>

      <h2>Services we rely on</h2>
      <ul>
        <li>
          <strong>Email delivery</strong> (Brevo) receives your email address and the content of the emails we send you.
        </li>
        <li>
          <strong>Hosting and database</strong> providers store the data described above.
        </li>
        <li>
          <strong>Google</strong>, only if you choose to sign in with Google.
        </li>
        <li>
          <strong>An AI language model</strong> may be used to read the text of public careers pages that cannot be read any other way. It receives only that public page text, never
          anything about you.
        </li>
      </ul>

      <h2>How long we keep things</h2>
      <p>
        Account data is kept while you have an account. Operational records are deleted automatically: scan history after about a month, email delivery records and closed jobs after
        about three months, and read notifications after about two months. Administrators can shorten these periods.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Turn off alert emails at any time in settings, or with the unsubscribe link in any alert.</li>
        <li>
          Download everything stored about your account from <Link href="/dashboard/settings/account">Settings &rsaquo; Account</Link>.
        </li>
        <li>Delete your account there too. Deletion is immediate and permanent and removes your watchlists, alerts and tracker.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Questions about your data? Use the <Link href="/help#contact">contact form</Link>.
      </p>
    </ProsePage>
  );
}
