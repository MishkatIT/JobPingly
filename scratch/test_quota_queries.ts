import { db } from '../lib/db/client';
import { sql } from 'drizzle-orm';

async function testQuotaQueries() {
  console.log('--- TESTING QUOTA & METRIC QUERIES ---');

  // 1. Test Postgres Database Size
  try {
    const res = await db.execute(sql`SELECT pg_database_size(current_database()) as size_bytes;`);
    const sizeBytes = Number(res[0]?.size_bytes || 0);
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
    const freeTierLimitMB = 500;
    const remainingMB = Math.max(0, freeTierLimitMB - Number(sizeMB)).toFixed(2);
    const pctUsed = ((Number(sizeMB) / freeTierLimitMB) * 100).toFixed(1);

    console.log(`[Supabase DB Storage]`);
    console.log(`  - Used: ${sizeMB} MB / ${freeTierLimitMB} MB (${pctUsed}%)`);
    console.log(`  - Remaining: ${remainingMB} MB`);
  } catch (err: any) {
    console.error('[DB Size Error]', err.message);
  }

  // 2. Test Table Sizes breakdown
  try {
    const tableRes = await db.execute(sql`
      SELECT 
        relname as table_name,
        pg_size_pretty(pg_total_relation_size(relid)) as total_size,
        pg_total_relation_size(relid) as size_bytes
      FROM pg_catalog.pg_statio_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 5;
    `);

    console.log(`\n[Top Table Sizes]`);
    for (const row of tableRes) {
      console.log(`  - ${row.table_name}: ${row.total_size} (${row.size_bytes} bytes)`);
    }
  } catch (err: any) {
    console.error('[Table Size Error]', err.message);
  }

  process.exit(0);
}

testQuotaQueries();
