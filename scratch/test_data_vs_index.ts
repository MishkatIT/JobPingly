import { db } from '../lib/db/client';
import { sql } from 'drizzle-orm';

async function testIndexVsData() {
  const indexRes = await db.execute(sql`
    SELECT 
      pg_size_pretty(sum(pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)))) as data_size,
      pg_size_pretty(sum(pg_indexes_size(quote_ident(schemaname) || '.' || quote_ident(tablename)))) as index_size
    FROM pg_tables
    WHERE schemaname = 'public';
  `);
  console.log('[Public Schema Data vs Index Size]:', indexRes[0]);
  process.exit(0);
}

testIndexVsData();
