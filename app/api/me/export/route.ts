import { NextResponse } from 'next/server';
import { route } from '@/lib/api/route';
import { exportUserData } from '@/lib/users/service';

/** Downloads everything JobPingly stores about the account, as JSON. */
export const GET = route({ rateLimit: { name: 'me:export', limit: 10, windowSeconds: 3600, by: 'user' } }, async ({ user }) => {
  const data = await exportUserData(user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="jobpingly-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
