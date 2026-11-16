import type { AdapterMatch, RawJob, SourceAdapter } from '../types';

/** BambooHR hosted career pages (<company>.bamboohr.com/careers) expose /careers/list as JSON. */

interface BambooJob {
  id: string | number;
  jobOpeningName?: string;
  departmentLabel?: string;
  employmentStatusLabel?: string;
  isRemote?: boolean | null;
  locationType?: string;
  location?: { city?: string; state?: string };
  atsLocation?: { city?: string; state?: string; country?: string };
}

export const bambooHrAdapter: SourceAdapter = {
  id: 'bamboohr',
  label: 'BambooHR',
  kind: 'api',
  examples: ['https://acme.bamboohr.com/careers'],

  matchUrl(url): AdapterMatch | null {
    const host = url.hostname.toLowerCase();
    if (!host.endsWith('.bamboohr.com') || ['www', 'api', 'app'].includes(host.split('.')[0])) return null;
    return { adapterId: 'bamboohr', identifier: host.split('.')[0], meta: { host } };
  },

  matchHtml(_url, html): AdapterMatch | null {
    const match = /https?:\/\/([a-z0-9-]+)\.bamboohr\.com\/(?:careers|jobs)/i.exec(html);
    if (!match || ['www', 'api', 'app'].includes(match[1].toLowerCase())) return null;
    return { adapterId: 'bamboohr', identifier: match[1], meta: { host: `${match[1].toLowerCase()}.bamboohr.com` } };
  },

  async fetchJobs({ match, http }) {
    const host = match.meta?.host ?? `${match.identifier}.bamboohr.com`;
    const { data, response } = await http.getJson<{ result?: BambooJob[] }>(`https://${host}/careers/list`);

    const jobs: RawJob[] = (data.result ?? [])
      .filter(job => job.jobOpeningName)
      .map(job => {
        const loc = job.atsLocation ?? job.location;
        const country = job.atsLocation?.country;
        return {
          externalId: String(job.id),
          title: job.jobOpeningName!,
          url: `https://${host}/careers/${job.id}`,
          location: [loc?.city, loc?.state, country].filter(Boolean).join(', ') || null,
          department: job.departmentLabel ?? null,
          jobType: job.employmentStatusLabel ?? null,
          // locationType: "0" on-site, "1" remote, "2" hybrid
          workplaceType: job.isRemote || job.locationType === '1' ? 'remote' : job.locationType === '2' ? 'hybrid' : null,
        };
      });

    return { jobs, httpStatus: response.status };
  },
};
