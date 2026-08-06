import { db } from '../lib/db/client';
import { users } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

async function migrateExistingUsers() {
  console.log('[Migration] Updating pre-existing users to emailVerified = true...');
  try {
    const result = await db.update(users)
      .set({ emailVerified: true })
      .where(eq(users.emailVerified, false));

    console.log('[Migration] Existing users successfully updated to emailVerified = true.');
    process.exit(0);
  } catch (err) {
    console.error('[Migration Error] Failed to update existing users:', err);
    process.exit(1);
  }
}

migrateExistingUsers();
