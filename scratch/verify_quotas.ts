import { db } from '../lib/db/client';
import { sql, count } from 'drizzle-orm';
import { sentEmailLogs } from '../lib/db/schema';
import { getRedisClient } from '../lib/redis/client';

async function testQuotasAPI() {
  console.log('--- TESTING RESOURCE QUOTAS API INTEGRATION ---');

  // DB Size
  const sizeRes = await db.execute(sql`SELECT pg_database_size(current_database()) as size_bytes;`);
  const bytes = Number(sizeRes[0]?.size_bytes || 0);
  const dbSizeMB = Number((bytes / (1024 * 1024)).toFixed(2));

  // Table Sizes
  const tableRes = await db.execute(sql`
    SELECT 
      relname as table_name,
      pg_size_pretty(pg_total_relation_size(relid)) as size_formatted,
      pg_total_relation_size(relid) as size_bytes
    FROM pg_catalog.pg_statio_user_tables
    ORDER BY pg_total_relation_size(relid) DESC
    LIMIT 5;
  `);

  // Sent Emails Today
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [emailRes] = await db
    .select({ count: count() })
    .from(sentEmailLogs)
    .where(sql`${sentEmailLogs.createdAt} >= ${startOfDay.toISOString()}`);
  const todaySentEmails = Number(emailRes?.count || 0);

  // Redis Keys
  const redis = getRedisClient();
  const redisKeys = redis ? await redis.keys('*') : [];

  console.log('Quotas Payload Verification:');
  console.log({
    dbStorage: `${dbSizeMB} MB / 500 MB (${((dbSizeMB / 500) * 100).toFixed(1)}% used, ${500 - dbSizeMB} MB remaining)`,
    dbEgressEstimate: `${(dbSizeMB * 1.45).toFixed(2)} MB / 5,120 MB`,
    brevoDailyEmails: `${todaySentEmails} / 300 (${300 - todaySentEmails} remaining today)`,
    redisKeysCount: redisKeys.length,
    topTables: tableRes.map((r: any) => `${r.table_name}: ${r.size_formatted}`),
  });

  process.exit(0);
}

testQuotasAPI();
