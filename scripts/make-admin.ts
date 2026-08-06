import { db } from '../lib/db/client';
import { users } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

async function promoteToAdmin() {
  const email = process.argv[2];
  if (!email) {
    console.log('Usage: npx tsx scripts/make-admin.ts <user-email>');
    process.exit(1);
  }

  const cleanEmail = email.toLowerCase().trim();
  const [updated] = await db.update(users)
    .set({ role: 'admin' })
    .where(eq(users.email, cleanEmail))
    .returning();

  if (updated) {
    console.log(`✅ Successfully promoted user '${updated.email}' (ID: ${updated.id}) to ADMIN role!`);
  } else {
    console.error(`❌ User with email '${cleanEmail}' not found in database.`);
  }

  process.exit(0);
}

promoteToAdmin();
