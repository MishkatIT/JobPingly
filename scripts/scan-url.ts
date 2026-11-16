/**
 * Dry-run a career page through the monitoring engine without touching the
 * database. Useful for checking how a URL will be read before adding it, and
 * for debugging an adapter.
 *
 *   npm run scan:url -- https://boards.greenhouse.io/stripe
 *   npm run scan:url -- https://example.com/careers --adapter generic_html --json
 *   npm run scan:url -- https://example.com/careers --no-ai --no-robots
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd(), true);

async function main() {
  const args = process.argv.slice(2);
  const url = args.find(arg => !arg.startsWith('--'));
  if (!url) {
    console.error('Usage: npm run scan:url -- <career-page-url> [--adapter <id>] [--json] [--no-ai] [--no-robots]');
    process.exit(1);
  }
  const adapterIndex = args.indexOf('--adapter');
  const adapterOverride = adapterIndex !== -1 ? args[adapterIndex + 1] : null;

  const { checkUrlSyntax } = await import('../lib/security/ssrf');
  const { createHttpClient } = await import('../lib/monitoring/http');
  const { extractSource } = await import('../lib/monitoring/extract');
  const { normalizeJobs } = await import('../lib/monitoring/normalize');
  const { toScanError } = await import('../lib/monitoring/errors');
  const { adapterLabel } = await import('../lib/monitoring/adapters');

  const check = checkUrlSyntax(url);
  if (!check.safe) {
    console.error(`Rejected: ${check.reason}`);
    process.exit(1);
  }

  const http = createHttpClient();
  const started = Date.now();
  try {
    const extraction = await extractSource({
      url: check.normalizedUrl!,
      adapterOverride,
      allowAi: !args.includes('--no-ai'),
      respectRobots: !args.includes('--no-robots'),
      force: true,
      http,
    });
    const jobs = normalizeJobs(extraction.jobs, check.normalizedUrl!);

    if (args.includes('--json')) {
      console.log(JSON.stringify({ ...extraction, jobs }, null, 2));
      return;
    }

    console.log(`URL          ${check.normalizedUrl}`);
    console.log(`Adapter      ${adapterLabel(extraction.adapter)} (${extraction.kind})`);
    console.log(`Detection    url=${extraction.detection.fromUrl ?? '-'} html=${extraction.detection.fromHtml ?? '-'} override=${extraction.detection.override ?? '-'}`);
    console.log(`Company      ${extraction.companyName ?? '-'}`);
    console.log(`Requests     ${http.requestCount}   Duration ${Date.now() - started}ms   HTTP ${extraction.httpStatus ?? '-'}`);
    console.log(`Jobs         ${jobs.length} (${extraction.jobs.length} raw)${extraction.truncated ? '   INCOMPLETE RESULT' : ''}`);

    const count = (key: 'workplaceType' | 'employmentType' | 'seniority') =>
      Object.entries(jobs.reduce<Record<string, number>>((acc, job) => ({ ...acc, [job[key] ?? 'unknown']: (acc[job[key] ?? 'unknown'] ?? 0) + 1 }), {}))
        .map(([name, n]) => `${name}=${n}`)
        .join(' ');
    if (jobs.length > 0) {
      console.log(`Workplace    ${count('workplaceType')}`);
      console.log(`Employment   ${count('employmentType')}`);
      console.log(`Seniority    ${count('seniority')}`);
      console.log(`With desc    ${jobs.filter(job => job.description).length}   With salary ${jobs.filter(job => job.salaryText).length}   With posted date ${jobs.filter(job => job.postedAt).length}`);
      console.log('');
      for (const job of jobs.slice(0, 8)) {
        console.log(`- ${job.title}`);
        console.log(`    ${[job.location, job.department, job.jobType, job.salaryText].filter(Boolean).join(' | ') || '(no details)'}`);
        console.log(`    ${job.url ?? '(no url)'}   [${job.keys.primary.split(':')[0]}]`);
      }
      if (jobs.length > 8) console.log(`... and ${jobs.length - 8} more`);
    }
  } catch (error) {
    const scanError = toScanError(error);
    console.error(`FAILED  class=${scanError.errorClass}  http=${scanError.httpStatus ?? '-'}  retryable=${scanError.retryable}`);
    console.error(`        ${scanError.message}`);
    process.exitCode = 2;
  }
}

main().then(() => process.exit(process.exitCode ?? 0));
