import { db } from '../lib/db/client';
import { users, lists, careerPages, jobs, sentEmailLogs } from '../lib/db/schema';
import { redisGet, redisSet, redisDel, getRedisClient } from '../lib/redis/client';
import { count } from 'drizzle-orm';

async function runDiagnostics() {
  console.log('=== STARTING DB & REDIS DIAGNOSTICS ===\n');

  // 1. Test DB Connection & Basic Query
  try {
    const startDb = performance.now();
    const [userCountRes] = await db.select({ count: count() }).from(users);
    const dbDuration = (performance.now() - startDb).toFixed(2);
    console.log(`[DB] Connected successfully! Total users: ${userCountRes?.count ?? 0} (took ${dbDuration}ms)`);
  } catch (err: any) {
    console.error('[DB] Connection Error:', err.message);
  }

  // 2. Test DB Query Egress Safeguards (checking counts of heavy tables)
  try {
    const [jobCount] = await db.select({ count: count() }).from(jobs);
    const [logCount] = await db.select({ count: count() }).from(sentEmailLogs);
    const [pageCount] = await db.select({ count: count() }).from(careerPages);
    const [listCount] = await db.select({ count: count() }).from(lists);

    console.log(`[DB Table Stats]`);
    console.log(`  - jobs count: ${jobCount?.count}`);
    console.log(`  - sent_email_logs count: ${logCount?.count}`);
    console.log(`  - career_pages count: ${pageCount?.count}`);
    console.log(`  - lists count: ${listCount?.count}`);
  } catch (err: any) {
    console.error('[DB Stats Error]:', err.message);
  }

  // 3. Test Redis Connection & Key operations
  try {
    const redisClient = getRedisClient();
    if (!redisClient) {
      console.log('\n[Redis] Upstash Redis credentials (UPSTASH_REDIS_REST_URL/TOKEN) not set or client unavailable.');
    } else {
      const startRedis = performance.now();
      const testKey = 'test:egress_probe';
      const testValue = { timestamp: Date.now(), status: 'ok' };

      const setOk = await redisSet(testKey, testValue, 30);
      const retrieved = await redisGet<{ timestamp: number; status: string }>(testKey);
      const delOk = await redisDel(testKey);
      const redisDuration = (performance.now() - startRedis).toFixed(2);

      if (setOk && retrieved?.status === 'ok' && delOk) {
        console.log(`\n[Redis] Connected and working properly! SET/GET/DEL test passed (took ${redisDuration}ms)`);
      } else {
        console.log(`\n[Redis] Test performed but results incomplete. SET: ${setOk}, GET: ${JSON.stringify(retrieved)}, DEL: ${delOk}`);
      }
    }
  } catch (err: any) {
    console.error('\n[Redis] Connection Error:', err.message);
  }

  console.log('\n=== DIAGNOSTICS COMPLETE ===');
  process.exit(0);
}

runDiagnostics();
