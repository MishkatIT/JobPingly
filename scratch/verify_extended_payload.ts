import { db } from '../lib/db/client';
import { sql } from 'drizzle-orm';

async function testExtendedPayload() {
  const schemaRes = await db.execute(sql`
    SELECT 
      schemaname as schema_name,
      pg_size_pretty(sum(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)))) as size_formatted,
      sum(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)))::bigint as size_bytes
    FROM pg_tables
    GROUP BY schemaname
    ORDER BY sum(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) DESC;
  `);

  const distRes = await db.execute(sql`
    SELECT 
      pg_size_pretty(sum(pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)))) as data_size,
      pg_size_pretty(sum(pg_indexes_size(quote_ident(schemaname) || '.' || quote_ident(tablename)))) as index_size
    FROM pg_tables
    WHERE schemaname = 'public';
  `);

  const connRes = await db.execute(sql`SELECT count(*)::int as active_connections FROM pg_stat_activity;`);

  console.log('Extended Payload Success:');
  console.log({
    schemas: schemaRes.map((r: any) => `${r.schema_name}: ${r.size_formatted}`),
    publicDistribution: { data: distRes[0]?.data_size, index: distRes[0]?.index_size },
    activeConnections: connRes[0]?.active_connections,
  });

  process.exit(0);
}

testExtendedPayload();
