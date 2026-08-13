import { db } from '../lib/db/client';
import { lists } from '../lib/db/schema';
import { isNull } from 'drizzle-orm';

async function test() {
  const result = await db.select().from(lists).where(isNull(lists.deletedAt)).limit(5);
  console.log(`Successfully queried active lists table! Count: ${result.length}`);
  process.exit(0);
}

test().catch(err => {
  console.error('Test query failed:', err);
  process.exit(1);
});
