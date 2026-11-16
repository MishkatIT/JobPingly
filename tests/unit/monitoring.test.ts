import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, test } from 'node:test';
import { detectFromHtml, detectFromUrl } from '@/lib/monitoring/adapters';
import { extractEmbeddedJsonJobs, extractGenericHtmlJobs, extractJsonLdJobs } from '@/lib/monitoring/adapters/html';
import { classifyEmployment, classifySeniority, classifyWorkplace, parseDate, parseSalary } from '@/lib/monitoring/classify';
import { diffJobs, type StoredJob } from '@/lib/monitoring/differ';
import { ScanError } from '@/lib/monitoring/errors';
import { extractSource } from '@/lib/monitoring/extract';
import { buildJobKeys, canonicalJobUrl, externalIdKey, urlKey } from '@/lib/monitoring/fingerprint';
import { normalizeJob, normalizeJobs } from '@/lib/monitoring/normalize';
import { isPathAllowed, parseRobots } from '@/lib/monitoring/robots';
import { fakeWeb } from '../helpers/fake-http';

describe('Job identity', () => {
  // The pre-v2 implementation, kept here to prove stored keys still match.
  const legacyHash = (input: string) => crypto.createHash('sha256').update(input.toLowerCase().trim()).digest('hex').substring(0, 24);

  test('external-id keys are byte-compatible with v1', () => {
    assert.equal(externalIdKey('4012345'), `ext:${legacyHash('|4012345')}`);
  });
  test('URL keys are byte-compatible with v1 for ordinary URLs', () => {
    const url = 'https://boards.greenhouse.io/acme/jobs/123';
    assert.equal(urlKey(url, 'https://boards.greenhouse.io/acme'), `url:${legacyHash(url)}`);
  });
  test('links back to the listing page identify nothing', () => {
    assert.equal(canonicalJobUrl('https://acme.com/careers/', 'https://acme.com/careers'), null);
    assert.equal(canonicalJobUrl('https://acme.com/', 'https://acme.com/careers'), null);
    assert.equal(canonicalJobUrl('javascript:void(0)', 'https://acme.com/careers'), null);
  });
  test('tracking parameters do not change identity', () => {
    assert.equal(
      canonicalJobUrl('https://acme.com/jobs/1?utm_source=x&gh_src=y&lever-source=z', null),
      'https://acme.com/jobs/1',
    );
  });
  test('strongest key wins', () => {
    assert.match(buildJobKeys({ externalId: '9', url: 'https://a.com/jobs/9', title: 'Dev' }).primary, /^ext:/);
    assert.match(buildJobKeys({ url: 'https://a.com/jobs/9', title: 'Dev' }).primary, /^url:/);
    assert.match(buildJobKeys({ title: 'Dev', location: 'Dhaka' }).primary, /^tl:/);
  });
});

