import { z } from 'zod';
import { errors } from '@/lib/api/errors';
import { idParams, route } from '@/lib/api/route';
import { importCompanies, type AddCompanyInput } from '@/lib/companies/service';
import { requireListAccess } from '@/lib/lists/access';

const body = z.object({
  /** One URL per line, or CSV rows of `url,company name,category`. */
  text: z.string().min(1).max(200_000),
});

function parseImport(text: string): AddCompanyInput[] {
  const entries: AddCompanyInput[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const cells = line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''));
    // Skip a header row from an exported CSV.
    if (/^(url|career page|careers url)$/i.test(cells[0])) continue;
    const urlCell = cells.find(cell => /^(https?:\/\/|[a-z0-9-]+\.[a-z]{2,})/i.test(cell));
    if (!urlCell) continue;
    const others = cells.filter(cell => cell !== urlCell);
    entries.push({ url: urlCell, companyName: others[0] || null, category: others[1] || null });
  }
  return entries;
}

/** Adds many companies at once. Each line is checked like a single add; failures are reported, not fatal. */
export const POST = route(
  { params: idParams, body, maxBodyBytes: 250 * 1024, rateLimit: { name: 'lists:import', limit: 10, windowSeconds: 3600, by: 'user' } },
  async ({ user, params, body }) => {
    const access = await requireListAccess(params.id, user.id);
    const entries = parseImport(body.text);
    if (entries.length === 0) throw errors.validation([{ field: 'text', message: 'No careers page addresses were found in that text.' }]);
    if (entries.length > 200) throw errors.validation([{ field: 'text', message: 'Import at most 200 companies at a time.' }]);
    return importCompanies(access, user.id, entries);
  },
);
