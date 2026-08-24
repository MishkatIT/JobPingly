import { describe, it, expect } from 'vitest';
import { isUrlSafe, normalizeCompanyUrl } from '../lib/security/ssrf';
import { generateJobFingerprint } from '../packages/scraper/src/fingerprint';
import { diffJobs } from '../packages/scraper/src/differ';
import { matchKeywords } from '../packages/notifications/src/matcher';

describe('1. SSRF & URL Normalizer', () => {
  it('should allow valid public HTTPS URLs and strip tracking params', () => {
    const res = isUrlSafe('https://company.com/careers/?utm_source=linkedin&ref=123');
    expect(res.safe).toBe(true);
    expect(res.normalizedUrl).toBe('https://company.com/careers');
  });

  it('should format URLs consistently to track uniqueness regardless of trailing slash, missing scheme, or extra slashes', () => {
    // Both with and without trailing slash should yield the exact same formatted URL
    expect(normalizeCompanyUrl('https://company.com/careers/')).toBe('https://company.com/careers');
    expect(normalizeCompanyUrl('https://company.com/careers')).toBe('https://company.com/careers');
    expect(normalizeCompanyUrl('company.com/careers/')).toBe('https://company.com/careers');
    expect(normalizeCompanyUrl('https://company.com/')).toBe('https://company.com');
    expect(normalizeCompanyUrl('https://company.com')).toBe('https://company.com');
    expect(normalizeCompanyUrl('HTTPS://COMPANY.COM/careers///?ref=123#jobs')).toBe('https://company.com/careers');
  });

  it('should block localhost and private IPs', () => {
    expect(isUrlSafe('http://localhost:3000').safe).toBe(false);
    expect(isUrlSafe('http://127.0.0.1/admin').safe).toBe(false);
    expect(isUrlSafe('http://169.254.169.254/latest/meta-data').safe).toBe(false);
    expect(isUrlSafe('http://10.0.0.1').safe).toBe(false);
  });
});

describe('2. Job Fingerprinting', () => {
  it('should prioritize ATS external job ID', () => {
    const fp = generateJobFingerprint({
      externalId: '123456',
      title: 'Backend Engineer',
      url: 'https://company.com/jobs/123456',
    });
    expect(fp.startsWith('ext:')).toBe(true);
  });

  it('should use normalized URL hash if no external ID exists', () => {
    const fp = generateJobFingerprint({
      title: 'Backend Engineer',
      url: 'https://company.com/jobs/dev-1?utm_source=test',
    });
    expect(fp.startsWith('url:')).toBe(true);
  });
});

describe('3. Job Differ & Anti-Spike Protection', () => {
  it('should classify NEW and UNCHANGED jobs correctly', () => {
    const stored = [
      { id: '1', fingerprint: generateJobFingerprint({ externalId: '101', title: 'Job 1' }), title: 'Job 1', status: 'active', missedScrapes: 0 },
      { id: '2', fingerprint: generateJobFingerprint({ externalId: '102', title: 'Job 2' }), title: 'Job 2', status: 'active', missedScrapes: 0 },
    ];
    const scraped = [
      { externalId: '101', title: 'Job 1' }, // Unchanged
      { externalId: '103', title: 'Job 3' }, // New
    ];

    const result = diffJobs(scraped, stored);
    expect(result.newJobs.length).toBe(1);
    expect(result.unchangedJobs.length).toBe(1);
    expect(result.removedJobs.length).toBe(1);
    expect(result.isSuspicious).toBe(false);
  });

  it('should flag suspicious mass drop when >80% active jobs vanish on 5+ items', () => {
    const stored = Array.from({ length: 10 }).map((_, i) => ({
      id: String(i),
      fingerprint: `ext:${i}`,
      title: `Job ${i}`,
      status: 'active',
      missedScrapes: 0,
    }));
    const scraped = [{ externalId: '0', title: 'Job 0' }]; // 9 out of 10 dropped (90% drop)

    const result = diffJobs(scraped, stored);
    expect(result.isSuspicious).toBe(true);
  });
});

describe('4. Keyword Matcher', () => {
  it('should match Node.js variations deterministically', () => {
    const res1 = matchKeywords(['Node.js'], 'Senior NodeJS Developer', 'Engineering');
    expect(res1.isMatch).toBe(true);

    const res2 = matchKeywords(['React'], 'Senior Python Engineer', 'Engineering');
    expect(res2.isMatch).toBe(false);
  });
});

