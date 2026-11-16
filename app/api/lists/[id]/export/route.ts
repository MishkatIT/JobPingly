import { NextResponse } from 'next/server';
import { idParams, route } from '@/lib/api/route';
import { listCompaniesOnList } from '@/lib/companies/service';
import { toCsv } from '@/lib/jobs/tracker';
import { requireListAccess } from '@/lib/lists/access';
import { slugify } from '@/lib/lists/service';

/** The list's companies as CSV, in a format the import accepts. */
export const GET = route({ auth: 'optional', params: idParams }, async ({ user, params }) => {
  const access = await requireListAccess(params.id, user?.id ?? null);
  const companies = await listCompaniesOnList(access.list.id);
  const csv = toCsv(
    ['URL', 'Company', 'Category', 'Open jobs', 'Status'],
    companies.map(company => [company.url, company.name, company.category, company.openJobs, company.healthLabel]),
  );
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slugify(access.list.name)}-companies.csv"`,
    },
  });
});
