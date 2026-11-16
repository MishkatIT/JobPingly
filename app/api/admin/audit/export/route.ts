import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route, searchString } from '@/lib/api/route';
import { actorOf, recordAudit } from '@/lib/audit';
import { auditCsv } from '@/lib/admin/operations';

const query = z.object({
  action: z.string().max(60).optional(),
  actor: searchString,
  targetType: z.string().max(30).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** Up to 10,000 audit entries as CSV. The export itself is recorded in the audit log. */
export const GET = route({ permission: 'data.export', query }, async ({ req, user, query }) => {
  const csv = await auditCsv({ ...query, page: 1, pageSize: 10_000 });
  await recordAudit({ action: 'data.export', actor: actorOf(user), targetType: 'audit_log', metadata: { filters: query }, req });
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="jobpingly-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
