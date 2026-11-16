/**
 * Creates a demo account with a watchlist on a LOCAL development database, so
 * the dashboard can be explored without signing up by email.
 *
 *   npm run seed:demo                 demo account (role: user)
 *   npm run seed:demo -- --owner      demo account with the owner role (admin panel)
 *
 * Account:   demo@jobpingly.test
 * Password:  SEED_DEMO_PASSWORD from .env.local, or "local-demo-password"
 *
 * The watchlist contains real, public job boards; nothing is invented. Their
 * jobs appear after the worker scans them (`npm run worker:once`).
 *
 * Refuses to run when NODE_ENV=production or when DATABASE_URL does not point
 * at this machine, unless --allow-remote is given. Safe to run repeatedly.
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd(), true);

const DEMO_EMAIL = 'demo@jobpingly.test';
const DEFAULT_PASSWORD = 'local-demo-password';
const DEMO_BOARDS = [
  { url: 'https://jobs.ashbyhq.com/linear', companyName: 'Linear' },
  { url: 'https://jobs.lever.co/palantir', companyName: 'Palantir' },
  { url: 'https://boards.greenhouse.io/stripe', companyName: 'Stripe' },
];

async function main() {
  const args = new Set(process.argv.slice(2));
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed demo data with NODE_ENV=production.');

  const databaseUrl = process.env.DATABASE_URL ?? '';
  const host = databaseUrl ? new URL(databaseUrl).hostname : 'localhost';
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host) && !args.has('--allow-remote')) {
    throw new Error(`DATABASE_URL points at ${host}, not this machine. Pass --allow-remote if that is really intended.`);
  }

  const { and, eq } = await import('drizzle-orm');
  const { closeDb, db } = await import('../lib/db/client');
  const { emailApprovals, listSubscriptions, lists, users } = await import('../lib/db/schema');
  const { hashPassword } = await import('../lib/auth/password');
  const { createList, updateAlertSettings } = await import('../lib/lists/service');
  const { loadListAccess } = await import('../lib/lists/access');
  const { addCompanyToList } = await import('../lib/companies/service');
  const { EMPTY_RULES } = await import('../lib/matching/rules');

  try {
    const password = process.env.SEED_DEMO_PASSWORD || DEFAULT_PASSWORD;
    const role = args.has('--owner') ? 'owner' : 'user';
    const passwordHash = await hashPassword(password);

    const [user] = await db
      .insert(users)
      .values({ email: DEMO_EMAIL, name: 'Demo User', passwordHash, emailVerified: true, role, timezone: 'Asia/Dhaka', onboardingCompletedAt: new Date() })
      .onConflictDoUpdate({ target: users.email, set: { passwordHash, emailVerified: true, role, isBlocked: false } })
      .returning();
    await db
      .insert(emailApprovals)
      .values({ email: DEMO_EMAIL, userId: user.id, status: 'approved', approvedAt: new Date() })
      .onConflictDoUpdate({ target: emailApprovals.email, set: { status: 'approved', userId: user.id } });

    const name = 'Demo: engineering roles';
    let [list] = await db.select().from(lists).where(and(eq(lists.userId, user.id), eq(lists.name, name)));
    if (!list) {
      const created = await createList({ id: user.id, plan: user.plan, role: user.role }, { name, description: 'Created by npm run seed:demo.', visibility: 'private' });
      [list] = await db.select().from(lists).where(eq(lists.id, created.id));
    }

    const access = await loadListAccess(list.id, user.id);
    if (!access) throw new Error('Could not open the demo watchlist.');
    for (const board of DEMO_BOARDS) {
      try {
        const added = await addCompanyToList(access, user.id, board);
        console.log(`  added ${added.name}${added.scanQueued ? ' (scan queued)' : ''}`);
      } catch (error) {
        console.log(`  ${board.companyName}: ${(error as Error).message}`);
      }
    }

    const [subscription] = await db.select().from(listSubscriptions).where(and(eq(listSubscriptions.userId, user.id), eq(listSubscriptions.listId, list.id)));
    if (!subscription?.matchRules) {
      await updateAlertSettings({ id: user.id, plan: user.plan, role: user.role }, access, {
        alertsEnabled: true,
        digestFrequency: 'inherit',
        rules: { ...EMPTY_RULES, include: [['engineer', 'developer']] },
      });
    }

    console.log(`\nDemo account ready: ${DEMO_EMAIL} (role: ${role}). Password: SEED_DEMO_PASSWORD or the default in scripts/seed-demo.ts.`);
    console.log('Next: run "npm run worker:once" to scan the demo companies, then sign in at /login.');
  } finally {
    await closeDb();
  }
}

main().catch(error => {
  console.error('[seed:demo]', error instanceof Error ? error.message : error);
  process.exit(1);
});
