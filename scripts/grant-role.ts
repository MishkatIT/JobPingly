/**
 * Changes an account's role from the command line, for first-time setup or
 * when nobody can sign in to the admin panel.
 *
 *   npm run admin:grant -- person@example.com owner
 *   npm run admin:grant -- person@example.com admin
 *   npm run admin:grant -- person@example.com user      (removes staff access)
 *
 * Roles: user, support, moderator, admin, owner. The change is written to the
 * audit log (actor "system", via "cli"). The account must already exist (sign up
 * first). Demoting the last owner is refused.
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function main() {
  const [rawEmail, rawRole] = process.argv.slice(2);
  const { ROLES, ROLE_LABELS } = await import('../lib/auth/rbac');
  if (!rawEmail || !rawRole) {
    console.error(`Usage: npm run admin:grant -- <email> <${ROLES.join('|')}>`);
    process.exit(1);
  }
  const email = rawEmail.trim().toLowerCase();
  const role = rawRole.trim().toLowerCase();
  if (!(ROLES as readonly string[]).includes(role)) {
    console.error(`Unknown role "${rawRole}". Use one of: ${ROLES.join(', ')}.`);
    process.exit(1);
  }

  const { eq, sql } = await import('drizzle-orm');
  const { closeDb, db } = await import('../lib/db/client');
  const { users } = await import('../lib/db/schema');
  const { recordAudit } = await import('../lib/audit');
  const { invalidateSessionCache } = await import('../lib/auth/session');

  try {
    const [user] = await db.select({ id: users.id, role: users.role, emailVerified: users.emailVerified }).from(users).where(eq(users.email, email));
    if (!user) {
      console.error(`No account uses ${email}. Sign up first, then run this again.`);
      process.exitCode = 1;
      return;
    }
    if (user.role === role) {
      console.log(`${email} is already ${ROLE_LABELS[role as keyof typeof ROLE_LABELS]}. Nothing to do.`);
      return;
    }
    if (user.role === 'owner' && role !== 'owner') {
      const [{ owners }] = await db.select({ owners: sql<number>`count(*)::int` }).from(users).where(eq(users.role, 'owner'));
      if (owners <= 1) {
        console.error('This is the only owner. Make another account an owner first.');
        process.exitCode = 1;
        return;
      }
    }

    await db.update(users).set({ role }).where(eq(users.id, user.id));
    invalidateSessionCache(user.id);
    await recordAudit({
      action: 'user.role_change',
      // Not a signed-in staff member: shown as "system" with via=cli.
      actor: null,
      targetType: 'user',
      targetId: user.id,
      metadata: { email, from: user.role, to: role, via: 'cli' },
    });
    console.log(`${email}: ${user.role} -> ${role}.`);
    if (!user.emailVerified) console.warn('Note: this account has not verified its email address yet.');
  } finally {
    await closeDb();
  }
}

main().catch(error => {
  console.error('[admin:grant] Failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
