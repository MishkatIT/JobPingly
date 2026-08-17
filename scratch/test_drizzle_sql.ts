import { db } from '../lib/db/client';
import { sentEmailLogs } from '../lib/db/schema';
import { desc, eq, inArray, ilike, or, and, sql, isNotNull, isNull } from 'drizzle-orm';

async function testSql() {
  try {
    const adminCond = or(inArray(sentEmailLogs.templateType, ['broadcast', 'test', 'admin_custom']), isNotNull(sentEmailLogs.senderId));
    const q1 = db.select().from(sentEmailLogs).where(adminCond).toSQL();
    console.log('Query 1 SQL (with isNotNull):', q1.sql, 'Params:', q1.params);

    const rawCond = or(inArray(sentEmailLogs.templateType, ['broadcast', 'test', 'admin_custom']), sql`${sentEmailLogs.senderId} IS NOT NULL`);
    const q2 = db.select().from(sentEmailLogs).where(rawCond).toSQL();
    console.log('Query 2 SQL (with sql template):', q2.sql, 'Params:', q2.params);

  } catch (err: any) {
    console.error('SQL test error:', err);
  } finally {
    process.exit(0);
  }
}

testSql();
