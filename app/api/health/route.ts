import { NextRequest, NextResponse } from 'next/server';
import { GET as getSystemStatus } from '../admin/system-status/route';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Reuse the admin System & Health evaluator, but ask it for its redacted public result.
    const statusRequest = new NextRequest(new URL('/api/admin/system-status?health=true', req.url));
    const statusResponse = await getSystemStatus(statusRequest);
    const result = await statusResponse.json();

    return NextResponse.json({
      status: result.overallStatus || 'outage',
      summary: result.summary,
      services: result.services,
      checkedAt: result.timestamp || new Date().toISOString(),
    }, {
      status: statusResponse.ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch {
    return NextResponse.json({
      status: 'outage',
      checkedAt: new Date().toISOString(),
    }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  }
}
