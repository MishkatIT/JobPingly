import { GET } from '../app/api/admin/emails/logs/route';
import { NextRequest } from 'next/server';

async function testApiRoute() {
  try {
    console.log('Testing GET /api/admin/emails/logs endpoint...');
    const req = new NextRequest('http://localhost:3000/api/admin/emails/logs?page=1&limit=15&type=all');
    const res = await GET(req);
    console.log('HTTP Status:', res.status);
    const json = await res.json();
    console.log('Response JSON:', JSON.stringify(json, null, 2));
  } catch (err: any) {
    console.error('API Error:', err);
  } finally {
    process.exit(0);
  }
}

testApiRoute();
