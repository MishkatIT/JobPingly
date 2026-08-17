import { POST, GET } from '../app/api/admin/frequency-enforcement/route';
import { NextRequest } from 'next/server';
import { db } from '../lib/db/client';
import { users } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { signAccessToken } from '../lib/auth/jwt';

async function testFrequencyApi() {
  try {
    const [admin] = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
    const token = await signAccessToken({ userId: admin.id, email: admin.email, role: 'admin' });

    // Test saving custom_5_days
    console.log('Testing POST custom_5_days...');
    const postReq = new NextRequest('http://localhost:3000/api/admin/frequency-enforcement', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ isEnforced: true, enforcedFrequency: 'custom_5_days' })
    });

    const postRes = await POST(postReq);
    const postJson = await postRes.json();
    console.log('POST Result:', postRes.status, postJson);

    // Test GET policy
    console.log('Testing GET policy...');
    const getReq = new NextRequest('http://localhost:3000/api/admin/frequency-enforcement', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const getRes = await GET(getReq);
    const getJson = await getRes.json();
    console.log('GET Result:', getRes.status, getJson);

  } catch (err: any) {
    console.error('Test Error:', err);
  } finally {
    process.exit(0);
  }
}

testFrequencyApi();