describe('Normalisation and classification', () => {
  test('rejects navigation text and unsafe links', () => {
    assert.equal(normalizeJob({ title: 'Careers' }, 'https://acme.com'), null);
    const job = normalizeJob({ title: 'Data Engineer', url: 'javascript:alert(1)' }, 'https://acme.com/careers');
    assert.equal(job?.url, null);
  });
  test('resolves relative URLs', () => {
    assert.equal(normalizeJob({ title: 'Data Engineer', url: '/jobs/7' }, 'https://acme.com/careers')?.url, 'https://acme.com/jobs/7');
  });
  test('deduplicates within one scan', () => {
    assert.equal(normalizeJobs([{ title: 'Dev', externalId: '1' }, { title: 'Dev', externalId: '1' }], 'https://a.com').length, 1);
  });
  test('workplace', () => {
    assert.equal(classifyWorkplace('Remote - Europe'), 'remote');
    assert.equal(classifyWorkplace('Hybrid, Dhaka'), 'hybrid');
    assert.equal(classifyWorkplace('Dhaka'), null);
  });
  test('employment', () => {
    assert.equal(classifyEmployment('Full-time'), 'full_time');
    assert.equal(classifyEmployment('Contractor'), 'contract');
    assert.equal(classifyEmployment('Summer Internship 2027'), 'internship');
  });
  test('seniority does not treat every manager as a lead', () => {
    assert.equal(classifySeniority('Senior Software Engineer'), 'senior');
    assert.equal(classifySeniority('Staff Engineer'), 'lead');
    assert.equal(classifySeniority('Account Manager'), null);
    assert.equal(classifySeniority('Junior Developer'), 'junior');
    assert.equal(classifySeniority('VP of Engineering'), 'executive');
  });
  test('salary parsing', () => {
    assert.deepEqual(parseSalary('$120k - $150k'), { text: '$120k - $150k', min: 120000, max: 150000, currency: 'USD' });
    const bdt = parseSalary('BDT 50,000-70,000 per month');
    assert.equal(bdt.currency, 'BDT');
    assert.equal(bdt.min, 50000);
    assert.equal(bdt.max, 70000);
    assert.equal(parseSalary('Negotiable').min, null);
  });
  test('dates', () => {
    assert.equal(parseDate('2026-11-01')?.toISOString().slice(0, 10), '2026-11-01');
    assert.equal(parseDate(1793534400)?.getUTCFullYear(), 2026);
    assert.equal(parseDate('1970-01-01'), null);
    assert.equal(parseDate('not a date'), null);
  });
});

describe('Diffing a scan against stored jobs', () => {
  const stored = (overrides: Partial<StoredJob> & { title: string }): StoredJob => ({
    id: crypto.randomUUID(),
    fingerprint: '',
    externalId: null,
    url: null,
    location: null,
    status: 'active',
    missedScrapes: 0,
    contentHash: null,
    hiddenAt: null,
    closedAt: null,
    ...overrides,
  });

  test('new, matched and missing', () => {
    const page = 'https://acme.com/careers';
    const scraped = normalizeJobs([{ title: 'Accountant', externalId: '1' }, { title: 'Copywriter', externalId: '3' }], page);
    const existing = [
      stored({ title: 'Accountant', externalId: '1', fingerprint: scraped[0].keys.primary }),
      stored({ title: 'Barista', externalId: '2', fingerprint: buildJobKeys({ externalId: '2', title: 'Barista' }).primary }),
    ];
    const diff = diffJobs(scraped, existing, { pageUrl: page });
    assert.equal(diff.newJobs.length, 1);
    assert.equal(diff.matched.length, 1);
    assert.equal(diff.missing.length, 1);
    assert.equal(diff.isSuspicious, false);
  });

  test('a job keeps its identity when its id changes but its URL does not', () => {
    const page = 'https://acme.com/careers';
    const [scraped] = normalizeJobs([{ title: 'Engineer', externalId: 'NEW-ID', url: 'https://acme.com/jobs/engineer' }], page);
    const existing = stored({ title: 'Engineer', externalId: 'OLD-ID', url: 'https://acme.com/jobs/engineer', fingerprint: 'ext:old' });
    const diff = diffJobs([scraped], [existing], { pageUrl: page });
    assert.equal(diff.newJobs.length, 0);
    assert.equal(diff.matched[0].matchedBy, 'url');
  });

  test('a job moved to another ATS is recognised by title and location', () => {
    const [scraped] = normalizeJobs([{ title: 'Product Designer', location: 'Dhaka', externalId: 'ashby-1' }], 'https://jobs.ashbyhq.com/acme');
    const existing = stored({ title: 'Product Designer', location: 'Dhaka', fingerprint: 'ext:greenhouse', externalId: 'gh-1', url: 'https://boards.greenhouse.io/acme/jobs/1' });
    const diff = diffJobs([scraped], [existing]);
    assert.equal(diff.matched[0]?.matchedBy, 'title_location');
  });

  test('two identical titles in one location are not merged', () => {
    const scraped = normalizeJobs(
      [
        { title: 'Software Engineer', location: 'Dhaka', externalId: 'a' },
        { title: 'Software Engineer', location: 'Dhaka', externalId: 'b' },
      ],
      'https://x.com',
    );
    const existing = stored({ title: 'Software Engineer', location: 'Dhaka', fingerprint: 'ext:zzz' });
    const diff = diffJobs(scraped, [existing]);
    assert.equal(diff.newJobs.length, 2);
    assert.equal(diff.missing.length, 1);
  });

  test('a mass disappearance is flagged as suspicious', () => {
    const existing = Array.from({ length: 10 }, (_, index) => stored({ title: `Job ${index}`, fingerprint: `ext:${index}` }));
    const diff = diffJobs([], existing);
    assert.equal(diff.isSuspicious, true);
  });
});

