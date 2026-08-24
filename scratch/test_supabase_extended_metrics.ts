import { db } from '../lib/db/client';
import { sql } from 'drizzle-orm';

async function testExtendedSupabaseMetrics() {
  console.log('--- TESTING EXTENDED SUPABASE METRICS ---');

  // 1. Schema Sizes Breakdown
  try {
    const schemaRes = await db.execute(sql`
      SELECT 
        schemaname as schema_name,
        pg_size_pretty(sum(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)))) as size_formatted,
        sum(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)))::bigint as size_bytes
      FROM pg_tables
      GROUP BY schemaname
      ORDER BY sum(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) DESC;
    `);

    console.log('[Schema Sizes Breakdown]:');
    for (const r of schemaRes) {
      console.log(`  - ${r.schema_name}: ${r.size_formatted} (${r.size_bytes} bytes)`);
    }
  } catch (e: any) {
    console.error('[Schema Size Error]', e.message);
  }

  // 2. Active Postgres Connections
  try {
    const connRes = await db.execute(sql`SELECT count(*)::int as active_connections FROM pg_stat_activity;`);
    console.log(`\n[Active Postgres Connections]:`, connRes[0]?.active_connections);
  } catch (e: any) {
    console.error('[Connection Query Error]', e.message);
  }

  // 3. Installed Extensions
  try {
    const extRes = await db.execute(sql`SELECT extname, extversion FROM pg_extension ORDER BY extname ASC;`);
    console.log(`\n[Installed Postgres Extensions]:`, extRes.map((r: any) => `${r.extname} (v${r.extversion})`));
  } catch (e: any) {
    console.error('[Extension Error]', e.message);
  }

  // 4. Index Size vs Table Data Size
  try {
    const indexRes = await db.execute(sql`
      SELECT 
        pg_size_pretty(sum(pg_tablesize(quote_ident(schemaname) || '.' || quote_ident(tablename)))) as table_data_size,
        pg_size_pretty(sum(pg_indexes_size(quote_ident(schemaname) || '.' || quote_ident(tablename)))) as index_size
      FROM pg_tables
      WHERE schemaname = 'public';
    `);
    console.log(`\n[Public Schema Data vs Index Size]:`, indexRes[0]);
  } catch (e: any) {
    console.error('[Index Size Error]', e.message);
  }

  process.exit(0);
}

testExtendedSupabaseMetrics();
