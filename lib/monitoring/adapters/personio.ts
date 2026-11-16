import * as cheerio from 'cheerio';
import type { AdapterMatch, RawJob, SourceAdapter } from '../types';

/** Personio career sites (<company>.jobs.personio.de|com) publish an XML feed at /xml. */

const HOST = /^([a-z0-9-]+)\.jobs\.personio\.(de|com)$/i;

export const personioAdapter: SourceAdapter = {
  id: 'personio',
  label: 'Personio',
  kind: 'api',
  examples: ['https://acme.jobs.personio.de'],

  matchUrl(url): AdapterMatch | null {
    const match = HOST.exec(url.hostname);
    if (!match) return null;
    return { adapterId: 'personio', identifier: match[1].toLowerCase(), meta: { host: url.hostname.toLowerCase() } };
  },

  matchHtml(_url, html): AdapterMatch | null {
    const match = /https?:\/\/([a-z0-9-]+)\.jobs\.personio\.(de|com)/i.exec(html);
    if (!match) return null;
    return {
      adapterId: 'personio',
      identifier: match[1].toLowerCase(),
      meta: { host: `${match[1]}.jobs.personio.${match[2]}`.toLowerCase() },
    };
  },

  async fetchJobs({ match, http }) {
    const host = match.meta?.host ?? `${match.identifier}.jobs.personio.de`;
    const response = await http.getText(`https://${host}/xml?language=en`, {
      headers: { Accept: 'application/xml,text/xml' },
      maxBytes: 20 * 1024 * 1024,
    });

    const $ = cheerio.load(response.text, { xmlMode: true });
    const jobs: RawJob[] = [];

    $('position').each((_, element) => {
      const node = $(element);
      const text = (selector: string) => node.children(selector).first().text().trim() || null;
      const id = text('id');
      const title = text('name');
      if (!id || !title) return;

      const offices = [text('office'), ...node.find('additionalOffices > office').map((__, o) => $(o).text().trim()).get()].filter(Boolean);
      const description = node
        .find('jobDescriptions > jobDescription')
        .map((__, d) => `${$(d).children('name').text().trim()}\n${$(d).children('value').text().trim()}`)
        .get()
        .join('\n\n');

      jobs.push({
        externalId: id,
        title,
        url: `https://${host}/job/${id}`,
        location: offices.join('; ') || null,
        department: text('department'),
        jobType: [text('employmentType'), text('schedule')].filter(Boolean).join(', ') || null,
        description: description || null,
        postedAt: text('createdAt'),
        extra: { seniority: text('seniority'), recruitingCategory: text('recruitingCategory') },
      });
    });

    return { jobs, httpStatus: response.status };
  },
};