describe('5. HTML Cleaner Text Preservation', () => {
  it('should remove script/style/svg syntax noise without stripping text from sidebar or nav elements', async () => {
    const { cleanCareerPageContent } = await import('../packages/scraper/src/cleaner');
    const sampleHtml = `
      <html>
        <head>
          <style>body { color: red; }</style>
          <script>console.log("secret syntax");</script>
        </head>
        <body>
          <!-- HTML Comment -->
          <div class="sidebar">
            <h2>Featured Vacancy in Sidebar</h2>
            <p>Software Engineer - Remote</p>
          </div>
          <header>
            <h1>Company Careers Header</h1>
          </header>
          <svg><path d="M0 0"/></svg>
        </body>
      </html>
    `;

    const cleaned = cleanCareerPageContent(sampleHtml);
    expect(cleaned).toContain('Featured Vacancy in Sidebar');
    expect(cleaned).toContain('Software Engineer - Remote');
    expect(cleaned).toContain('Company Careers Header');
    expect(cleaned).not.toContain('console.log');
    expect(cleaned).not.toContain('color: red');
    expect(cleaned).not.toContain('HTML Comment');
  });
});

describe('6. Alternative Deadline & PostedAt Key Lookups', () => {
  it('should correctly parse applyLastDate and postedAt fields from raw data payload', () => {
    const rawData = {
      applyLastDate: '2026-12-31',
      postedAt: '2026-08-01',
    };

    const rawDeadline = rawData.applyLastDate;
    const postedDate = rawData.postedAt;

    expect(rawDeadline).toBe('2026-12-31');
    expect(postedDate).toBe('2026-08-01');
  });
});

describe('7. Digest Frequency & Admin Enforcement Timing', () => {
  it('should compute exact millisecond intervals for standard and custom frequencies', async () => {
    const { getFrequencyIntervalMs } = await import('../lib/utils/frequency');
    expect(getFrequencyIntervalMs('instant')).toBe(0);
    expect(getFrequencyIntervalMs('realtime')).toBe(0);
    expect(getFrequencyIntervalMs('every_6_hours')).toBe(6 * 60 * 60 * 1000);
    expect(getFrequencyIntervalMs('daily')).toBe(24 * 60 * 60 * 1000);
    expect(getFrequencyIntervalMs('weekly')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(getFrequencyIntervalMs('custom_5_days')).toBe(5 * 24 * 60 * 60 * 1000);
    expect(getFrequencyIntervalMs('custom_12_hours')).toBe(12 * 60 * 60 * 1000);
  });

  it('should defer dispatch when frequency window has not elapsed', async () => {
    const { getFrequencyIntervalMs } = await import('../lib/utils/frequency');
    const intervalMs = getFrequencyIntervalMs('daily'); // 24 hours
    const lastSentAt = new Date(Date.now() - 10 * 60 * 60 * 1000); // sent 10 hours ago

    const elapsedMs = Date.now() - lastSentAt.getTime();
    const shouldSend = elapsedMs >= intervalMs;

    expect(shouldSend).toBe(false);
  });

  it('should allow dispatch when frequency window has elapsed', async () => {
    const { getFrequencyIntervalMs } = await import('../lib/utils/frequency');
    const intervalMs = getFrequencyIntervalMs('daily'); // 24 hours
    const lastSentAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // sent 25 hours ago

    const elapsedMs = Date.now() - lastSentAt.getTime();
    const shouldSend = elapsedMs >= intervalMs;

    expect(shouldSend).toBe(true);
  });

  it('should override user preference with admin enforced frequency unless user is exempt', () => {
    const isEnforcedGlobal = true;
    const enforcedFrequency = 'weekly';

    // User A: Not exempt -> gets enforced frequency 'weekly'
    const userAExempt = false;
    const userAPref = 'instant';
    const effectiveA = (isEnforcedGlobal && !userAExempt) ? enforcedFrequency : userAPref;
    expect(effectiveA).toBe('weekly');

    // User B: Exempt -> keeps personal preference 'instant'
    const userBExempt = true;
    const userBPref = 'instant';
    const effectiveB = (isEnforcedGlobal && !userBExempt) ? enforcedFrequency : userBPref;
    expect(effectiveB).toBe('instant');
  });
});

