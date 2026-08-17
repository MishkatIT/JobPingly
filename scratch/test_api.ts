import { db } from '../lib/db/client';
import { sentEmailLogs } from '../lib/db/schema';
import { desc, eq, inArray, ilike, or, and, sql, isNotNull, isNull } from 'drizzle-orm';

async function testQuery() {
  try {
    console.log('Testing Drizzle ORM queries...');
    
    // 1. All logs
    const allLogs = await db.select().from(sentEmailLogs).orderBy(desc(sentEmailLogs.createdAt));
    console.log('All logs count:', allLogs.length);

    // 2. Admin dispatched query (with type=admin_all)
    const adminCond = or(inArray(sentEmailLogs.templateType, ['broadcast', 'test', 'admin_custom']), isNotNull(sentEmailLogs.senderId));
    const adminLogs = await db.select().from(sentEmailLogs).where(adminCond).orderBy(desc(sentEmailLogs.createdAt));
    console.log('Admin logs count (admin_all):', adminLogs.length);

    // 3. OTP query (with type=otp)
    const otpLogs = await db.select().from(sentEmailLogs).where(eq(sentEmailLogs.templateType, 'otp')).orderBy(desc(sentEmailLogs.createdAt));
    console.log('OTP logs count (otp):', otpLogs.length);

  } catch (err: any) {
    console.error('Drizzle Query Error:', err);
  } finally {
    process.exit(0);
  }
}

testQuery();