describe('robots.txt', () => {
  const robots = `
User-agent: *
Disallow: /private/
Allow: /private/careers
Disallow: /*.pdf$

User-agent: JobPinglyBot
Disallow: /nojobpingly/
`;
  test('the bot-specific group wins over *', () => {
    const { rules } = parseRobots(robots);
    assert.equal(isPathAllowed(rules, '/nojobpingly/careers'), false);
    assert.equal(isPathAllowed(rules, '/private/x'), true);
  });
  test('longest match wins; wildcards and anchors', () => {
    const { rules } = parseRobots('User-agent: *\nDisallow: /private/\nAllow: /private/careers\nDisallow: /*.pdf$');
    assert.equal(isPathAllowed(rules, '/private/careers/jobs'), true);
    assert.equal(isPathAllowed(rules, '/private/other'), false);
    assert.equal(isPathAllowed(rules, '/files/job.pdf'), false);
    assert.equal(isPathAllowed(rules, '/files/job.pdf?x=1'), true);
  });
  test('an empty Disallow allows everything', () => {
    assert.equal(isPathAllowed(parseRobots('User-agent: *\nDisallow:').rules, '/anything'), true);
  });
});

describe('Page extractors', () => {
  test('schema.org JobPosting', () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'JobPosting',
          title: 'QA Engineer',
          url: 'https://acme.com/jobs/qa',
          identifier: { '@type': 'PropertyValue', value: 'QA-1' },
          employmentType: 'FULL_TIME',
          jobLocationType: 'TELECOMMUTE',
          datePosted: '2026-11-01',
          validThrough: '2026-12-01',
          baseSalary: { '@type': 'MonetaryAmount', currency: 'BDT', value: { '@type': 'QuantitativeValue', minValue: 60000, maxValue: 90000, unitText: 'MONTH' } },
          jobLocation: { '@type': 'Place', address: { addressLocality: 'Dhaka', addressCountry: 'BD' } },
        },
      ],
    })}</script></head><body></body></html>`;
    const [job] = extractJsonLdJobs(html, 'https://acme.com/careers');
    assert.equal(job.title, 'QA Engineer');
    assert.equal(job.externalId, 'QA-1');
    assert.equal(job.workplaceType, 'remote');
    assert.equal(job.salaryMin, 60000);
    assert.equal(job.location, 'Dhaka, BD');
  });

  test('embedded Next.js page data', () => {
    const data = { props: { pageProps: { openings: [
      { id: 11, title: 'Backend Engineer', location: 'Dhaka', department: 'Engineering', slug: 'backend-engineer' },
      { id: 12, title: 'Recruiter', location: 'Remote', department: 'People', slug: 'recruiter' },
    ], nav: [{ title: 'About', href: '/about' }] } } };
    const html = `<html><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
    const jobs = extractEmbeddedJsonJobs(html, 'https://acme.com/careers');
    assert.deepEqual(jobs.map(job => job.title), ['Backend Engineer', 'Recruiter']);
    assert.equal(jobs[0].externalId, '11');
  });

  test('generic HTML: apply buttons take the card heading, closed postings are skipped', () => {
    const html = `
      <html><body>
        <nav><a href="/jobs/all">All jobs</a></nav>
        <section class="opening"><h3>Product Manager</h3><p>Dhaka</p><a class="btn" href="https://ats.example.com/jobs/product-manager-1313dcb9">Apply Now</a></section>
        <section class="opening"><h3>Cloud Security Engineer</h3><a class="btn" href="https://ats.example.com/jobs/cloud-security-engineer-61b4499d">Apply Now</a></section>
        <section class="opening"><h3>Trainee Engineer</h3><a href="https://ats.example.com/jobs/trainee-engineer-0f9902ff">Closed</a></section>
        <ul><li class="job"><a href="/careers/data-analyst"><h4>Data Analyst</h4></a><span class="location">Chattogram</span></li></ul>
      </body></html>`;
    const jobs = extractGenericHtmlJobs(html, 'https://acme.com/careers');
    assert.deepEqual(jobs.map(job => job.title), ['Product Manager', 'Cloud Security Engineer', 'Data Analyst']);
    assert.equal(jobs[2].location, 'Chattogram');
  });
});

