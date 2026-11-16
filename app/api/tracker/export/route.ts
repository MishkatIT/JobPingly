import { NextResponse } from 'next/server';
import { route } from '@/lib/api/route';
import { trackerCsv } from '@/lib/jobs/tracker';

export const GET = route({ rateLimit: { name: 'tracker:export', limit: 20, windowSeconds: 3600, by: 'user' } }, async ({ user }) => {
  return new NextResponse(await trackerCsv(user.id), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="jobpingly-applications-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
