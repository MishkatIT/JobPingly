import { POST } from '../app/api/admin/emails/test/route';
import { GET } from '../app/api/admin/emails/logs/route';
import { NextRequest } from 'next/server';
import { db } from '../lib/db/client';
import { users } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { signAccessToken } from '../lib/auth/jwt';

async function runTest() {
  try {
    // 1. Get an admin user
    const [admin] = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
    if (!admin) {
      console.error('No admin user found!');
      process.exit(1);
    }
    console.log('Found Admin:', admin.email, admin.id);

    const token = await signAccessToken({ userId: admin.id, email: admin.email, role: 'admin' });

    // 2. Send test OTP email to hellomiskat@gmail.com
    console.log('Sending Test OTP email to hellomiskat@gmail.com...');
    const reqPost = new NextRequest('http://localhost:3000/api/admin/emails/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        toEmail: 'hellomiskat@gmail.com',
        template: 'otp'
      })
    });

    const resPost = await POST(reqPost);
    const postJson = await resPost.json();
    console.log('Send Test Email Result:', resPost.status, postJson);

    // 3. Query GET /api/admin/emails/logs
    console.log('Querying GET /api/admin/emails/logs...');
    const reqGet = new NextRequest('http://localhost:3000/api/admin/emails/logs?page=1&limit=15&type=all', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const resGet = await GET(reqGet);
    const getJson = await resGet.json();
    console.log('Get Email Logs Result:', resGet.status, JSON.stringify(getJson, null, 2));

  } catch (err: any) {
    console.error('Error during test:', err);
  } finally {
    process.exit(0);
  }
}

runTest();