describe('ATS detection', () => {
  test('from URLs', () => {
    assert.equal(detectFromUrl('https://boards.greenhouse.io/stripe')?.identifier, 'stripe');
    assert.equal(detectFromUrl('https://job-boards.greenhouse.io/anthropic')?.adapterId, 'greenhouse');
    assert.equal(detectFromUrl('https://jobs.lever.co/netflix')?.identifier, 'netflix');
    assert.equal(detectFromUrl('https://jobs.ashbyhq.com/linear')?.identifier, 'linear');
    assert.equal(detectFromUrl('https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite')?.identifier, 'nvidia/NVIDIAExternalCareerSite');
    assert.equal(detectFromUrl('https://acme.pinpointhq.com')?.adapterId, 'pinpoint');
    assert.equal(detectFromUrl('https://acme.com/careers'), null);
  });
  test('from an embedded board on a company site', () => {
    const html = '<script src="https://boards.greenhouse.io/embed/job_board/js?for=acme"></script>';
    assert.equal(detectFromHtml('https://acme.com/careers', html)?.identifier, 'acme');
  });
});

describe('Extraction end to end (fake web)', () => {
  test('Greenhouse is read through its API without fetching the page', async () => {
    const web = fakeWeb({
      'https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true': {
        json: { jobs: [{ id: 1, title: 'Engineer', absolute_url: 'https://boards.greenhouse.io/acme/jobs/1', location: { name: 'Remote' }, content: '&lt;p&gt;Hi&lt;/p&gt;' }] },
      },
    });
    const result = await extractSource({ url: 'https://boards.greenhouse.io/acme', allowAi: false, respectRobots: true, http: web.client() });
    assert.equal(result.adapter, 'greenhouse');
    assert.equal(result.jobs.length, 1);
    assert.equal(web.requests.length, 1);
  });

  test('a missing Greenhouse board is reported as such', async () => {
    const web = fakeWeb({});
    await assert.rejects(
      extractSource({ url: 'https://boards.greenhouse.io/nope', allowAi: false, respectRobots: false, http: web.client() }),
      (error: unknown) => error instanceof ScanError && error.errorClass === 'not_found_on_ats',
    );
  });

  test('Lever paginates', async () => {
    const page = (start: number, count: number) => Array.from({ length: count }, (_, index) => ({ id: `id-${start + index}`, text: `Role ${start + index}`, categories: { location: 'Dhaka' } }));
    const web = fakeWeb({
      'https://api.lever.co/v0/postings/acme?mode=json&limit=100&skip=0': { json: page(0, 100) },
      'https://api.lever.co/v0/postings/acme?mode=json&limit=100&skip=100': { json: page(100, 20) },
    });
    const result = await extractSource({ url: 'https://jobs.lever.co/acme', allowAi: false, respectRobots: false, http: web.client() });
    assert.equal(result.jobs.length, 120);
    assert.equal(result.truncated, false);
  });

  test('a Workday failure part-way through is reported as incomplete, not as fewer jobs', async () => {
    let calls = 0;
    const web = fakeWeb({
      'https://acme.wd1.myworkdayjobs.com/wday/cxs/acme/Careers/jobs': () => {
        calls += 1;
        if (calls === 1) return { json: { total: 40, jobPostings: Array.from({ length: 20 }, (_, index) => ({ title: `Job ${index}`, externalPath: `/job/x/Job_${index}` })) } };
        return { status: 500, body: 'error' };
      },
    });
    const result = await extractSource({ url: 'https://acme.wd1.myworkdayjobs.com/Careers', allowAi: false, respectRobots: false, http: web.client() });
    assert.equal(result.jobs.length, 20);
    assert.equal(result.truncated, true);
  });

  test('robots.txt is honoured for company pages', async () => {
    const web = fakeWeb({ 'https://acme.com/robots.txt': { body: 'User-agent: *\nDisallow: /careers', headers: { 'content-type': 'text/plain' } } });
    await assert.rejects(
      extractSource({ url: 'https://acme.com/careers', allowAi: false, respectRobots: true, http: web.client() }),
      (error: unknown) => error instanceof ScanError && error.errorClass === 'robots_disallowed',
    );
  });

  test('a JavaScript-only shell is reported, not recorded as "no jobs"', async () => {
    const web = fakeWeb({ 'https://acme.com/careers': { body: '<html><body><div id="root"></div><script src="/app.js"></script></body></html>' } });
    await assert.rejects(
      extractSource({ url: 'https://acme.com/careers', allowAi: false, respectRobots: false, http: web.client() }),
      (error: unknown) => error instanceof ScanError && error.errorClass === 'js_rendered',
    );
  });

  test('a jobs endpoint referenced by the page is used', async () => {
    const web = fakeWeb({
      'https://acme.com/careers': { body: `<html><body><p>${'Join our team. '.repeat(30)}</p><script>fetch("/api/jobs")</script></body></html>` },
      'https://acme.com/api/jobs': { json: { data: [{ id: 'a', title: 'Android Developer', city: 'Dhaka' }] } },
    });
    const result = await extractSource({ url: 'https://acme.com/careers', allowAi: false, respectRobots: false, http: web.client() });
    assert.equal(result.adapter, 'json_feed');
    assert.equal(result.jobs[0].title, 'Android Developer');
  });

  test('a redirect to a private address is blocked', async () => {
    const web = fakeWeb({ 'https://acme.com/careers': { status: 302, body: '', headers: { location: 'http://metadata.internal-test.example/latest' } } });
    await assert.rejects(
      extractSource({ url: 'https://acme.com/careers', allowAi: false, respectRobots: false, http: web.client() }),
      (error: unknown) => error instanceof ScanError && error.errorClass === 'unsafe_url',
    );
  });

  test('bot-protection pages are classified', async () => {
    const web = fakeWeb({ 'https://acme.com/careers': { status: 403, body: '<title>Just a moment...</title>' } });
    await assert.rejects(
      extractSource({ url: 'https://acme.com/careers', allowAi: false, respectRobots: false, http: web.client() }),
      (error: unknown) => error instanceof ScanError && error.errorClass === 'blocked',
    );
  });

  test('transient server errors are retried', async () => {
    let calls = 0;
    const web = fakeWeb({
      'https://boards-api.greenhouse.io/v1/boards/flaky/jobs?content=true': () => {
        calls += 1;
        return calls < 2 ? { status: 503, body: 'busy' } : { json: { jobs: [] } };
      },
    });
    const result = await extractSource({ url: 'https://boards.greenhouse.io/flaky', allowAi: false, respectRobots: false, http: web.client() });
    assert.equal(result.jobs.length, 0);
    assert.equal(calls, 2);
  });
});
